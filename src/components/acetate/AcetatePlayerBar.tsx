"use client";

import { useEffect, useRef } from "react";
import { ListMusic, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward } from "lucide-react";
import { updateMyProfile } from "@/lib/data";
import { recordListen } from "@/lib/acetate";
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
  const repeat = useAcetatePlayer((s) => s.repeat);
  const shuffle = useAcetatePlayer((s) => s.shuffle);
  const volume = useAcetatePlayer((s) => s.volume);
  const rate = useAcetatePlayer((s) => s.rate);
  const queueOpen = useAcetatePlayer((s) => s.queueOpen);
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
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.playbackRate = rate;
  }, [volume, rate, item]);

  useEffect(() => {
    if (!playing || !item) return;
    void recordListen(item.trackId).catch(() => undefined);
  }, [playing, item]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (event.target as HTMLElement | null)?.isContentEditable) return;
      const player = useAcetatePlayer.getState();
      if (!player.queue.length) return;
      if (event.code === "Space") {
        event.preventDefault();
        player.toggle();
      } else if (event.code === "ArrowRight") {
        player.seek(player.current + 5);
      } else if (event.code === "ArrowLeft") {
        player.seek(Math.max(0, player.current - 5));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
      {queueOpen && (
        <ol className="mb-2 max-h-36 space-y-1 overflow-y-auto">
          {queue.map((row, i) => (
            <li key={row.key}>
              <button
                type="button"
                onClick={() => useAcetatePlayer.getState().playAt(i)}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-sm ${i === index ? "bg-[#2a241c] text-[#e4a15a]" : "hover:bg-white/5"}`}
              >
                <span className="w-5 text-xs text-[#a3988c]">{i + 1}</span>
                <span className="truncate">{row.title}</span>
                <span className="ml-auto shrink-0 text-xs text-[#a3988c]">{row.versionLabel}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
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
      <div className="mt-1 flex items-center gap-1 text-[#a3988c]">
        <button type="button" aria-label={shuffle ? "Shuffle on" : "Shuffle off"} aria-pressed={shuffle} onClick={() => useAcetatePlayer.getState().toggleShuffle()} className={`grid size-8 place-items-center rounded-full ${shuffle ? "text-[#e4a15a]" : "hover:bg-white/5"}`}>
          <Shuffle className="size-3.5" />
        </button>
        <button type="button" aria-label={`Repeat ${repeat}`} onClick={() => useAcetatePlayer.getState().cycleRepeat()} className={`grid size-8 place-items-center rounded-full ${repeat === "off" ? "hover:bg-white/5" : "text-[#e4a15a]"}`}>
          {repeat === "one" ? <Repeat1 className="size-3.5" /> : <Repeat className="size-3.5" />}
        </button>
        <button type="button" onClick={() => useAcetatePlayer.getState().cycleRate()} className="rounded-full px-2 py-1 text-[11px] font-semibold hover:bg-white/5">
          {rate}×
        </button>
        <label className="ml-1 flex min-w-0 flex-1 items-center gap-2 text-[11px]">
          <span className="sr-only">Volume</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            aria-label="Volume"
            onChange={(e) => useAcetatePlayer.getState().setVolume(Number(e.target.value))}
            className="w-full accent-[#e4a15a]"
          />
        </label>
        <button type="button" aria-label="Queue" aria-pressed={queueOpen} onClick={() => useAcetatePlayer.getState().toggleQueue()} className={`grid size-8 place-items-center rounded-full ${queueOpen ? "text-[#e4a15a]" : "hover:bg-white/5"}`}>
          <ListMusic className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
