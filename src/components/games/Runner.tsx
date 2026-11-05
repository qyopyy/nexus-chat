"use client";

import { useEffect, useRef } from "react";
import { type GameProps } from "./common";

/** Neon Runner — tap/space to jump over blocks. */
export default function Runner({ onOver, onScore }: GameProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!;
    const ctx = cv.getContext("2d")!;
    let W = 0,
      H = 0;
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      W = cv.clientWidth;
      H = cv.clientHeight;
      cv.width = W * dpr;
      cv.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ground = () => H * 0.72;
    const player = { y: 0, v: 0, on: true };
    player.y = ground();
    let obstacles: { x: number; w: number; h: number }[] = [];
    let score = 0,
      speed = 280,
      spawn = 0,
      over = false;
    const jump = () => {
      if (over || !player.on) return;
      player.v = -520;
      player.on = false;
    };
    const key = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "ArrowUp") {
        e.preventDefault();
        jump();
      }
    };
    window.addEventListener("keydown", key);
    cv.addEventListener("pointerdown", jump);

    let last = performance.now(),
      raf = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      if (!over) {
        player.v += 1600 * dt;
        player.y += player.v * dt;
        if (player.y >= ground()) {
          player.y = ground();
          player.v = 0;
          player.on = true;
        }
        spawn -= dt;
        speed = 280 + score * 2;
        if (spawn <= 0) {
          obstacles.push({ x: W + 20, w: 28 + Math.random() * 24, h: 36 + Math.random() * 40 });
          spawn = 1.1 + Math.random() * 0.9;
        }
        for (const o of obstacles) {
          o.x -= speed * dt;
          const px = W * 0.22,
            pr = 16;
          if (px + pr > o.x && px - pr < o.x + o.w && player.y + pr > ground() - o.h) {
            over = true;
            onOver(score);
          }
        }
        obstacles = obstacles.filter((o) => o.x > -80);
        score += Math.floor(dt * 60);
        onScore(score);
      }

      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, "#0b0b2a");
      g.addColorStop(1, "#2b1055");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#ff2bd6";
      ctx.fillRect(0, ground() + 16, W, H);
      ctx.fillStyle = "#00e5ff";
      ctx.beginPath();
      ctx.arc(W * 0.22, player.y, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffd400";
      for (const o of obstacles) ctx.fillRect(o.x, ground() - o.h + 16, o.w, o.h);
      ctx.fillStyle = "#fff";
      ctx.font = "700 20px system-ui";
      ctx.fillText(String(score), 16, 32);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", key);
      cv.removeEventListener("pointerdown", jump);
    };
  }, [onOver, onScore]);

  return <canvas ref={ref} className="size-full touch-none" />;
}
