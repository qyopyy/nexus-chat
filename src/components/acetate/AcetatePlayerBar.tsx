"use client";

import { useEffect, useRef } from "react";
import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { updateMyProfile } from "@/lib/data";
import { fmtTime } from "@/lib/acetateAudio";
import { useAcetatePlayer } from "@/lib/acetatePlayer";
import { useApp } from "@/store/app";
import { Waveform } from "./AcetateBits";

/** Persistent player for the signed-in Acetate library. Also publishes Nexus "listening to". */
export default function AcetatePlayerBar() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const queue = useAcetatePlayer((s) => s.queue);
  const index = useAcetatePlayer((s) => s.index);
  const playing = useAcetatePlayer((s) => s.playing);
  const current = useAcetatePlayer((s) => s.current);
  const seekTo = useAcetatePlayer((s) => s.seekTo);
  const item = queue[index] ?? null;
  const duration = item ? item.duration || audioRef.current?.duration || 0 : 0;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!item) {
      audio.pause();
      audio.removeAttribute("src");
      return;
    }
    if (audio.getAttribute("data-key") !== item.key) {
      audio.src = item.url;
      audio.setAttribute("data-key", item.key);
    }
    if (playing) {
      void audio.play().catch(() => useAcetatePlayer.getState().setPlaying(false));
    } else {
      audio.pause();
    }
  }, [item, playing]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || seekTo == null) return;
    audio.currentTime = seekTo;
    useAcetatePlayer.getState().clearSeek();
  }, [seekTo]);

  useEffect(() => {
    const userId = useApp.getState().userId;
    if (!userId) return;
    if (!playing || !item) {
      const np = useApp.getState().profiles[userId]?.now_playing;
      if (np?.source === "acetate") void updateMyProfile({ now_playing: null }, true);
      return;
    }
    const push = () => {
      const at = useAcetatePlayer.getState().current;
      void updateMyProfile(
        {
          now_playing: {
            title: item.title,
            artist: item.artist || "Acetate",
            album: item.album,
            url: item.shareUrl || `${window.location.origin}/acetate/app`,
            image: item.artUrl,
            at: new Date().toISOString(),
            source: "acetate",
            progress_ms: Math.round(at * 1000),
            duration_ms: item.duration ? Math.round(item.duration * 1000) : undefined,
          },
        },
        true,
      );
    };
    push();
    const timer = window.setInterval(push, 20000);
    return () => window.clearInterval(timer);
  }, [playing, item]);

  if (!item) return <audio ref={audioRef} preload="none" className="hidden" />;

  return (
    <div className="border-t border-[#3c342c] bg-[#1a1612]/95 px-3 pt-2 pb-safe-3 backdrop-blur">
      <audio
        ref={audioRef}
        preload="metadata"
        onTimeUpdate={(e) => useAcetatePlayer.getState().setCurrent(e.currentTarget.currentTime)}
        onEnded={() => useAcetatePlayer.getState().next()}
      />
      <Waveform
        peaks={item.peaks}
        progress={duration ? current / duration : 0}
        onSeek={(ratio) => useAcetatePlayer.getState().seek(ratio * (duration || item.duration || 0))}
      />
      <div className="mt-1 flex items-center gap-3">
        {item.artUrl ? (
          <img src={item.artUrl} alt="" className="size-11 rounded-lg object-cover" />
        ) : (
          <span className="grid size-11 place-items-center rounded-lg bg-[#2a241c] font-serif text-[#e4a15a]">{item.title.slice(0, 1)}</span>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{item.title}</div>
          <div className="truncate text-xs text-[#a3988c]">
            {item.versionLabel}
            {item.album ? ` · ${item.album}` : ""} · {fmtTime(current)} / {fmtTime(duration || item.duration)}
          </div>
        </div>
        <button type="button" aria-label="Previous" onClick={() => useAcetatePlayer.getState().prev()} className="grid size-9 place-items-center rounded-full hover:bg-white/5">
          <SkipBack className="size-4" />
        </button>
        <button
          type="button"
          aria-label={playing ? "Pause" : "Play"}
          onClick={() => useAcetatePlayer.getState().toggle()}
          className="grid size-11 place-items-center rounded-full bg-[#e4a15a] text-[#100e0c]"
        >
          {playing ? <Pause className="size-5" /> : <Play className="size-5 translate-x-px" />}
        </button>
        <button type="button" aria-label="Next" onClick={() => useAcetatePlayer.getState().next()} className="grid size-9 place-items-center rounded-full hover:bg-white/5">
          <SkipForward className="size-4" />
        </button>
      </div>
    </div>
  );
}
