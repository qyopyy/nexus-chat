"use client";

import { useEffect, useRef } from "react";
import { type GameProps } from "./common";

/** Brick Bash — breakout with a growing paddle combo. */
export default function BrickBash({ onOver, onScore }: GameProps) {
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
    const cols = 10,
      rows = 6;
    const bricks: { x: number; y: number; alive: boolean; color: string }[] = [];
    const colors = ["#ef4444", "#f97316", "#facc15", "#22c55e", "#38bdf8", "#a855f7"];
    const build = () => {
      bricks.length = 0;
      const bw = (W - 40) / cols,
        bh = 18;
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++)
          bricks.push({ x: 20 + c * bw, y: 50 + r * (bh + 6), alive: true, color: colors[r % colors.length] });
    };
    build();
    const paddle = { x: W / 2, w: 90, h: 12 };
    const ball = { x: W / 2, y: H - 80, vx: 180, vy: -220, r: 7, live: false };
    let score = 0,
      over = false;
    const move = (x: number) => {
      paddle.x = Math.max(paddle.w / 2, Math.min(W - paddle.w / 2, x));
    };
    const onPtr = (e: PointerEvent) => {
      const rect = cv.getBoundingClientRect();
      move(((e.clientX - rect.left) / rect.width) * W);
      if (!ball.live && !over) {
        ball.live = true;
        ball.vx = 160 + Math.random() * 80;
        ball.vy = -220;
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "ArrowLeft") paddle.x = Math.max(paddle.w / 2, paddle.x - 28);
      if (e.code === "ArrowRight") paddle.x = Math.min(W - paddle.w / 2, paddle.x + 28);
      if (e.code === "Space" && !ball.live && !over) {
        ball.live = true;
        ball.vy = -220;
      }
    };
    cv.addEventListener("pointermove", onPtr);
    cv.addEventListener("pointerdown", onPtr);
    window.addEventListener("keydown", onKey);

    let last = performance.now(),
      raf = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      if (!over && ball.live) {
        ball.x += ball.vx * dt;
        ball.y += ball.vy * dt;
        if (ball.x < ball.r || ball.x > W - ball.r) ball.vx *= -1;
        if (ball.y < ball.r) ball.vy *= -1;
        if (ball.y > H - 28 && Math.abs(ball.x - paddle.x) < paddle.w / 2 + ball.r) {
          ball.y = H - 28 - ball.r;
          ball.vy = -Math.abs(ball.vy);
          ball.vx += (ball.x - paddle.x) * 4;
        }
        const bw = (W - 40) / cols,
          bh = 18;
        for (const b of bricks) {
          if (!b.alive) continue;
          if (ball.x > b.x && ball.x < b.x + bw && ball.y > b.y && ball.y < b.y + bh) {
            b.alive = false;
            ball.vy *= -1;
            score += 10;
            onScore(score);
            if (score % 100 === 0) paddle.w = Math.min(140, paddle.w + 8);
          }
        }
        if (bricks.every((b) => !b.alive)) {
          build();
          ball.live = false;
          ball.x = paddle.x;
          ball.y = H - 80;
          ball.vy = -240;
        }
        if (ball.y > H + 20) {
          over = true;
          onOver(score);
        }
      } else if (!ball.live) {
        ball.x = paddle.x;
        ball.y = H - 40;
      }

      ctx.fillStyle = "#070714";
      ctx.fillRect(0, 0, W, H);
      for (const b of bricks) {
        if (!b.alive) continue;
        const bw = (W - 40) / cols;
        ctx.fillStyle = b.color;
        ctx.fillRect(b.x + 1, b.y, bw - 2, 16);
      }
      ctx.fillStyle = "#e2e8f0";
      ctx.fillRect(paddle.x - paddle.w / 2, H - 28, paddle.w, paddle.h);
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = "700 16px system-ui";
      ctx.fillText(`Score ${score}`, 16, 28);
      if (!ball.live && !over) {
        ctx.textAlign = "center";
        ctx.fillText("Tap or Space to serve", W / 2, H * 0.6);
        ctx.textAlign = "left";
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      cv.removeEventListener("pointermove", onPtr);
      cv.removeEventListener("pointerdown", onPtr);
      window.removeEventListener("keydown", onKey);
    };
  }, [onOver, onScore]);

  return <canvas ref={ref} className="size-full touch-none" />;
}
