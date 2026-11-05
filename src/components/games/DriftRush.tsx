"use client";

import { useEffect, useRef } from "react";
import { type GameProps } from "./common";

/** Drift Rush — tap left/right lanes, dodge traffic, chain near-misses. */
export default function DriftRush({ onOver, onScore }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = 0;
    let h = 0;
    let raf = 0;
    let alive = true;
    let score = 0;
    let speed = 6;
    let lane = 1; // 0 1 2
    let targetLane = 1;
    let carY = 0;
    let spawn = 0;
    let dist = 0;
    let ended = false;
    const cars: { lane: number; y: number; color: string }[] = [];
    const colors = ["#ef4444", "#3b82f6", "#eab308", "#a855f7", "#14b8a6"];

    const resize = () => {
      const parent = canvas.parentElement;
      w = parent?.clientWidth || 360;
      h = parent?.clientHeight || 520;
      canvas.width = w * devicePixelRatio;
      canvas.height = h * devicePixelRatio;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      carY = h * 0.78;
    };
    resize();
    window.addEventListener("resize", resize);

    const laneX = (l: number) => w * (0.22 + l * 0.28);

    const onTap = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left;
      if (x < w / 2) targetLane = Math.max(0, targetLane - 1);
      else targetLane = Math.min(2, targetLane + 1);
    };
    canvas.addEventListener("pointerdown", onTap);

    const end = () => {
      if (ended) return;
      ended = true;
      alive = false;
      onOver(score);
    };

    const tick = () => {
      if (!alive) return;
      lane += (targetLane - lane) * 0.22;
      speed = 6 + dist / 1800;
      dist += speed;
      score = Math.floor(dist / 8);
      onScore(score);

      spawn++;
      if (spawn > Math.max(28, 70 - speed * 3)) {
        spawn = 0;
        let l = Math.floor(Math.random() * 3);
        if (cars.length && cars[cars.length - 1]!.lane === l) l = (l + 1) % 3;
        cars.push({ lane: l, y: -80, color: colors[Math.floor(Math.random() * colors.length)]! });
      }

      for (const c of cars) c.y += speed * 1.35;
      for (let i = cars.length - 1; i >= 0; i--) {
        const c = cars[i]!;
        if (c.y > h + 60) {
          cars.splice(i, 1);
          score += 25;
          onScore(score);
          continue;
        }
        const dx = Math.abs(laneX(c.lane) - laneX(lane));
        const dy = Math.abs(c.y - carY);
        if (dx < 36 && dy < 48) {
          end();
          return;
        }
        // near miss bonus
        if (dx < 55 && dy < 40 && dx > 36) {
          score += 2;
          onScore(score);
        }
      }

      // road
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#0f172a");
      g.addColorStop(1, "#020617");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      ctx.fillStyle = "#1e293b";
      ctx.fillRect(w * 0.12, 0, w * 0.76, h);
      ctx.strokeStyle = "rgba(255,255,255,.25)";
      ctx.setLineDash([18, 18]);
      ctx.lineWidth = 3;
      for (const lx of [0.38, 0.62]) {
        ctx.beginPath();
        ctx.moveTo(w * lx, ((dist * 2) % 36) - 36);
        ctx.lineTo(w * lx, h + 36);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      for (const c of cars) {
        const x = laneX(c.lane);
        ctx.fillStyle = c.color;
        roundRect(ctx, x - 22, c.y - 34, 44, 68, 10);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,.35)";
        roundRect(ctx, x - 14, c.y - 22, 28, 16, 4);
        ctx.fill();
      }

      // player
      const px = laneX(lane);
      ctx.fillStyle = "#22c55a";
      roundRect(ctx, px - 24, carY - 36, 48, 72, 12);
      ctx.fill();
      ctx.fillStyle = "#86efac";
      roundRect(ctx, px - 14, carY - 18, 28, 18, 5);
      ctx.fill();
      ctx.shadowColor = "#22c55a";
      ctx.shadowBlur = 18;
      ctx.strokeStyle = "#bbf7d0";
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.fillStyle = "rgba(255,255,255,.9)";
      ctx.font = "700 14px ui-sans-serif,system-ui";
      ctx.fillText(`${score.toLocaleString()} m`, 14, 28);
      ctx.font = "600 11px ui-sans-serif,system-ui";
      ctx.fillStyle = "rgba(255,255,255,.55)";
      ctx.fillText("Tap left / right to change lane", 14, 46);

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointerdown", onTap);
    };
  }, [onOver, onScore]);

  return <canvas ref={canvasRef} className="size-full touch-none" />;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
