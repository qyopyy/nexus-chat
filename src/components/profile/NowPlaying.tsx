"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/store/app";
import { cn } from "@/lib/utils";
import type { NowPlaying } from "@/lib/types";

const GREEN = "#1DB954";

/** the track if it's still plausibly playing (server clears it within ~1 min after playback stops) */
export function liveNow(np: NowPlaying | null | undefined, now = Date.now()): NowPlaying | null {
  if (!np?.title || !np.at) return null;
  const age = now - new Date(np.at).getTime();
  if (age > 6 * 3600_000) return null;
  if (np.duration_ms && np.progress_ms != null && age > np.duration_ms - np.progress_ms + 120_000) return null;
  return np;
}

const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

function useTick(on: boolean) {
  const [, set] = useState(0);
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => set((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [on]);
}

export function SpotifyMark({ className }: { className?: string }) {
  // simple original glyph (green disc + sound bars), not the Spotify logo
  return (
    <span className={cn("inline-grid place-items-center rounded-full", className)} style={{ background: GREEN }}>
      <span className="flex h-[45%] items-end gap-[12%]">
        <span className="w-[3px] animate-[typeq_.9s_ease-in-out_infinite] rounded-full bg-black" style={{ height: "60%" }} />
        <span className="w-[3px] animate-[typeq_.9s_ease-in-out_.2s_infinite] rounded-full bg-black" style={{ height: "100%" }} />
        <span className="w-[3px] animate-[typeq_.9s_ease-in-out_.4s_infinite] rounded-full bg-black" style={{ height: "75%" }} />
      </span>
    </span>
  );
}

/** "Listening to Spotify" card with cover, track, artists, album and a live progress bar */
export function NowPlayingCard({ np, className }: { np: NowPlaying; className?: string }) {
  const acetate = np.source === "acetate";
  const tone = acetate ? "#e4a15a" : GREEN;
  const timed = !!np.duration_ms;
  useTick(timed);
  const elapsed = timed ? Math.min(np.duration_ms!, (np.progress_ms ?? 0) + (Date.now() - new Date(np.at).getTime())) : 0;
  const pct = timed ? (elapsed / np.duration_ms!) * 100 : 0;
  const artists = np.artists?.length ? np.artists : np.artist ? [{ name: np.artist, url: null }] : [];
  const year = np.release?.slice(0, 4);
  const kind = np.album_type === "single" ? "Single" : np.album_type === "compilation" ? "Compilation" : np.album_type === "podcast" ? "Podcast" : "Album";
  return (
    <div className={cn("overflow-hidden rounded-xl p-3 ring-1", className)} style={{ background: `linear-gradient(135deg, ${tone}26, ${tone}0d)`, borderColor: `${tone}40` }}>
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold tracking-wide uppercase" style={{ color: tone }}>
        {acetate ? <span className="size-2.5 rounded-full" style={{ background: tone }} /> : <SpotifyMark className="size-4" />} {acetate ? "Listening to Acetate" : "Listening to Spotify"}
      </div>
      <div className="flex gap-3">
        <a href={np.album_url ?? np.url ?? undefined} target="_blank" rel="noreferrer" className="relative shrink-0" title={np.album ?? undefined}>
          {np.image ? (
            <img src={np.image} alt={np.album ? `${np.album} cover` : "Album cover"} className="size-[72px] rounded-lg object-cover shadow-lg" />
          ) : (
            <span className="grid size-[72px] place-items-center rounded-lg text-2xl text-black" style={{ background: tone }}>
              ♫
            </span>
          )}
        </a>
        <div className="min-w-0 flex-1">
          <a href={np.url ?? undefined} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-bold hover:underline">
            <span className="truncate">{np.title}</span>
            {np.explicit && <span className="shrink-0 rounded-sm bg-white/25 px-1 text-[9px] leading-4 font-black">E</span>}
          </a>
          <div className="truncate text-sm text-sub">
            by{" "}
            {artists.map((a, i) => (
              <span key={i}>
                {i > 0 && ", "}
                {a.url ? (
                  <a href={a.url} target="_blank" rel="noreferrer" className="hover:text-txt hover:underline">
                    {a.name}
                  </a>
                ) : (
                  a.name
                )}
              </span>
            ))}
          </div>
          {np.album && (
            <div className="truncate text-xs text-sub">
              on{" "}
              <a href={np.album_url ?? undefined} target="_blank" rel="noreferrer" className="font-semibold text-txt/85 hover:underline">
                {np.album}
              </a>
              {(year || np.album_type) && <span className="opacity-70"> · {[kind, year].filter(Boolean).join(" · ")}</span>}
            </div>
          )}
        </div>
      </div>
      {timed && (
        <div className="mt-2.5 flex items-center gap-2 text-[11px] text-sub tabular-nums">
          <span>{mmss(elapsed)}</span>
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-black/30">
            <div className="h-full rounded-full transition-[width] duration-1000 ease-linear" style={{ width: `${pct}%`, background: tone }} />
          </div>
          <span>{mmss(np.duration_ms!)}</span>
        </div>
      )}
      {np.url && (
        <a href={np.url} target="_blank" rel="noreferrer" className="mt-2.5 block rounded-full py-1.5 text-center text-sm font-bold text-black transition hover:brightness-110" style={{ background: tone }}>
          {acetate ? "Open in Acetate" : "Play on Spotify"}
        </a>
      )}
    </div>
  );
}

/** one-line "Listening to …" for member lists, friends, DMs */
export function useListening(userId: string) {
  const np = useApp((s) => s.profiles[userId]?.now_playing);
  return liveNow(np);
}
export function ListeningLine({ np, className }: { np: NowPlaying; className?: string }) {
  const acetate = np.source === "acetate";
  return (
    <span className={cn("flex min-w-0 items-center gap-1", className)}>
      {acetate ? <span className="size-2 shrink-0 rounded-full bg-[#e4a15a]" /> : <SpotifyMark className="size-3 shrink-0" />}
      <span className="truncate">
        Listening to <b className="font-semibold text-txt/90">{np.title}</b>
        {np.artist ? ` · ${np.artist}` : ""}
      </span>
    </span>
  );
}

/** status line: "Listening to …" when a track is playing, otherwise the fallback text */
export function ActivityText({ userId, fallback }: { userId: string; fallback: React.ReactNode }) {
  const np = useListening(userId);
  return np ? <ListeningLine np={np} /> : <>{fallback}</>;
}
