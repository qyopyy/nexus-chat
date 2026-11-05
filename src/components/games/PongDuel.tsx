"use client";

import { useEffect, useRef } from "react";
import { type GameProps } from "./common";

/** Pong Duel — you vs a tracking bot. First to 7. */
export default function PongDuel({ onOver, onScore }: GameProps) {
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
    const player = { y: H / 2 };
    const bot = { y: H / 2 };
    const ball = { x: W / 2, y: H / 2, vx: 260, vy: 120, r: 7 };
    let you = 0,
      cpu = 0,
      over = false;
    const reset = (dir: number) => {
      ball.x = W / 2;
      ball.y = H / 2;
      ball.vx = 260 * dir;
      ball.vy = (Math.random() * 2 - 1) * 180;
    };
    const onPtr = (e: PointerEvent) => {
      const rect = cv.getBoundingClientRect();
      player.y = ((e.clientY - rect.top) / rect.height) * H;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "ArrowUp" || e.code === "KeyW") player.y -= 24;
      if (e.code === "ArrowDown" || e.code === "KeyS") player.y += 24;
    };
    cv.addEventListener("pointermove", onPtr);
    window.addEventListener("keydown", onKey);

    let last = performance.now(),
      raf = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      const ph = 70;
      if (!over) {
        ball.x += ball.vx * dt;
        ball.y += ball.vy * dt;
        if (ball.y < ball.r || ball.y > H - ball.r) ball.vy *= -1;
        player.y = Math.max(ph / 2, Math.min(H - ph / 2, player.y));
        const target = ball.y + (Math.random() - 0.5) * 30;
        bot.y += (target - bot.y) * Math.min(1, 4 * dt);
        bot.y = Math.max(ph / 2, Math.min(H - ph / 2, bot.y));
        if (ball.x < 28 && Math.abs(ball.y - player.y) < ph / 2 + ball.r) {
          ball.x = 28;
          ball.vx = Math.abs(ball.vx) * 1.05;
          ball.vy += (ball.y - player.y) * 3;
        }
        if (ball.x > W - 28 && Math.abs(ball.y - bot.y) < ph / 2 + ball.r) {
          ball.x = W - 28;
          ball.vx = -Math.abs(ball.vx) * 1.05;
          ball.vy += (ball.y - bot.y) * 3;
        }
        if (ball.x < -20) {
          cpu++;
          onScore(you);
          if (cpu >= 7) {
            over = true;
            onOver(you * 100);
          } else reset(1);
        }
        if (ball.x > W + 20) {
          you++;
          onScore(you);
          if (you >= 7) {
            over = true;
            onOver(you * 100 + 50);
          } else reset(-1);
        }
      }

      ctx.fillStyle = "#050510";
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.setLineDash([8, 10]);
      ctx.beginPath();
      ctx.moveTo(W / 2, 0);
      ctx.lineTo(W / 2, H);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#38bdf8";
      ctx.fillRect(12, player.y - ph / 2, 10, ph);
      ctx.fillStyle = "#f472b6";
      ctx.fillRect(W - 22, bot.y - ph / 2, 10, ph);
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = "900 36px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(`${you}  :  ${cpu}`, W / 2, 48);
      ctx.font = "600 12px system-ui";
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.fillText("First to 7 · drag or ↑↓", W / 2, H - 16);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      cv.removeEventListener("pointermove", onPtr);
      window.removeEventListener("keydown", onKey);
    };
  }, [onOver, onScore]);

  return <canvas ref={ref} className="size-full touch-none" />;
}
