"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

const BARS = 36;
const cache = new Map<string, { peaks: number[]; duration: number }>();
let current: HTMLAudioElement | null = null;

function seeded(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return Array.from({ length: BARS }, (_, i) => {
    h = Math.imul(h ^ (h >>> 13), 1274126177) + i;
    return 0.25 + ((h >>> 0) % 1000) / 1400;
  });
}

async function analyse(url: string) {
  const hit = cache.get(url);
  if (hit) return hit;
  const buf = await (await fetch(url)).arrayBuffer();
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  try {
    const audio = await ctx.decodeAudioData(buf);
    const data = audio.getChannelData(0);
    const step = Math.floor(data.length / BARS) || 1;
    const peaks: number[] = [];
    for (let b = 0; b < BARS; b++) {
      let sum = 0;
      for (let i = b * step; i < (b + 1) * step && i < data.length; i += 16) sum += Math.abs(data[i]);
      peaks.push(sum / (step / 16));
    }
    const max = Math.max(...peaks, 0.0001);
    const res = { peaks: peaks.map((p) => Math.max(0.12, p / max)), duration: audio.duration };
    cache.set(url, res);
    return res;
  } finally {
    void ctx.close();
  }
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export default function VoicePlayer({ url, mine, seed }: { url: string; mine: boolean; seed: string }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [peaks, setPeaks] = useState<number[]>(() => cache.get(url)?.peaks ?? seeded(seed));
  const [duration, setDuration] = useState(cache.get(url)?.duration ?? 0);
  const [pos, setPos] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    analyse(url)
      .then((r) => {
        if (!alive) return;
        setPeaks(r.peaks);
        if (isFinite(r.duration)) setDuration(r.duration);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [url]);

  useEffect(() => () => audio.current?.pause(), []);

  function el() {
    if (!audio.current) {
      const a = new Audio(url);
      a.preload = "auto";
      a.ontimeupdate = () => setPos(a.currentTime);
      a.onloadedmetadata = () => isFinite(a.duration) && setDuration(a.duration);
      a.onended = () => {
        setPlaying(false);
        setPos(0);
      };
      a.onpause = () => setPlaying(false);
      a.onplay = () => setPlaying(true);
      audio.current = a;
    }
    return audio.current;
  }

  function toggle() {
    const a = el();
    haptic.light();
    if (a.paused) {
      if (current && current !== a) current.pause();
      current = a;
      a.playbackRate = rate;
      void a.play();
    } else a.pause();
  }

  function seek(clientX: number) {
    const r = bar.current?.getBoundingClientRect();
    if (!r || !duration) return;
    const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    const a = el();
    a.currentTime = f * duration;
    setPos(a.currentTime);
  }

  const progress = duration ? pos / duration : 0;
  const on = mine ? "bg-white" : "bg-accent";
  const off = mine ? "bg-white/35" : "bg-sub/45";

  return (
    <div className="flex w-[min(260px,62vw)] items-center gap-2.5 py-0.5">
      <button
        onClick={toggle}
        className={cn("grid size-10 shrink-0 place-items-center rounded-full transition active:scale-90", mine ? "bg-white text-bubble-me" : "bg-accent text-white")}
        aria-label={playing ? "Pause voice message" : "Play voice message"}
      >
        {playing ? <Pause className="size-[18px] fill-current" /> : <Play className="ml-0.5 size-[18px] fill-current" />}
      </button>
      <div className="min-w-0 flex-1">
        <div
          ref={bar}
          className="flex h-7 cursor-pointer touch-none items-center gap-[2px]"
          onPointerDown={(e) => {
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            seek(e.clientX);
          }}
          onPointerMove={(e) => e.buttons && seek(e.clientX)}
        >
          {peaks.map((p, i) => (
            <span key={i} className={cn("flex-1 rounded-full transition-colors", i / BARS < progress ? on : off)} style={{ height: `${Math.round(p * 100)}%`, minHeight: 3 }} />
          ))}
        </div>
        <div className={cn("mt-0.5 flex items-center justify-between text-[11px] tabular-nums", mine ? "text-white/70" : "text-sub")}>
          <span>{fmt(playing || pos ? pos : duration)}</span>
          <button
            onClick={() => {
              const next = rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1;
              setRate(next);
              if (audio.current) audio.current.playbackRate = next;
              haptic.select();
            }}
            className={cn("rounded-full px-1.5 text-[10px] leading-4 font-bold", mine ? "bg-white/20" : "bg-white/10")}
          >
            {rate}×
          </button>
        </div>
      </div>
    </div>
  );
}
