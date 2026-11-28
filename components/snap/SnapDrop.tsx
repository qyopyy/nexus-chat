"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Monitor, Radar, Send, Share, Wifi } from "lucide-react";
import { toast, useApp } from "@/store/app";
import { loadProfiles } from "@/lib/data";
import type { VaultFile } from "@/lib/protect";
import type { SnapUser } from "@/lib/snapShare";
import { canShareFile, isShareCancel, statusLabel, type DropStatus } from "@/lib/snapDrop";
import { dropTo, setNearby, useDrop } from "@/lib/snapDropNet";
import { usePrefs } from "@/lib/snapPrefsStore";
import { Sheet } from "./SnapUi";

type Person = SnapUser & { avatar: string | null; near: boolean };

function Face({ p }: { p: Person }) {
  return p.avatar ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={p.avatar} alt="" className="size-10 shrink-0 rounded-full bg-white/10 object-cover" />
  ) : (
    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white/15 text-sm font-bold uppercase">{(p.display_name || p.username).slice(0, 1)}</span>
  );
}

/**
 * Nexus Drop: AirDrop-style sending. People near you who switched Nearby on, your recent chats, and the phone's own
 * share sheet (which is where real AirDrop lives). Everything is already in your Nexus Drive; people who aren't
 * around just get the link in chat.
 */
export default function SnapDrop({ file, expiry, getFile, onClose, z }: { file: VaultFile; expiry: number | null; getFile: () => Promise<File>; onClose: () => void; z?: string }) {
  const mins = usePrefs().nearbyMinutes;
  const nearbyOn = useDrop((s) => s.nearbyOn);
  const locating = useDrop((s) => s.locating);
  const error = useDrop((s) => s.error);
  const nearby = useDrop((s) => s.nearby);
  const chatList = useApp((s) => s.chatList);
  const profiles = useApp((s) => s.profiles);
  const [status, setStatus] = useState<Record<string, DropStatus>>({});
  const [local, setLocal] = useState<File | null>(null);

  const recentIds = useMemo(() => chatList.filter((c) => c.kind === "dm" && c.other_user_id).slice(0, 8).map((c) => c.other_user_id as string), [chatList]);
  useEffect(() => {
    const missing = recentIds.filter((id) => !profiles[id]);
    if (missing.length) void loadProfiles(missing);
  }, [recentIds, profiles]);

  // the share sheet must be opened straight from a tap, so the file is fetched ahead of time
  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = (tries: number) =>
      void getFile()
        .then((f) => live && setLocal(f))
        .catch(() => {
          if (live && tries > 0) timer = setTimeout(() => load(tries - 1), 1500);
        });
    load(3);
    return () => {
      live = false;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file.id]);

  const people: Person[] = useMemo(() => {
    const out: Person[] = nearby.map((n) => ({ id: n.id, username: n.username, display_name: n.name, avatar: n.avatar, near: true }));
    for (const id of recentIds) {
      const p = profiles[id];
      if (p && !out.some((o) => o.id === id)) out.push({ id, username: p.username, display_name: p.display_name || null, avatar: p.avatar_url ?? null, near: false });
    }
    return out;
  }, [nearby, recentIds, profiles]);

  /** `p` null = your own other screens (phone ↔ Mac ↔ iPad). */
  const send = async (key: string, p: Person | null) => {
    if (status[key] === "sending") return;
    setStatus((m) => ({ ...m, [key]: "sending" }));
    try {
      const f = local ?? (await getFile());
      const st = await dropTo(p ? { id: p.id, username: p.username, display_name: p.display_name } : null, f, file, expiry);
      setStatus((m) => ({ ...m, [key]: st }));
    } catch (e) {
      setStatus((m) => ({ ...m, [key]: "error" }));
      toast(e instanceof Error ? e.message : "Couldn't send", "error");
    }
  };

  const nativeShare = async () => {
    if (!local) return;
    try {
      await navigator.share({ files: [local], title: "Nexus Snap" });
    } catch (e) {
      if (!isShareCancel(e)) toast("Couldn't open the share sheet", "error");
    }
  };

  return (
    <Sheet title="Nexus Drop" onClose={onClose} z={z}>
      <div className="space-y-3 px-4 pb-3">
        <button
          type="button"
          role="switch"
          aria-checked={nearbyOn}
          onClick={() => void setNearby(!nearbyOn)}
          disabled={locating}
          className="flex w-full items-center gap-3 rounded-2xl bg-white/10 px-3 py-3 text-left hover:bg-white/15 disabled:opacity-60"
        >
          <span className={`relative grid size-10 shrink-0 place-items-center rounded-full ${nearbyOn ? "bg-emerald-400 text-black" : "bg-white/15"}`}>
            {nearbyOn && <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/50" />}
            {locating ? <Loader2 className="relative size-5 animate-spin" /> : <Radar className="relative size-5" />}
          </span>
          <span className="min-w-0 flex-1">
            <b className="block text-sm">{nearbyOn ? "Nearby is on" : "Find people nearby"}</b>
            <span className="block text-[11px] text-white/60">{nearbyOn ? `Others around you can see you and send to you for ${mins} minutes.` : `Uses your rough location (about 1 km) for ${mins} minutes. Nothing is stored.`}</span>
          </span>
          <span className={`h-6 w-11 shrink-0 rounded-full p-0.5 transition-colors ${nearbyOn ? "bg-emerald-400" : "bg-white/25"}`}>
            <span className={`block size-5 rounded-full bg-white transition-transform ${nearbyOn ? "translate-x-5" : ""}`} />
          </span>
        </button>
        {error && <p className="text-xs text-rose-300">{error}</p>}
        {nearbyOn && nearby.length === 0 && <p className="text-xs text-white/50">Looking… ask them to turn on Nearby too.</p>}
      </div>

      <div className="flex items-center gap-3 border-t border-white/10 px-4 py-2.5">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white/15">
          <Monitor className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <b className="block truncate text-sm">My other screens</b>
          <span className={`block truncate text-[11px] ${status.me === "error" ? "text-rose-300" : status.me === "sent" ? "text-emerald-300" : "text-white/55"}`}>{status.me === "sent" ? "In your Nexus Drop inbox ✓" : status.me === "sending" ? "Sending…" : "Mac, iPad, other phone"}</span>
        </span>
        <button type="button" onClick={() => void send("me", null)} disabled={status.me === "sending" || status.me === "sent"} aria-label="Send to my other screens" className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-black disabled:opacity-40">
          {status.me === "sending" ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
          {status.me === "error" ? "Again" : status.me === "sent" ? "Sent" : "Send"}
        </button>
      </div>

      {people.map((p) => {
        const st = status[p.id] ?? "idle";
        const label = statusLabel(st, p.display_name || p.username);
        const done = st === "sent" || st === "link";
        return (
          <div key={p.id} className="flex items-center gap-3 border-t border-white/10 px-4 py-2.5">
            <Face p={p} />
            <span className="min-w-0 flex-1">
              <b className="block truncate text-sm">{p.display_name || p.username}</b>
              <span className={`block truncate text-[11px] ${st === "error" ? "text-rose-300" : done ? "text-emerald-300" : "text-white/55"}`}>{label || `@${p.username}${p.near ? " · near you" : ""}`}</span>
            </span>
            <button
              type="button"
              onClick={() => void send(p.id, p)}
              disabled={st === "sending" || done}
              aria-label={`Send to ${p.username}`}
              className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-black disabled:opacity-40"
            >
              {st === "sending" ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
              {st === "error" ? "Again" : done ? "Sent" : "Send"}
            </button>
          </div>
        );
      })}
      {people.length === 0 && !nearbyOn && <p className="border-t border-white/10 px-4 py-3 text-xs text-white/50">No recent chats yet. Turn on Nearby, or use “To a user”.</p>}

      <div className="space-y-2 border-t border-white/10 px-4 pt-3">
        {canShareFile(typeof navigator === "undefined" ? undefined : navigator, local) && (
          <button type="button" onClick={() => void nativeShare()} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white/10 py-3 text-sm font-semibold hover:bg-white/20">
            <Share className="size-4" /> AirDrop / Share sheet
          </button>
        )}
        <a href="/drop/index.html" target="_blank" rel="noopener" className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white/10 py-3 text-sm font-semibold hover:bg-white/20">
          <Wifi className="size-4" /> Direct room (same Wi-Fi)
        </a>
        <p className="text-[11px] leading-snug text-white/50">Already saved in your Nexus Drive. If a Drop can&apos;t be delivered, it goes into their chat as a normal photo or video instead.</p>
      </div>
    </Sheet>
  );
}
