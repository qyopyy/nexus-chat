"use client";

import { useEffect, useRef } from "react";
import { useEffectsStore, type EffectKind } from "@/lib/effects";
import { haptic } from "@/lib/haptics";

type P = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rot: number;
  vr: number;
  color: string;
  life: number;
  max: number;
  shape: "rect" | "circle" | "heart" | "text" | "line" | "balloon";
  text?: string;
  delay: number;
};

const PALETTE = ["#2aabee", "#5865f2", "#eb459e", "#f0b232", "#23a55a", "#ff73fa", "#ffffff", "#ff6b6b"];
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

function spawn(kind: EffectKind, w: number, h: number): P[] {
  const out: P[] = [];
  const base = { rot: 0, vr: 0, life: 0, delay: 0 };
  switch (kind) {
    case "confetti":
      for (let i = 0; i < 180; i++)
        out.push({ ...base, x: rnd(0, w), y: rnd(-h * 0.6, -10), vx: rnd(-1.5, 1.5), vy: rnd(2, 6), size: rnd(6, 11), rot: rnd(0, 6), vr: rnd(-0.2, 0.2), color: pick(PALETTE), max: 260, shape: Math.random() > 0.3 ? "rect" : "circle" });
      break;
    case "hearts":
      for (let i = 0; i < 60; i++)
        out.push({ ...base, x: rnd(0, w), y: h + rnd(0, h * 0.5), vx: rnd(-0.6, 0.6), vy: rnd(-3.5, -1.8), size: rnd(18, 42), color: pick(["#ff4d8d", "#ff1f6b", "#ffb3cf", "#eb459e"]), max: 300, shape: "heart" });
      break;
    case "snow":
      for (let i = 0; i < 140; i++)
        out.push({ ...base, x: rnd(0, w), y: rnd(-h, 0), vx: rnd(-0.5, 0.5), vy: rnd(0.8, 2.2), size: rnd(2, 5), color: "#ffffff", max: 420, shape: "circle" });
      break;
    case "balloons":
      for (let i = 0; i < 26; i++)
        out.push({ ...base, x: rnd(20, w - 20), y: h + rnd(20, h * 0.8), vx: rnd(-0.4, 0.4), vy: rnd(-3.2, -1.8), size: rnd(26, 44), color: pick(PALETTE), max: 360, shape: "balloon", rot: rnd(0, 6) });
      break;
    case "lasers":
      for (let i = 0; i < 26; i++) {
        const fromLeft = Math.random() > 0.5;
        out.push({ ...base, x: fromLeft ? -40 : w + 40, y: rnd(0, h), vx: fromLeft ? rnd(14, 22) : -rnd(14, 22), vy: rnd(-3, 3), size: rnd(60, 160), color: pick(["#00fff0", "#ff00e5", "#39ff14", "#2aabee"]), max: 90, shape: "line", delay: Math.floor(rnd(0, 90)) });
      }
      break;
    case "fireworks":
      for (let b = 0; b < 6; b++) {
        const cx = rnd(w * 0.15, w * 0.85);
        const cy = rnd(h * 0.15, h * 0.5);
        const color = pick(PALETTE);
        const delay = b * 22;
        for (let i = 0; i < 46; i++) {
          const a = (Math.PI * 2 * i) / 46;
          const sp = rnd(2.5, 5.5);
          out.push({ ...base, x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, size: rnd(2, 3.5), color, max: 90, shape: "circle", delay });
        }
      }
      break;
  }
  return out;
}

function heart(ctx: CanvasRenderingContext2D, s: number) {
  ctx.beginPath();
  ctx.moveTo(0, s * 0.3);
  ctx.bezierCurveTo(0, 0, -s * 0.5, 0, -s * 0.5, s * 0.3);
  ctx.bezierCurveTo(-s * 0.5, s * 0.6, 0, s * 0.8, 0, s);
  ctx.bezierCurveTo(0, s * 0.8, s * 0.5, s * 0.6, s * 0.5, s * 0.3);
  ctx.bezierCurveTo(s * 0.5, 0, 0, 0, 0, s * 0.3);
  ctx.fill();
}

export default function EffectsLayer() {
  const playing = useEffectsStore((s) => s.playing);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!playing) return;
    if (document.documentElement.classList.contains("reduce-motion")) return;
    const c = canvas.current;
    if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    c.width = w * dpr;
    c.height = h * dpr;
    const ctx = c.getContext("2d")!;
    ctx.scale(dpr, dpr);
    const parts = spawn(playing.kind, w, h);
    const gravity = playing.kind === "fireworks" ? 0.06 : playing.kind === "confetti" ? 0.03 : 0;
    let raf = 0;
    let frame = 0;
    haptic.medium();

    const step = () => {
      frame++;
      ctx.clearRect(0, 0, w, h);
      let alive = 0;
      for (const p of parts) {
        if (p.delay > 0) {
          p.delay--;
          alive++;
          continue;
        }
        p.life++;
        if (p.life > p.max) continue;
        alive++;
        p.vy += gravity;
        if (playing.kind === "confetti" || playing.kind === "snow") p.vx += Math.sin((frame + p.size * 10) / 30) * 0.03;
        if (playing.kind === "fireworks") {
          p.vx *= 0.97;
          p.vy *= 0.97;
        }
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        const fade = Math.min(1, (p.max - p.life) / 40);
        ctx.save();
        ctx.globalAlpha = Math.max(0, fade);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.strokeStyle = p.color;
        switch (p.shape) {
          case "rect":
            ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
            break;
          case "circle":
            ctx.beginPath();
            ctx.arc(0, 0, p.size, 0, Math.PI * 2);
            ctx.fill();
            break;
          case "heart":
            ctx.rotate(Math.sin((frame + p.size) / 20) * 0.2);
            heart(ctx, p.size);
            break;
          case "balloon": {
            ctx.rotate(-p.rot + Math.sin((frame + p.size * 3) / 25) * 0.15);
            ctx.beginPath();
            ctx.ellipse(0, 0, p.size * 0.75, p.size, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha *= 0.35;
            ctx.fillStyle = "#fff";
            ctx.beginPath();
            ctx.ellipse(-p.size * 0.25, -p.size * 0.35, p.size * 0.15, p.size * 0.25, -0.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha /= 0.35;
            ctx.strokeStyle = "rgba(255,255,255,.6)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, p.size);
            ctx.quadraticCurveTo(6, p.size * 1.6, 0, p.size * 2.3);
            ctx.stroke();
            break;
          }
          case "line": {
            ctx.rotate(Math.atan2(p.vy, p.vx) - p.rot);
            const g = ctx.createLinearGradient(-p.size, 0, 0, 0);
            g.addColorStop(0, "transparent");
            g.addColorStop(1, p.color);
            ctx.strokeStyle = g;
            ctx.lineWidth = 4;
            ctx.shadowColor = p.color;
            ctx.shadowBlur = 16;
            ctx.beginPath();
            ctx.moveTo(-p.size, 0);
            ctx.lineTo(0, 0);
            ctx.stroke();
            break;
          }
        }
        ctx.restore();
      }
      if (alive > 0 && frame < 600) raf = requestAnimationFrame(step);
      else ctx.clearRect(0, 0, w, h);
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      ctx.clearRect(0, 0, w, h);
    };
  }, [playing]);

  return <canvas ref={canvas} className="pointer-events-none fixed inset-0 z-[90] h-full w-full" aria-hidden />;
}
