"use client";

import { useEffect, useRef } from "react";
import { TouchPad, useKeyPress, useSwipe, type GameProps } from "./common";

// Neon Snake — eat notes, grow, don't bite yourself. Walls wrap around.
const G = 20;

export default function Snake({ onOver, onScore }: GameProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const dirQ = useRef<[number, number][]>([]);
  const press = (k: "up" | "down" | "left" | "right" | "action") => {
    const d: Record<string, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    if (d[k] && dirQ.current.length < 3) dirQ.current.push(d[k]);
  };
  useKeyPress(press);
  useSwipe(box, press);

  useEffect(() => {
    const cv = ref.current!;
    const ctx = cv.getContext("2d")!;
    let snake = [
      [10, 10],
      [9, 10],
      [8, 10],
    ];
    let dir: [number, number] = [1, 0];
    const place = () => {
      for (;;) {
        const f = [Math.floor(Math.random() * G), Math.floor(Math.random() * G)];
        if (!snake.some((s) => s[0] === f[0] && s[1] === f[1])) return f;
      }
    };
    let food = place();
    let gold: number[] | null = null;
    let goldT = 0;
    let score = 0, acc = 0, over = false; // prettier-ignore
    const tick = () => {
      const q = dirQ.current.shift();
      if (q && !(q[0] === -dir[0] && q[1] === -dir[1])) dir = q;
      const h = [(snake[0][0] + dir[0] + G) % G, (snake[0][1] + dir[1] + G) % G];
      if (snake.some((s, i) => i < snake.length - 1 && s[0] === h[0] && s[1] === h[1])) {
        over = true;
        draw();
        setTimeout(() => onOver(score), 900);
        return;
      }
      snake = [h, ...snake];
      if (h[0] === food[0] && h[1] === food[1]) {
        score += 10;
        food = place();
        if (!gold && Math.random() < 0.2) ((gold = place()), (goldT = 6));
      } else if (gold && h[0] === gold[0] && h[1] === gold[1]) {
        score += 50;
        gold = null;
      } else snake.pop();
      onScore(score);
    };
    const draw = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = cv.clientWidth, H = cv.clientHeight; // prettier-ignore
      cv.width = W * dpr;
      cv.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#07070d";
      ctx.fillRect(0, 0, W, H);
      const c = Math.floor(Math.min(W, H - 40) / G);
      const ox = Math.floor((W - c * G) / 2), oy = 34; // prettier-ignore
      ctx.fillStyle = "#0f0f1a";
      ctx.fillRect(ox, oy, c * G, c * G);
      ctx.font = `${c * 0.8}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("🎵", ox + food[0] * c + c / 2, oy + food[1] * c + c * 0.8);
      if (gold) ctx.fillText("💿", ox + gold[0] * c + c / 2, oy + gold[1] * c + c * 0.8);
      snake.forEach((s, i) => {
        const t = 1 - i / (snake.length + 4);
        ctx.fillStyle = `hsl(${300 - i * 4}, 100%, ${45 + t * 15}%)`;
        ctx.beginPath();
        ctx.roundRect(ox + s[0] * c + 1, oy + s[1] * c + 1, c - 2, c - 2, i === 0 ? 6 : 4);
        ctx.fill();
      });
      ctx.textAlign = "left";
      ctx.fillStyle = "#fff";
      ctx.font = "bold 18px ui-sans-serif, system-ui";
      ctx.fillText(`${score}`, ox, 24);
      if (over) {
        ctx.fillStyle = "rgba(0,0,0,.55)";
        ctx.fillRect(ox, oy, c * G, c * G);
        ctx.fillStyle = "#ff2bd6";
        ctx.textAlign = "center";
        ctx.font = "900 30px ui-sans-serif, system-ui";
        ctx.fillText("GAME OVER", ox + (c * G) / 2, oy + (c * G) / 2);
      }
    };
    let last = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!over && !document.hidden) {
        acc += dt;
        if (gold && (goldT -= dt) <= 0) gold = null;
        const speed = Math.max(0.055, 0.13 - snake.length * 0.0015);
        while (acc > speed && !over) {
          acc -= speed;
          tick();
        }
        if (!over) draw();
      }
      if (!over) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [onOver, onScore]);

  return (
    <div ref={box} className="relative size-full touch-none">
      <canvas ref={ref} className="size-full" />
      <TouchPad layout="dpad" onPress={press} />
    </div>
  );
}
