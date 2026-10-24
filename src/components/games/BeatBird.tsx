"use client";

import { useEffect, useRef } from "react";
import { type GameProps } from "./common";

// Beat Bird — tap to flap through speaker stacks; every gap plays a note on a phonk-ish scale.
const SCALE = [0, 3, 5, 7, 10, 12, 15, 17];

export default function BeatBird({ onOver, onScore }: GameProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!;
    const ctx = cv.getContext("2d")!;
    const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    let ac: AudioContext | null = null;
    const note = (i: number, kick = false) => {
      try {
        ac ??= new C();
        void ac.resume();
        const t = ac.currentTime;
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.type = kick ? "sine" : "square";
        o.frequency.setValueAtTime(kick ? 140 : 220 * Math.pow(2, SCALE[i % SCALE.length] / 12), t);
        if (kick) o.frequency.exponentialRampToValueAtTime(45, t + 0.15);
        g.gain.setValueAtTime(kick ? 0.5 : 0.08, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + (kick ? 0.2 : 0.25));
        o.connect(g).connect(ac.destination);
        o.start(t);
        o.stop(t + 0.3);
      } catch {
        /* no audio */
      }
    };
    let W = 0, H = 0; // prettier-ignore
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      W = cv.clientWidth;
      H = cv.clientHeight;
      cv.width = W * dpr;
      cv.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const bird = { y: H / 2, v: 0 };
    let pipes: { x: number; gap: number; passed: boolean }[] = [];
    let score = 0, started = false, over = false, spawn = 0, t = 0; // prettier-ignore
    const flap = () => {
      if (over) return;
      started = true;
      bird.v = -340;
      note(0, true);
    };
    const key = (e: KeyboardEvent) => (e.code === "Space" || e.code === "ArrowUp") && (e.preventDefault(), flap());
    window.addEventListener("keydown", key);
    cv.addEventListener("pointerdown", flap);

    let last = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      if (!document.hidden && !over) {
        t += dt;
        if (started) {
          bird.v += 980 * dt;
          bird.y += bird.v * dt;
          spawn -= dt;
          const speed = 170 + Math.min(140, score * 4);
          if (spawn <= 0) {
            pipes.push({ x: W + 40, gap: 90 + Math.random() * (H - 260), passed: false });
            spawn = Math.max(1.05, 1.6 - score * 0.02);
          }
          for (const p of pipes) {
            p.x -= speed * dt;
            if (!p.passed && p.x + 30 < W * 0.3) {
              p.passed = true;
              score++;
              note(score);
              onScore(score);
            }
          }
          pipes = pipes.filter((p) => p.x > -80);
          const bx = W * 0.3;
          const hit = bird.y > H - 20 || bird.y < 0 || pipes.some((p) => bx + 14 > p.x && bx - 14 < p.x + 60 && (bird.y - 14 < p.gap || bird.y + 14 > p.gap + 150));
          if (hit) {
            over = true;
            note(0, true);
            setTimeout(() => onOver(score), 900);
          }
        } else bird.y = H / 2 + Math.sin(t * 3) * 10;
        // draw
        ctx.fillStyle = "#0b0716";
        ctx.fillRect(0, 0, W, H);
        for (let i = 0; i < 40; i++) {
          ctx.fillStyle = `rgba(255,255,255,${0.15 + ((i * 37) % 10) / 30})`;
          const sx = (((i * 97 - t * 20 * ((i % 3) + 1)) % (W + 20)) + (W + 20)) % (W + 20);
          ctx.fillRect(sx, (i * 53) % H, 2, 2);
        }
        for (const p of pipes) {
          for (const [y, h] of [
            [0, p.gap],
            [p.gap + 150, H - p.gap - 150],
          ]) {
            ctx.fillStyle = "#16162a";
            ctx.fillRect(p.x, y, 60, h);
            ctx.strokeStyle = "#ff2bd6";
            ctx.lineWidth = 2;
            ctx.strokeRect(p.x + 1, y, 58, h);
            ctx.fillStyle = "#2a2a44";
            for (let yy = y + 14; yy < y + h - 14; yy += 46) {
              ctx.beginPath();
              ctx.arc(p.x + 30, yy + 14, 12 + (Math.sin(t * 12 + yy) > 0.6 ? 2 : 0), 0, 7);
              ctx.fill();
            }
          }
        }
        const bx = W * 0.3;
        ctx.save();
        ctx.translate(bx, bird.y);
        ctx.rotate(Math.max(-0.5, Math.min(1, bird.v / 600)));
        ctx.font = "30px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("🐦", 0, 10);
        ctx.restore();
        ctx.fillStyle = "#fff";
        ctx.font = "900 40px ui-sans-serif, system-ui";
        ctx.textAlign = "center";
        ctx.fillText(String(score), W / 2, 60);
        if (!started) {
          ctx.font = "bold 16px ui-sans-serif, system-ui";
          ctx.fillText("Tap or press Space to flap", W / 2, H / 2 + 60);
        }
      }
      if (!over) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const ro = new ResizeObserver(resize);
    ro.observe(cv);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("keydown", key);
      cv.removeEventListener("pointerdown", flap);
      void ac?.close();
    };
  }, [onOver, onScore]);
  return <canvas ref={ref} className="size-full touch-none" />;
}
