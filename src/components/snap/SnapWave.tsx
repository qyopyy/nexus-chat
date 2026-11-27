"use client";

import { useEffect, useRef } from "react";
import { SLICE_MS, resamplePeaks, seekFromDrag } from "@/lib/snapVoice";

const STEP = 4; // css px per 50 ms bar
const BAR = 2.4;
const RED = "#ff453a";

type Common = { className?: string };
type Props =
  | (Common & { mode: "live"; getPeaks: () => number[] })
  | (Common & { mode: "scroll"; peaks: number[]; getPos: () => number; duration: number; onSeek: (sec: number) => void })
  | (Common & { mode: "overview"; peaks: number[]; getPos: () => number; duration: number; onSeek: (sec: number) => void; played?: string; rest?: string });

/**
 * Voice Memos style waveform on a canvas.
 * live: bars scroll right to left while you record, newest at the red line.
 * scroll: the recording slides under a fixed red line while it plays; drag to scrub.
 * overview: the whole message as bars with a progress colour; tap or drag to seek (chat bubbles).
 */
export default function SnapWave(props: Props) {
  const cv = useRef<HTMLCanvasElement>(null);
  const live = useRef(props);
  live.current = props;
  const drag = useRef<{ x: number; sec: number } | null>(null);

  useEffect(() => {
    const c = cv.current;
    if (!c) return;
    let raf = 0;
    let w = 0;
    let h = 0;
    let dpr = 1;
    let lastKey = "";
    const fit = () => {
      dpr = Math.min(3, window.devicePixelRatio || 1);
      w = c.clientWidth;
      h = c.clientHeight;
      c.width = Math.max(1, Math.round(w * dpr));
      c.height = Math.max(1, Math.round(h * dpr));
      lastKey = "";
    };
    fit();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(fit) : null;
    ro?.observe(c);
    const g = c.getContext("2d");

    const bar = (x: number, peak: number, color: string) => {
      if (!g) return;
      const bh = Math.max(2, peak * h * 0.86);
      g.fillStyle = color;
      g.beginPath();
      g.roundRect(x - BAR / 2, (h - bh) / 2, BAR, bh, BAR / 2);
      g.fill();
    };
    const playhead = (x: number) => {
      if (!g) return;
      g.fillStyle = RED;
      g.fillRect(x - 0.75, 0, 1.5, h);
      g.beginPath();
      g.arc(x, 3, 3, 0, Math.PI * 2);
      g.arc(x, h - 3, 3, 0, Math.PI * 2);
      g.fill();
    };

    const draw = () => {
      raf = requestAnimationFrame(draw);
      if (!g || !w || !h) return;
      const p = live.current;
      if (p.mode === "overview") {
        const pos = p.getPos();
        const key = `${w}|${h}|${pos.toFixed(2)}|${p.peaks.length}|${p.duration}`;
        if (key === lastKey) return;
        lastKey = key;
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      if (p.mode === "live") {
        const peaks = p.getPeaks();
        const playX = Math.round(w * 0.62);
        g.fillStyle = "rgba(255,255,255,.12)";
        g.fillRect(0, h / 2 - 0.5, playX, 1);
        for (let x = playX + STEP; x < w; x += STEP) {
          g.fillStyle = "rgba(255,255,255,.28)";
          g.beginPath();
          g.arc(x, h / 2, 1, 0, Math.PI * 2);
          g.fill();
        }
        for (let i = 0; i < peaks.length; i++) {
          const x = playX - (i + 0.5) * STEP;
          if (x < -STEP) break;
          bar(x, peaks[peaks.length - 1 - i], RED);
        }
        playhead(playX);
      } else if (p.mode === "scroll") {
        const idx = (p.getPos() * 1000) / SLICE_MS;
        const playX = w / 2;
        g.fillStyle = "rgba(255,255,255,.12)";
        g.fillRect(0, h / 2 - 0.5, w, 1);
        const from = Math.floor(idx - playX / STEP) - 1;
        const to = Math.ceil(idx + playX / STEP) + 1;
        for (let i = Math.max(0, from); i < Math.min(p.peaks.length, to); i++) {
          const x = playX + (i + 0.5 - idx) * STEP;
          bar(x, p.peaks[i], i + 0.5 < idx ? "rgba(255,255,255,.95)" : "rgba(255,255,255,.35)");
        }
        playhead(playX);
      } else {
        const n = Math.max(8, Math.floor(w / 3.2));
        const bars = resamplePeaks(p.peaks, n);
        const frac = p.duration > 0 ? Math.min(1, p.getPos() / p.duration) : 0;
        const gap = w / n;
        for (let i = 0; i < n; i++) bar(gap * (i + 0.5), bars[i], (i + 0.5) / n <= frac ? (p.played ?? "#fff") : (p.rest ?? "rgba(255,255,255,.38)"));
      }
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
    };
  }, []);

  const down = (e: React.PointerEvent) => {
    const p = props;
    if (p.mode === "live") return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, sec: p.getPos() };
    if (p.mode === "overview") p.onSeek(frac(e));
  };
  const frac = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - r.left) / Math.max(1, r.width))) * (props.mode === "live" ? 0 : props.duration);
  };
  const move = (e: React.PointerEvent) => {
    const p = props;
    const d = drag.current;
    if (!d || p.mode === "live") return;
    if (p.mode === "scroll") p.onSeek(seekFromDrag(d.sec, e.clientX - d.x, STEP, p.duration));
    else p.onSeek(frac(e));
  };
  const up = () => {
    drag.current = null;
  };

  return <canvas ref={cv} className={props.className} style={{ touchAction: "none" }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />;
}
