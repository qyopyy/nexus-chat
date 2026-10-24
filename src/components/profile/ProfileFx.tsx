"use client";

import { useEffect, useRef } from "react";
import type { ProfileBorder, ProfileEffect, ProfileTheme } from "@/lib/types";

// Profile flair: an animated background that bursts when the profile opens, then keeps a gentle loop;
// animated card borders and colour themes.

export const EFFECTS: { id: ProfileEffect; label: string; emoji: string }[] = [
  { id: "none", label: "None", emoji: "⛔" },
  { id: "aurora", label: "Aurora", emoji: "🌌" },
  { id: "stars", label: "Starfield", emoji: "✨" },
  { id: "hearts", label: "Hearts", emoji: "💖" },
  { id: "snow", label: "Snow", emoji: "❄️" },
  { id: "matrix", label: "Matrix", emoji: "🟩" },
  { id: "confetti", label: "Confetti", emoji: "🎉" },
  { id: "fire", label: "Embers", emoji: "🔥" },
  { id: "bubbles", label: "Bubbles", emoji: "🫧" },
  { id: "neon", label: "Neon waves", emoji: "🌈" },
];
export const BORDERS: { id: ProfileBorder; label: string; css: string }[] = [
  { id: "none", label: "None", css: "" },
  { id: "rainbow", label: "Rainbow", css: "conic-gradient(#ff2bd6,#ffd400,#00ff9c,#00e5ff,#7c4dff,#ff2bd6)" },
  { id: "neon", label: "Neon", css: "conic-gradient(#00e5ff,#ff2bd6,#00e5ff)" },
  { id: "gold", label: "Gold", css: "conic-gradient(#7a5b00,#ffd400,#fff3b0,#ffd400,#7a5b00)" },
  { id: "fire", label: "Fire", css: "conic-gradient(#ff2b2b,#ff9f2b,#ffd400,#ff2b2b)" },
  { id: "ice", label: "Ice", css: "conic-gradient(#d0f4ff,#2aabee,#ffffff,#2aabee,#d0f4ff)" },
];
export const THEMES: { id: ProfileTheme; label: string; bg: string }[] = [
  { id: "none", label: "Default", bg: "" },
  { id: "midnight", label: "Midnight", bg: "linear-gradient(180deg,#0b1030,#05060f)" },
  { id: "sunset", label: "Sunset", bg: "linear-gradient(180deg,#3a0b2a,#2a0b0b 60%,#1a0f05)" },
  { id: "ocean", label: "Ocean", bg: "linear-gradient(180deg,#05253a,#041624)" },
  { id: "forest", label: "Forest", bg: "linear-gradient(180deg,#0b2a17,#06140c)" },
  { id: "candy", label: "Candy", bg: "linear-gradient(180deg,#3a0b3a,#1b0b3a)" },
  { id: "mono", label: "Mono", bg: "linear-gradient(180deg,#1c1c1c,#0a0a0a)" },
];

type P = { x: number; y: number; vx: number; vy: number; r: number; life: number; c: string; a: number; ch?: string };
const COLORS = ["#ff2bd6", "#ffd400", "#00ff9c", "#00e5ff", "#7c4dff", "#ff6b2b"];

/** full-card animated background; `seed` restarts the intro burst */
export function EffectCanvas({ effect, accent = "#5865F2", seed }: { effect?: ProfileEffect | null; accent?: string; seed?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!effect || effect === "none") return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const cv = ref.current!;
    const ctx = cv.getContext("2d")!;
    let W = 0, H = 0; // prettier-ignore
    const fit = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      W = cv.clientWidth;
      H = cv.clientHeight;
      cv.width = W * dpr;
      cv.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(cv);
    const ps: P[] = [];
    const r = Math.random;
    const t0 = performance.now();
    const spawn = (burst: boolean) => {
      const c = COLORS[Math.floor(r() * COLORS.length)];
      switch (effect) {
        case "hearts":
          ps.push({ x: burst ? W / 2 + (r() - 0.5) * 80 : r() * W, y: burst ? 70 : H + 10, vx: (r() - 0.5) * (burst ? 220 : 20), vy: burst ? -120 - r() * 160 : -30 - r() * 40, r: 8 + r() * 10, life: burst ? 2.5 : 8, c, a: 1, ch: ["💖", "💗", "💕", "❤️"][Math.floor(r() * 4)] });
          break;
        case "snow":
          ps.push({ x: r() * W, y: burst ? r() * H * 0.4 : -10, vx: (r() - 0.5) * 20, vy: 20 + r() * 40, r: 1 + r() * 2.5, life: 20, c: "#fff", a: 0.8 });
          break;
        case "confetti":
          ps.push({ x: burst ? W / 2 : r() * W, y: burst ? 60 : -10, vx: burst ? (r() - 0.5) * 520 : (r() - 0.5) * 30, vy: burst ? -150 - r() * 250 : 40 + r() * 40, r: 3 + r() * 4, life: burst ? 3.2 : 12, c, a: r() * 6 });
          break;
        case "fire":
          ps.push({ x: r() * W, y: H + 5, vx: (r() - 0.5) * 30, vy: -(burst ? 140 : 40) - r() * 80, r: 1 + r() * 2.5, life: 3 + r() * 3, c: ["#ff2b2b", "#ff9f2b", "#ffd400"][Math.floor(r() * 3)], a: 1 });
          break;
        case "bubbles":
          ps.push({ x: r() * W, y: H + 20, vx: 0, vy: -(burst ? 120 : 30) - r() * 40, r: 4 + r() * 12, life: 12, c: accent, a: r() * 6 });
          break;
        case "stars":
          ps.push({ x: r() * W, y: r() * H, vx: 0, vy: 0, r: 0.5 + r() * 1.6, life: 4 + r() * 6, c: "#fff", a: r() * 6 });
          break;
        case "matrix":
          ps.push({ x: Math.floor(r() * (W / 14)) * 14, y: burst ? r() * -H : -20, vx: 0, vy: 90 + r() * 120, r: 12, life: 10, c: "#00ff6a", a: 1, ch: String.fromCharCode(0x30a0 + Math.floor(r() * 96)) });
          break;
      }
    };
    // intro burst
    const burstN = { hearts: 26, snow: 60, confetti: 90, fire: 50, bubbles: 22, stars: 90, matrix: 40, aurora: 0, neon: 0, none: 0 }[effect];
    for (let i = 0; i < burstN; i++) spawn(true);

    let raf = 0;
    let last = t0;
    let shoot: { x: number; y: number; t: number } | null = null;
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const age = (now - t0) / 1000;
      ctx.clearRect(0, 0, W, H);
      const intro = Math.max(0, 1 - age / 1.6); // 1 → 0 over the opening

      if (effect === "aurora") {
        for (let i = 0; i < 3; i++) {
          const x = W * (0.2 + 0.3 * i) + Math.sin(age * 0.6 + i * 2) * W * 0.25;
          const y = H * 0.25 + Math.cos(age * 0.4 + i) * H * 0.12;
          const g = ctx.createRadialGradient(x, y, 0, x, y, W * (0.6 + intro * 0.4));
          g.addColorStop(0, ["rgba(0,255,156,.35)", "rgba(124,77,255,.32)", "rgba(0,229,255,.3)"][i]);
          g.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, W, H);
        }
      } else if (effect === "neon") {
        ctx.lineWidth = 2;
        for (let i = 0; i < 5; i++) {
          ctx.strokeStyle = COLORS[i];
          ctx.globalAlpha = 0.35 + intro * 0.5;
          ctx.beginPath();
          for (let x = 0; x <= W; x += 8) {
            const y = H * (0.15 + i * 0.17) + Math.sin(x / 40 + age * (1.5 + i * 0.3) + i) * (10 + intro * 30);
            if (x) ctx.lineTo(x, y);
            else ctx.moveTo(x, y);
          }
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      } else {
        const rate = { hearts: 0.8, snow: 3, confetti: 1.5, fire: 4, bubbles: 1.2, stars: 1.5, matrix: 4 }[effect as "hearts"] ?? 0;
        if (!reduce && r() < rate * dt * 6) spawn(false);
        if (effect === "stars") {
          if (!shoot && r() < dt * 0.25) shoot = { x: r() * W, y: r() * H * 0.4, t: 0 };
          if (shoot) {
            shoot.t += dt;
            ctx.strokeStyle = `rgba(255,255,255,${1 - shoot.t})`;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(shoot.x + shoot.t * 300, shoot.y + shoot.t * 120);
            ctx.lineTo(shoot.x + shoot.t * 300 - 50, shoot.y + shoot.t * 120 - 20);
            ctx.stroke();
            if (shoot.t > 1) shoot = null;
          }
        }
        for (let i = ps.length - 1; i >= 0; i--) {
          const p = ps[i];
          p.life -= dt;
          if (p.life <= 0 || p.y > H + 40 || p.y < -60) {
            ps.splice(i, 1);
            continue;
          }
          if (effect === "confetti") p.vy += 320 * dt;
          if (effect === "hearts") ((p.vy -= 25 * dt), (p.vx *= 1 - 1.2 * dt));
          if (effect === "confetti") p.vx *= 1 - 1.5 * dt;
          if (effect === "snow" || effect === "bubbles") p.vx = Math.sin(age + p.y / 30) * 15;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.a += dt * 4;
          const fade = Math.min(1, p.life);
          ctx.globalAlpha = fade;
          if (p.ch) {
            ctx.font = `${effect === "matrix" ? 13 : p.r * 2}px ${effect === "matrix" ? "monospace" : "sans-serif"}`;
            ctx.fillStyle = p.c;
            if (effect === "matrix" && r() < 0.05) p.ch = String.fromCharCode(0x30a0 + Math.floor(r() * 96));
            ctx.fillText(p.ch, p.x, p.y);
          } else if (effect === "confetti") {
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.a);
            ctx.fillStyle = p.c;
            ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r);
            ctx.restore();
          } else if (effect === "bubbles") {
            ctx.strokeStyle = p.c;
            ctx.globalAlpha = fade * 0.6;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, 7);
            ctx.stroke();
          } else {
            const tw = effect === "stars" ? 0.4 + 0.6 * Math.abs(Math.sin(p.a)) : 1;
            ctx.globalAlpha = fade * tw;
            ctx.fillStyle = p.c;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, 7);
            ctx.fill();
          }
        }
        ctx.globalAlpha = 1;
      }
      // opening flash
      if (intro > 0) {
        const g = ctx.createRadialGradient(W / 2, 60, 0, W / 2, 60, W);
        g.addColorStop(0, `rgba(255,255,255,${0.18 * intro})`);
        g.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }
      if (!reduce || age < 2) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [effect, accent, seed]);
  if (!effect || effect === "none") return null;
  return <canvas ref={ref} className="pointer-events-none absolute inset-0 z-0 size-full" aria-hidden />;
}

/** spinning gradient ring behind the card (shows as a 2px animated border) */
export function BorderRing({ border }: { border?: ProfileBorder | null }) {
  const b = BORDERS.find((x) => x.id === border);
  if (!b || !b.css) return null;
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl" aria-hidden>
      <div className="absolute top-1/2 left-1/2 aspect-square w-[160%] -translate-x-1/2 -translate-y-1/2 animate-[spin_4s_linear_infinite]" style={{ background: b.css }} />
    </div>
  );
}

export const themeBg = (t?: ProfileTheme | null) => THEMES.find((x) => x.id === t)?.bg || "";
