"use client";

import { useEffect, useState } from "react";
import { Check, FileText, Loader2, X } from "lucide-react";
import { toast, useApp } from "@/store/app";
import { loadProfiles } from "@/lib/data";
import { fmtBytes } from "@/lib/protect";
import { acceptToDrive, dismissIncoming, previewUrl, startDrop, stopDrop, useDrop } from "@/lib/snapDropNet";

/** Standalone Snap app only (the full Nexus app already shows Drops in Phone Link). Accept keeps the file in your Nexus Drive. */
export default function SnapDropReceiver() {
  const userId = useApp((s) => s.userId);
  const bootstrapped = useApp((s) => s.bootstrapped);
  const profiles = useApp((s) => s.profiles);
  const list = useDrop((s) => s.incoming);
  const row = list[0];
  const [busy, setBusy] = useState(false);
  const [thumb, setThumb] = useState<string | null>(null);

  useEffect(() => {
    if (!userId || !bootstrapped) return;
    startDrop(userId);
    return () => stopDrop();
  }, [userId, bootstrapped]);

  const rowId = row?.id;
  const fromId = row?.from_user;
  useEffect(() => {
    setThumb(null);
    if (!row) return;
    if (fromId && !profiles[fromId]) void loadProfiles([fromId]);
    if (!/^(image|video)\//.test(row.mime ?? "")) return;
    let live = true;
    void previewUrl(row)
      .then((u) => live && setThumb(u))
      .catch(() => {});
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowId]);

  if (!row) return null;
  const from = profiles[row.from_user];
  const who = from?.display_name || from?.username || "Someone";
  const video = (row.mime ?? "").startsWith("video/");
  const image = (row.mime ?? "").startsWith("image/");

  const accept = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await acceptToDrive(row);
      toast("Saved to your Nexus Drive", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save it", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-x-3 z-[120] mx-auto max-w-sm rounded-3xl bg-[#14141c] p-3 text-white shadow-2xl ring-1 ring-white/15" style={{ bottom: "calc(env(safe-area-inset-bottom) + 16px)" }} role="dialog" aria-label="Nexus Drop">
      <div className="flex gap-3">
        <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-2xl bg-white/10">
          {thumb && video ? (
            <video src={thumb} muted playsInline preload="metadata" className="size-full object-cover" />
          ) : thumb && image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb} alt="" className="size-full object-cover" />
          ) : (
            <FileText className="size-7 text-white/60" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-300">Nexus Drop{list.length > 1 ? ` · ${list.length} waiting` : ""}</p>
          <p className="truncate text-sm font-bold">{who} sent you {video ? "a video" : image ? "a photo" : "a file"}</p>
          <p className="truncate text-[11px] text-white/55">
            {row.name}
            {row.bytes ? ` · ${fmtBytes(row.bytes)}` : ""}
          </p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => dismissIncoming(row.id)} disabled={busy} className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-white/10 py-2.5 text-sm font-semibold hover:bg-white/20 disabled:opacity-50">
          <X className="size-4" /> Not now
        </button>
        <button type="button" onClick={() => void accept()} disabled={busy} className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-white py-2.5 text-sm font-bold text-black disabled:opacity-60">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Save to Drive
        </button>
      </div>
    </div>
  );
}
