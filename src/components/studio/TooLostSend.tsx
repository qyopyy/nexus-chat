"use client";

import { useEffect, useState } from "react";
import { Check, CircleAlert, Loader2, RefreshCw, Send } from "lucide-react";
import { toast } from "@/store/app";
import { deliverToTooLost, toolost, TooLostError, type DeliverStep } from "@/lib/toolost";
import { cn } from "@/lib/utils";
import type { DistRelease, DistTrack } from "@/lib/types";

const panel = "rounded-2xl bg-side p-3 ring-1 ring-line/60 sm:p-4";
const inp = "min-w-0 w-full rounded-lg bg-black/25 px-3 py-2 text-sm outline-none ring-1 ring-line/60 focus:ring-accent";

/** One-click delivery to Too Lost: draft → artwork → audio → credits → submit, then sync status / UPC / ISRCs back. */
export default function TooLostSend({ r, tracks, onDone }: { r: DistRelease; tracks: DistTrack[]; onDone: () => void }) {
  const [genres, setGenres] = useState<string[] | null>(null);
  const [genre, setGenre] = useState("");
  const [submit, setSubmit] = useState(true);
  const [steps, setSteps] = useState<DeliverStep[] | null>(null);
  const [busy, setBusy] = useState<"send" | "sync" | null>(null);
  const linked = r.distributor === "Too Lost" && /^\d+$/.test(r.distributor_ref ?? "");
  const sendable = ["in_review", "error", "sending", "approved", "pending"].includes(r.status) && tracks.length > 0 && tracks.every((t) => t.audio_path) && !!r.artwork_path;

  const loadGenres = async () => {
    if (genres) return;
    try {
      setGenres((await toolost<{ genres: string[] }>("genres")).genres);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const send = async () => {
    setBusy("send");
    try {
      await deliverToTooLost(r.id, tracks, { genre: genre || null, submit }, setSteps);
      toast(submit ? "Sent to Too Lost for review" : "Uploaded to Too Lost as a draft", "success");
      onDone();
    } catch (e) {
      const err = e as TooLostError;
      if (err.detail?.genres?.length) {
        setGenres(err.detail.genres);
        toast("Pick the Too Lost genre, then send again", "error");
      } else toast(err.message, "error");
    } finally {
      setBusy(null);
    }
  };
  const sync = async () => {
    setBusy("sync");
    try {
      const s = await toolost<{ toolost_status: string; upc: string | null; isrcs_updated: number }>("sync", { release_id: r.id });
      toast(`Too Lost: ${s.toolost_status.replace(/_/g, " ")}${s.upc ? ` · UPC ${s.upc}` : ""}${s.isrcs_updated ? ` · ${s.isrcs_updated} ISRC${s.isrcs_updated === 1 ? "" : "s"}` : ""}`, "success");
      onDone();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };
  useEffect(() => {
    if (linked && ["pending", "sending"].includes(r.status)) void toolost("sync", { release_id: r.id }).then(onDone, () => null); // quiet refresh on open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r.id]);

  return (
    <div className={panel}>
      <div className="mb-1 flex items-center gap-2 text-xs font-bold tracking-wide text-sub uppercase">
        <Send className="size-4 text-accent" /> Send to Too Lost
        {linked && <span className="ml-auto rounded-full bg-black/25 px-2 py-0.5 font-mono text-[11px] normal-case">#{r.distributor_ref}</span>}
      </div>
      <p className="mb-3 text-[12px] text-sub">Creates the release on your connected Too Lost account with this artwork, audio, credits and metadata{submit ? ", then submits it for review" : " as a draft"}. Status, UPC and ISRCs sync back here and the artist is messaged.</p>

      {!r.artwork_path && <p className="mb-2 text-[12px] text-idle">Needs artwork before it can be sent.</p>}
      {tracks.some((t) => !t.audio_path) && <p className="mb-2 text-[12px] text-idle">Every track needs audio before it can be sent.</p>}

      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <label className="text-[11px] text-sub">
          Too Lost genre <span className="opacity-70">(auto-matched from “{r.primary_genre}” if left blank)</span>
          <select value={genre} onFocus={() => void loadGenres()} onChange={(e) => setGenre(e.target.value)} className={cn(inp, "mt-0.5")}>
            <option value="">Auto</option>
            {(genres ?? []).map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </label>
        <label className="flex items-end gap-2 pb-2 text-[13px]">
          <input type="checkbox" checked={submit} onChange={(e) => setSubmit(e.target.checked)} /> Submit for review
        </label>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button disabled={!!busy || !sendable} onClick={() => void send()} className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {busy === "send" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} {linked && r.status !== "error" ? "Send again" : "Send to Too Lost"}
        </button>
        {linked && (
          <button disabled={!!busy} onClick={() => void sync()} className="flex items-center gap-2 rounded-lg bg-black/25 px-4 py-2 text-sm font-semibold ring-1 ring-line/60 disabled:opacity-50">
            {busy === "sync" ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Sync status
          </button>
        )}
      </div>

      {steps && (
        <ol className="mt-3 space-y-1.5">
          {steps.map((s, i) => (
            <li key={i} className="flex items-start gap-2 text-[13px]">
              <span className="mt-0.5 grid size-4 shrink-0 place-items-center">
                {s.state === "done" ? <Check className="size-4 text-ok" /> : s.state === "doing" ? <Loader2 className="size-4 animate-spin text-accent" /> : s.state === "error" ? <CircleAlert className="size-4 text-dnd" /> : <span className="size-1.5 rounded-full bg-sub/50" />}
              </span>
              <span className={cn(s.state === "todo" && "text-sub")}>
                {s.label}
                {s.note && <span className="block text-[12px] text-dnd">{s.note}</span>}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
