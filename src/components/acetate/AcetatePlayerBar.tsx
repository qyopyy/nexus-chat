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
  const eq = useAcetatePlayer((s) => s.eq);
  const eqOn = useAcetatePlayer((s) => s.eqOn);
  const crossfadeOn = useAcetatePlayer((s) => s.crossfade > 0);
  const filters = useRef<BiquadFilterNode[] | null>(null);
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
      const fade = useAcetatePlayer.getState().crossfade;
      const target = useAcetatePlayer.getState().volume;
      const resume = Number(localStorage.getItem(`acetate:pos:${item.versionId}`) || 0);
      audio.src = item.url;
      audio.setAttribute("data-key", item.key);
      if (resume > 1) audio.currentTime = resume;
      if (fade > 0) {
        audio.volume = 0;
        const started = performance.now();
        const step = () => {
          const p = Math.min(1, (performance.now() - started) / fade);
          audio.volume = target * p;
          if (p < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }
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
    if (useAcetatePlayer.getState().playing) void audio.play().catch(() => undefined);
  }, [seekTo]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.playbackRate = rate;
  }, [volume, rate, item]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || filters.current) return;
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const source = ctx.createMediaElementSource(audio);
    const freqs = [80, 250, 1000, 4000, 12000];
    const nodes = freqs.map((freq, i) => {
      const filter = ctx.createBiquadFilter();
      filter.type = i === 0 ? "lowshelf" : i === freqs.length - 1 ? "highshelf" : "peaking";
      filter.frequency.value = freq;
      filter.Q.value = 1;
      filter.gain.value = 0;
      return filter;
    });
    source.connect(nodes[0]);
    nodes.forEach((node, i) => {
      if (i < nodes.length - 1) node.connect(nodes[i + 1]);
    });
    nodes[nodes.length - 1].connect(ctx.destination);
    filters.current = nodes;
  }, [item]);

  useEffect(() => {
    filters.current?.forEach((filter, i) => {
      filter.gain.value = eqOn ? eq[i] || 0 : 0;
    });
  }, [eq, eqOn]);

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
      } else if (event.key === "j" || event.key === "J") {
        player.next();
      } else if (event.key === "k" || event.key === "K") {
        player.prev();
      } else if (event.key === "m" || event.key === "M") {
        player.setVolume(player.volume > 0 ? 0 : 1);
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
            image: null,
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
        <div className="mb-2">
        <div className="mb-1 flex justify-end">
          <button type="button" className="text-xs text-[#a3988c]" onClick={() => useAcetatePlayer.getState().clearQueue()}>Clear queue</button>
        </div>
        <ol className="max-h-36 space-y-1 overflow-y-auto">
          {queue.map((row, i) => (
            <li key={row.key} className={`flex items-center gap-2 rounded-lg px-2 py-1 text-sm ${i === index ? "bg-[#2a241c] text-[#e4a15a]" : ""}`}>
              <button type="button" onClick={() => useAcetatePlayer.getState().playAt(i)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                <span className="w-5 text-xs text-[#a3988c]">{i + 1}</span>
                <span className="truncate">{row.title}</span>
                <span className="ml-auto shrink-0 text-xs text-[#a3988c]">{row.versionLabel}</span>
              </button>
              <button type="button" className="text-xs text-[#d4653a]" onClick={() => useAcetatePlayer.getState().removeAt(i)}>
                Remove
              </button>
            </li>
          ))}
        </ol>
        </div>
      )}
      <audio
        ref={audioRef}
        preload="metadata"
        onTimeUpdate={(e) => {
          const player = useAcetatePlayer.getState();
          const t = e.currentTarget.currentTime;
          player.setCurrent(t);
          if (player.loopOn && player.loopA != null && player.loopB != null && t >= player.loopB) {
            player.seek(player.loopA);
          }
          if (player.sleepUntil && Date.now() >= player.sleepUntil) {
            player.setSleep(0);
            player.setPlaying(false);
          }
          if (item && Math.floor(t) % 5 === 0) {
            try {
              localStorage.setItem(`acetate:pos:${item.versionId}`, String(Math.floor(t)));
            } catch {
              /* private mode */
            }
          }
        }}
        onEnded={() => useAcetatePlayer.getState().next()}
      />
      {eqOn && (
        <div className="mb-1 grid grid-cols-5 gap-2">
          {["80", "250", "1k", "4k", "12k"].map((label, i) => (
            <label key={label} className="text-center text-[10px] text-[#a3988c]">
              <input
                type="range"
                min={-12}
                max={12}
                step={1}
                value={eq[i] || 0}
                aria-label={`${label} hertz`}
                onChange={(e) => useAcetatePlayer.getState().setEqBand(i, Number(e.target.value))}
                className="w-full accent-[#e4a15a]"
              />
              {label}
            </label>
          ))}
        </div>
      )}
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
            {duration > current ? ` · −${fmtTime(duration - current)}` : ""}
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
        <button type="button" onClick={() => useAcetatePlayer.getState().setCrossfade(useAcetatePlayer.getState().crossfade ? 0 : 800)} className={`rounded-full px-2 py-1 text-[11px] font-semibold ${crossfadeOn ? "text-[#e4a15a]" : "hover:bg-white/5"}`}>
          Fade
        </button>
        <button type="button" onClick={() => useAcetatePlayer.getState().toggleEq()} className={`rounded-full px-2 py-1 text-[11px] font-semibold ${eqOn ? "text-[#e4a15a]" : "hover:bg-white/5"}`}>
          EQ
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
