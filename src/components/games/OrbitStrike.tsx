"use client";

import { useEffect, useRef } from "react";
import { type GameProps } from "./common";

/** Orbit Strike — twin-stick style space shooter (tap/hold to fire, move with pointer). */
export default function OrbitStrike({ onOver, onScore }: GameProps) {
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
    let wave = 1;
    let spawn = 0;
    const ship = { x: 0, y: 0, a: 0, cool: 0 };
    const bullets: { x: number; y: number; vx: number; vy: number; life: number }[] = [];
    const foes: { x: number; y: number; vx: number; vy: number; hp: number; r: number }[] = [];
    const stars: { x: number; y: number; z: number }[] = [];
    let pointer = { x: 0, y: 0, down: false };
    let ended = false;

    const resize = () => {
      const parent = canvas.parentElement;
      w = parent?.clientWidth || 360;
      h = parent?.clientHeight || 520;
      canvas.width = w * devicePixelRatio;
      canvas.height = h * devicePixelRatio;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      ship.x = w / 2;
      ship.y = h * 0.72;
      if (!stars.length) {
        for (let i = 0; i < 80; i++) stars.push({ x: Math.random() * w, y: Math.random() * h, z: 0.3 + Math.random() });
      }
    };
    resize();
    window.addEventListener("resize", resize);

    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      pointer.x = e.clientX - r.left;
      pointer.y = e.clientY - r.top;
    };
    const onDown = (e: PointerEvent) => {
      pointer.down = true;
      onMove(e);
      canvas.setPointerCapture(e.pointerId);
    };
    const onUp = () => {
      pointer.down = false;
    };
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);

    const fire = () => {
      const dx = Math.cos(ship.a);
      const dy = Math.sin(ship.a);
      bullets.push({ x: ship.x + dx * 18, y: ship.y + dy * 18, vx: dx * 9, vy: dy * 9, life: 70 });
    };

    const spawnWave = () => {
      const n = 3 + wave;
      for (let i = 0; i < n; i++) {
        const side = Math.floor(Math.random() * 4);
        let x = 0;
        let y = 0;
        if (side === 0) {
          x = Math.random() * w;
          y = -20;
        } else if (side === 1) {
          x = w + 20;
          y = Math.random() * h;
        } else if (side === 2) {
          x = Math.random() * w;
          y = h + 20;
        } else {
          x = -20;
          y = Math.random() * h;
        }
        const ang = Math.atan2(ship.y - y, ship.x - x);
        const spd = 1.1 + wave * 0.12 + Math.random();
        foes.push({ x, y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, hp: 1 + Math.floor(wave / 3), r: 12 + Math.random() * 8 });
      }
      wave++;
    };

    const end = () => {
      if (ended) return;
      ended = true;
      alive = false;
      onOver(score);
    };

    const tick = () => {
      if (!alive) return;
      ship.a = Math.atan2(pointer.y - ship.y, pointer.x - ship.x);
      const tx = pointer.x;
      const ty = Math.min(h - 40, Math.max(40, pointer.y));
      ship.x += (tx - ship.x) * 0.12;
      ship.y += (ty - ship.y) * 0.12;
      if (pointer.down) {
        ship.cool--;
        if (ship.cool <= 0) {
          fire();
          ship.cool = 6;
        }
      } else ship.cool = 0;

      spawn++;
      if (spawn > 180 - Math.min(100, wave * 8) || foes.length === 0) {
        spawn = 0;
        spawnWave();
      }

      for (const b of bullets) {
        b.x += b.vx;
        b.y += b.vy;
        b.life--;
      }
      for (let i = bullets.length - 1; i >= 0; i--) if (bullets[i]!.life <= 0) bullets.splice(i, 1);

      for (const f of foes) {
        f.x += f.vx;
        f.y += f.vy;
        const ang = Math.atan2(ship.y - f.y, ship.x - f.x);
        f.vx += Math.cos(ang) * 0.02;
        f.vy += Math.sin(ang) * 0.02;
        const sp = Math.hypot(f.vx, f.vy) || 1;
        f.vx = (f.vx / sp) * (1.2 + wave * 0.08);
        f.vy = (f.vy / sp) * (1.2 + wave * 0.08);
        if (Math.hypot(f.x - ship.x, f.y - ship.y) < f.r + 12) {
          end();
          return;
        }
      }

      for (let i = foes.length - 1; i >= 0; i--) {
        const f = foes[i]!;
        for (let j = bullets.length - 1; j >= 0; j--) {
          const b = bullets[j]!;
          if (Math.hypot(f.x - b.x, f.y - b.y) < f.r + 3) {
            bullets.splice(j, 1);
            f.hp--;
            if (f.hp <= 0) {
              foes.splice(i, 1);
              score += 100 + wave * 20;
              onScore(score);
            }
            break;
          }
        }
      }

      // draw
      ctx.fillStyle = "#05060f";
      ctx.fillRect(0, 0, w, h);
      for (const s of stars) {
        s.y += s.z * 1.4;
        if (s.y > h) s.y = 0;
        ctx.fillStyle = `rgba(255,255,255,${0.25 + s.z * 0.5})`;
        ctx.fillRect(s.x, s.y, s.z * 1.6, s.z * 1.6);
      }

      // ship
      ctx.save();
      ctx.translate(ship.x, ship.y);
      ctx.rotate(ship.a);
      const g = ctx.createLinearGradient(-10, 0, 22, 0);
      g.addColorStop(0, "#22d3ee");
      g.addColorStop(1, "#a78bfa");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(20, 0);
      ctx.lineTo(-12, 10);
      ctx.lineTo(-6, 0);
      ctx.lineTo(-12, -10);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = "#fbbf24";
      for (const b of bullets) {
        ctx.beginPath();
        ctx.arc(b.x, b.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }

      for (const f of foes) {
        ctx.fillStyle = "#fb7185";
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,.35)";
        ctx.stroke();
      }

      ctx.fillStyle = "rgba(255,255,255,.85)";
      ctx.font = "600 13px ui-sans-serif,system-ui";
      ctx.fillText(`SCORE ${score.toLocaleString()}`, 14, 24);
      ctx.fillText(`WAVE ${wave}`, 14, 42);

      raf = requestAnimationFrame(tick);
    };
    spawnWave();
    raf = requestAnimationFrame(tick);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
    };
  }, [onOver, onScore]);

  return <canvas ref={canvasRef} className="size-full touch-none" />;
}
