"use client";

import { useEffect, useRef } from "react";
import { type GameProps } from "./common";

/** Sky Pinball — tilt-free table; flippers with ← → / tap sides. */
export default function Pinball({ onOver, onScore }: GameProps) {
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
    const ball = { x: W * 0.5, y: H * 0.35, vx: 120, vy: 0, r: 9 };
    const left = { on: false };
    const right = { on: false };
    let score = 0,
      lives = 3,
      over = false,
      launched = false;
    const bumpers = [
      { x: 0.3, y: 0.28, r: 22 },
      { x: 0.7, y: 0.28, r: 22 },
      { x: 0.5, y: 0.42, r: 26 },
    ];

    const key = (v: boolean) => (e: KeyboardEvent) => {
      if (e.code === "ArrowLeft" || e.code === "KeyA") left.on = v;
      if (e.code === "ArrowRight" || e.code === "KeyD") right.on = v;
      if (v && (e.code === "Space" || e.code === "ArrowUp") && !launched) {
        launched = true;
        ball.vy = -420;
        ball.vx = (Math.random() - 0.5) * 160;
      }
    };
    const down = key(true);
    const up = key(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    const ptr = (e: PointerEvent) => {
      const x = e.clientX - cv.getBoundingClientRect().left;
      left.on = x < W / 2;
      right.on = x >= W / 2;
      if (!launched) {
        launched = true;
        ball.vy = -420;
      }
    };
    const ptrUp = () => {
      left.on = false;
      right.on = false;
    };
    cv.addEventListener("pointerdown", ptr);
    cv.addEventListener("pointerup", ptrUp);

    let last = performance.now(),
      raf = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      if (!over) {
        if (launched) {
          ball.vy += 900 * dt;
          ball.x += ball.vx * dt;
          ball.y += ball.vy * dt;
          if (ball.x < ball.r) {
            ball.x = ball.r;
            ball.vx *= -0.85;
          }
          if (ball.x > W - ball.r) {
            ball.x = W - ball.r;
            ball.vx *= -0.85;
          }
          if (ball.y < ball.r) {
            ball.y = ball.r;
            ball.vy *= -0.85;
          }
          for (const b of bumpers) {
            const bx = b.x * W,
              by = b.y * H;
            const dx = ball.x - bx,
              dy = ball.y - by;
            const d = Math.hypot(dx, dy) || 1;
            if (d < b.r + ball.r) {
              const nx = dx / d,
                ny = dy / d;
              ball.x = bx + nx * (b.r + ball.r);
              ball.y = by + ny * (b.r + ball.r);
              const bounce = 380;
              ball.vx = nx * bounce;
              ball.vy = ny * bounce;
              score += 25;
              onScore(score);
            }
          }
          const fy = H - 48;
          const fl = { x: W * 0.22, y: fy, a: left.on ? -0.55 : 0.25 };
          const fr = { x: W * 0.78, y: fy, a: right.on ? 0.55 : -0.25 };
          for (const f of [fl, fr]) {
            const fx = f.x + Math.cos(f.a) * 54;
            const fy2 = f.y + Math.sin(f.a) * 18;
            if (Math.hypot(ball.x - fx, ball.y - fy2) < 28 && ball.y > fy - 30) {
              ball.vy = -Math.abs(ball.vy) * 0.3 - (f === fl ? (left.on ? 520 : 180) : right.on ? 520 : 180);
              ball.vx += f === fl ? -80 : 80;
            }
          }
          if (ball.y > H + 20) {
            lives--;
            launched = false;
            ball.x = W * 0.5;
            ball.y = H * 0.35;
            ball.vx = 0;
            ball.vy = 0;
            if (lives <= 0) {
              over = true;
              onOver(score);
            }
          }
        }
      }

      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, "#0b1a3a");
      bg.addColorStop(1, "#1b0b3a");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 4;
      ctx.strokeRect(8, 8, W - 16, H - 16);
      for (const b of bumpers) {
        ctx.fillStyle = "#f472b6";
        ctx.beginPath();
        ctx.arc(b.x * W, b.y * H, b.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(b.x * W - 6, b.y * H - 6, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      const drawFlip = (x: number, y: number, a: number, mirror: boolean) => {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(a);
        ctx.fillStyle = "#facc15";
        ctx.fillRect(mirror ? -70 : 0, -8, 70, 16);
        ctx.restore();
      };
      drawFlip(W * 0.22, H - 48, left.on ? -0.55 : 0.25, false);
      drawFlip(W * 0.78, H - 48, right.on ? 0.55 : -0.25, true);
      ctx.fillStyle = "#e2e8f0";
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "700 16px system-ui";
      ctx.fillText(`Score ${score}`, 18, 32);
      ctx.fillText(`Balls ${lives}`, W - 100, 32);
      if (!launched && !over) {
        ctx.textAlign = "center";
        ctx.fillText("Tap / Space to launch · ← → flippers", W / 2, H * 0.55);
        ctx.textAlign = "left";
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      cv.removeEventListener("pointerdown", ptr);
      cv.removeEventListener("pointerup", ptrUp);
    };
  }, [onOver, onScore]);

  return <canvas ref={ref} className="size-full touch-none" />;
}
