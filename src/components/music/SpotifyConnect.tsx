"use client";

import { useEffect, useState } from "react";
import { toast } from "@/store/app";
import { connectSpotify, disconnectSpotify, setShare, startSpotifySync, useSpotifyUser } from "@/lib/spotifyUser";
import { cn } from "@/lib/utils";

/** Connect / disconnect your own Spotify account + "show what I'm listening to" toggle */
export default function SpotifyConnect({ compact }: { compact?: boolean }) {
  const connected = useSpotifyUser((s) => s.connected);
  const share = useSpotifyUser((s) => s.share);
  const me = useSpotifyUser((s) => s.me);
  const [busy, setBusy] = useState(false);
  useEffect(() => startSpotifySync(), []);

  if (!connected) {
    return (
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await connectSpotify();
          } catch (e) {
            toast((e as Error).message, "error");
            setBusy(false);
          }
        }}
        className={cn("flex items-center justify-center gap-2 rounded-full bg-[#1DB954] font-bold text-black hover:brightness-110 active:scale-[.98] disabled:opacity-60", compact ? "px-4 py-2 text-sm" : "w-full py-2.5")}
      >
        <span className="text-lg leading-none">◉</span> {busy ? "Opening Spotify…" : "Connect Spotify"}
      </button>
    );
  }
  return (
    <div className="space-y-2 rounded-xl bg-[#1DB954]/10 p-3 ring-1 ring-[#1DB954]/25">
      <div className="flex items-center gap-3">
        {me?.image ? <img src={me.image} alt="" className="size-9 rounded-full object-cover" /> : <span className="grid size-9 place-items-center rounded-full bg-[#1DB954] text-black">◉</span>}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{me?.name ?? "Spotify connected"}</div>
          <div className="text-xs text-sub">{me?.product === "premium" ? "Premium" : me?.product ? "Free" : "Connected"} · library unlocked in Music</div>
        </div>
        <button onClick={disconnectSpotify} className="text-xs text-sub hover:text-dnd">
          Disconnect
        </button>
      </div>
      <label className="flex cursor-pointer items-center justify-between gap-3 text-sm">
        <span>Show what I&apos;m listening to on my profile</span>
        <button
          type="button"
          role="switch"
          aria-checked={share}
          onClick={() => setShare(!share)}
          className={cn("relative h-6 w-10 shrink-0 rounded-full transition", share ? "bg-[#1DB954]" : "bg-faint")}
        >
          <span className={cn("absolute top-0.5 size-5 rounded-full bg-white transition-all", share ? "left-[18px]" : "left-0.5")} />
        </button>
      </label>
    </div>
  );
}
