"use client";

import { useEffect, useRef } from "react";
import { type GameProps } from "./common";

// Web Swing — hold to shoot a web at the rooftops ahead, release to fly. Pendulum physics, combos
// for flips & orb chains, drones to dodge. Don't touch the street.

type Building = { x: number; w: number; h: number; hue: number; seed: number; spire: number };
type Anchor = { x: number; y: number };
type Orb = { x: number; y: number; taken: boolean };
type Drone = { x: number; y: number; ph: number; hit: boolean };

const GROUND = 1000; // world y of the street
const G = 1500;

export default function WebSwing({ onOver, onScore }: GameProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!;
    const ctx = cv.getContext("2d")!;
    let W = 0,
      H = 0,
      S = 1; // world→screen scale
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      W = cv.clientWidth;
      H = cv.clientHeight;
      cv.width = W * dpr;
      cv.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      S = H / 900;
    };
    resize();
    window.addEventListener("resize", resize);

    // ---- audio
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    let ac: AudioContext | null = null;
    const blip = (f: number, d = 0.12, type: OscillatorType = "triangle", vol = 0.07) => {
      try {
        ac ??= new AC();
        void ac.resume();
        const t = ac.currentTime;
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.type = type;
        o.frequency.setValueAtTime(f, t);
        o.frequency.exponentialRampToValueAtTime(f * 1.5, t + d);
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        o.connect(g).connect(ac.destination);
        o.start(t);
        o.stop(t + d + 0.02);
      } catch {
        /* no audio */
      }
    };
    const thwip = () => blip(900, 0.08, "sawtooth", 0.04);

    // ---- world
    let seed = 1337;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const buildings: Building[] = [];
    const anchors: Anchor[] = [];
    const orbs: Orb[] = [];
    const drones: Drone[] = [];
    let genX = -400;
    const gen = (until: number) => {
      while (genX < until) {
        const w = 120 + rnd() * 160;
        const gap = 30 + rnd() * 90;
        const progress = Math.max(0, genX / 20000);
        const h = 300 + rnd() * 460 - progress * 80;
        const b: Building = { x: genX, w, h, hue: 220 + rnd() * 70, seed: Math.floor(rnd() * 1e6), spire: rnd() < 0.35 ? 60 + rnd() * 120 : 0 };
        buildings.push(b);
        const top = GROUND - h;
        anchors.push({ x: genX + 6, y: top }, { x: genX + w - 6, y: top });
        if (b.spire) anchors.push({ x: genX + w / 2, y: top - b.spire });
        if (rnd() < 0.6) orbs.push({ x: genX + w / 2 + (rnd() - 0.5) * 200, y: top - 140 - rnd() * 200, taken: false });
        if (genX > 1600 && rnd() < 0.22 + Math.min(0.25, progress * 0.4)) drones.push({ x: genX + w + gap / 2, y: top - 120 - rnd() * 260, ph: rnd() * 6, hit: false });
        genX += w + gap;
      }
    };
    gen(3000);

    // ---- player
    const p = { x: 0, y: GROUND - 650, vx: 380, vy: -100, rot: 0, spin: 0 };
    let rope: { a: Anchor; len: number } | null = null;
    let holding = false;
    let started = false;
    let over = false;
    let dist = 0,
      bonus = 0,
      combo = 0,
      comboT = 0,
      lives = 3,
      invuln = 0,
      airRot = 0,
      shake = 0,
      t = 0;
    const camera = { x: 0, y: GROUND - 650 };
    const parts: { x: number; y: number; vx: number; vy: number; life: number; c: string }[] = [];
    const popups: { x: number; y: number; text: string; life: number }[] = [];

    const bestAnchor = (): Anchor | null => {
      let best: Anchor | null = null;
      let bestScore = -Infinity;
      for (const a of anchors) {
        const dx = a.x - p.x;
        const dy = a.y - p.y;
        if (dx < -40 || dx > 560 || dy > -60) continue;
        const d = Math.hypot(dx, dy);
        if (d > 600 || d < 90) continue;
        const sc = dx * 1.2 - Math.abs(d - 330) * 0.6 + (p.vx > 0 ? 0 : -dx);
        if (sc > bestScore) {
          bestScore = sc;
          best = a;
        }
      }
      return best;
    };
    const attach = () => {
      if (over) return;
      started = true;
      holding = true;
      const a = bestAnchor();
      if (!a) return;
      rope = { a, len: Math.max(110, Math.min(520, Math.hypot(a.x - p.x, a.y - p.y))) };
      thwip();
    };
    const release = () => {
      holding = false;
      if (!rope) return;
      rope = null;
      // release boost when swinging forward & upward
      if (p.vx > 200 && p.vy < 0) {
        p.vy -= 120;
        p.vx += 60;
      }
      p.spin = Math.max(-14, Math.min(14, p.vx / 70));
    };
    const down = (e: Event) => {
      e.preventDefault();
      attach();
    };
    const up = () => release();
    const key = (e: KeyboardEvent) => {
      if (e.code !== "Space" && e.code !== "ArrowUp") return;
      e.preventDefault();
      if (e.type === "keydown" && !e.repeat) attach();
      if (e.type === "keyup") release();
    };
    cv.addEventListener("pointerdown", down);
    window.addEventListener("pointerup", up);
    window.addEventListener("keydown", key);
    window.addEventListener("keyup", key);

    const score = () => Math.floor(dist / 10) + bonus;
    const hurt = () => {
      if (invuln > 0) return;
      lives--;
      invuln = 1.6;
      shake = 0.5;
      combo = 0;
      blip(120, 0.35, "sawtooth", 0.12);
      if (lives <= 0) finish();
    };
    const finish = () => {
      if (over) return;
      over = true;
      rope = null;
      setTimeout(() => onOver(score()), 900);
    };

    // ---- drawing helpers
    const sx = (x: number) => (x - camera.x) * S + W * 0.32;
    const sy = (y: number) => (y - camera.y) * S + H * 0.45;
    const stars = Array.from({ length: 140 }, () => ({ x: Math.random(), y: Math.random() * 0.7, r: Math.random() * 1.4 + 0.3 }));

    const drawSkyline = (factor: number, color: string, hMul: number, step: number, s0: number) => {
      ctx.fillStyle = color;
      const off = (camera.x * factor) % step;
      let k = Math.floor((camera.x * factor) / step);
      for (let x = -off - step; x < W + step; x += step, k++) {
        const r = Math.abs(Math.sin(k * 12.9898 + s0) * 43758.5453) % 1;
        const h = (0.18 + r * 0.32) * H * hMul;
        ctx.fillRect(x, H - h - H * 0.06, step - 6, h + H * 0.06);
        if (r > 0.7) ctx.fillRect(x + step * 0.4, H - h - H * 0.06 - 30, 4, 30);
      }
    };

    const drawHero = () => {
      const x = sx(p.x),
        y = sy(p.y),
        k = S * 1.05;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(p.rot);
      ctx.scale(k, k);
      if (invuln > 0 && Math.floor(invuln * 12) % 2 === 0) ctx.globalAlpha = 0.45;
      const swinging = !!rope;
      // cape-ish speed trail
      ctx.fillStyle = "rgba(139,92,255,.35)";
      ctx.beginPath();
      ctx.moveTo(-6, -10);
      ctx.quadraticCurveTo(-30 - Math.min(40, Math.abs(p.vx) / 20), 0, -36 - Math.min(50, Math.abs(p.vx) / 15), 18);
      ctx.lineTo(-4, 6);
      ctx.fill();
      // legs
      ctx.strokeStyle = "#1a1035";
      ctx.lineWidth = 7;
      ctx.lineCap = "round";
      ctx.beginPath();
      const kick = Math.sin(t * 10) * (swinging ? 0.2 : 0.6);
      ctx.moveTo(-3, 12);
      ctx.lineTo(-8 + kick * 10, 32);
      ctx.moveTo(4, 12);
      ctx.lineTo(10 - kick * 10, swinging ? 30 : 26);
      ctx.stroke();
      // body
      const grd = ctx.createLinearGradient(0, -22, 0, 16);
      grd.addColorStop(0, "#8b5cff");
      grd.addColorStop(1, "#2b1a6a");
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.roundRect(-9, -16, 18, 30, 8);
      ctx.fill();
      // chest emblem (neon N)
      ctx.strokeStyle = "#00e5ff";
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(-4, 4);
      ctx.lineTo(-4, -8);
      ctx.lineTo(4, 4);
      ctx.lineTo(4, -8);
      ctx.stroke();
      // arm toward the rope
      ctx.strokeStyle = "#2b1a6a";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(4, -12);
      if (swinging && rope) {
        const a = Math.atan2(sy(rope.a.y) - y, sx(rope.a.x) - x) - p.rot;
        ctx.lineTo(4 + Math.cos(a) * 18, -12 + Math.sin(a) * 18);
      } else ctx.lineTo(18, -2 + Math.sin(t * 8) * 4);
      ctx.moveTo(-4, -12);
      ctx.lineTo(-16, -2);
      ctx.stroke();
      // head + mask with big white eyes
      ctx.fillStyle = "#22114a";
      ctx.beginPath();
      ctx.arc(0, -24, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#e9fbff";
      ctx.shadowColor = "#00e5ff";
      ctx.shadowBlur = 8;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(s * 4.2 + 1.5, -25, 3.6, 2.4, s * 0.45, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    };

    // ---- loop
    let last = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      t += dt;
      if (started && !over) {
        // physics
        p.vy += G * dt;
        if (rope) {
          // swing pump: a little push along the motion keeps momentum fun
          const ax = p.x - rope.a.x,
            ay = p.y - rope.a.y;
          const d = Math.hypot(ax, ay) || 1;
          const tx = -ay / d,
            ty = ax / d;
          const along = p.vx * tx + p.vy * ty;
          p.vx += tx * Math.sign(along) * 220 * dt;
          p.vy += ty * Math.sign(along) * 220 * dt;
          if (rope.len > 140) rope.len -= 40 * dt; // slowly reel in
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (rope) {
          const ax = p.x - rope.a.x,
            ay = p.y - rope.a.y;
          const d = Math.hypot(ax, ay);
          if (d > rope.len) {
            const nx = ax / d,
              ny = ay / d;
            p.x = rope.a.x + nx * rope.len;
            p.y = rope.a.y + ny * rope.len;
            const radial = p.vx * nx + p.vy * ny;
            if (radial > 0) {
              p.vx -= radial * nx;
              p.vy -= radial * ny;
            }
          }
          // auto-detach once well past the anchor
          if (p.x > rope.a.x + 260 && p.y < rope.a.y + 80) {
            rope = null;
            p.spin = Math.max(-14, Math.min(14, p.vx / 70));
          }
        } else if (holding) {
          const a = bestAnchor();
          if (a && p.vy > -50) {
            rope = { a, len: Math.max(110, Math.min(520, Math.hypot(a.x - p.x, a.y - p.y))) };
            thwip();
          }
        }
        p.vx *= 1 - 0.05 * dt;
        p.vx = Math.max(-200, Math.min(1400, p.vx));
        // rotation: lean with velocity when swinging, flip when free
        if (rope) {
          const target = Math.atan2(rope.a.y - p.y, rope.a.x - p.x) + Math.PI / 2;
          p.rot += (target - p.rot) * Math.min(1, dt * 12);
          if (Math.abs(airRot) >= Math.PI * 1.8) {
            const flips = Math.round(Math.abs(airRot) / (Math.PI * 2));
            const pts = 150 * flips * (1 + combo * 0.25);
            bonus += Math.round(pts);
            combo++;
            comboT = 2.5;
            popups.push({ x: p.x, y: p.y - 40, text: `${flips > 1 ? flips + "× " : ""}FLIP +${Math.round(pts)}`, life: 1.2 });
            blip(660, 0.18, "square", 0.05);
          }
          airRot = 0;
        } else {
          p.rot += p.spin * dt;
          airRot += p.spin * dt;
          p.spin *= 1 - 0.4 * dt;
        }
        dist = Math.max(dist, p.x);
        // orbs
        for (const o of orbs) {
          if (o.taken || Math.abs(o.x - p.x) > 40 || Math.abs(o.y - p.y) > 40) continue;
          o.taken = true;
          combo++;
          comboT = 2.5;
          const pts = Math.round(50 * (1 + combo * 0.25));
          bonus += pts;
          popups.push({ x: o.x, y: o.y - 20, text: `+${pts}`, life: 0.9 });
          blip(880 + combo * 40, 0.1, "sine", 0.06);
          for (let i = 0; i < 12; i++) parts.push({ x: o.x, y: o.y, vx: (Math.random() - 0.5) * 400, vy: (Math.random() - 0.5) * 400, life: 0.6, c: "#00e5ff" });
        }
        // drones
        for (const d of drones) {
          if (d.hit) continue;
          const dy = d.y + Math.sin(t * 2 + d.ph) * 40;
          if (Math.abs(d.x - p.x) < 34 && Math.abs(dy - p.y) < 34) {
            d.hit = true;
            hurt();
            for (let i = 0; i < 18; i++) parts.push({ x: d.x, y: dy, vx: (Math.random() - 0.5) * 500, vy: (Math.random() - 0.5) * 500, life: 0.7, c: "#ff4d6d" });
          }
        }
        if ((comboT -= dt) <= 0) combo = 0;
        invuln = Math.max(0, invuln - dt);
        // street = fail (bounce back up if you still have lives)
        if (p.y > GROUND - 20) {
          if (lives > 1) {
            hurt();
            p.y = GROUND - 20;
            p.vy = -900;
            p.vx = Math.max(300, p.vx);
          } else {
            lives = 0;
            shake = 0.6;
            blip(90, 0.5, "sawtooth", 0.14);
            finish();
          }
        }
        gen(p.x + 3000);
        onScore(score());
      } else if (!started) {
        p.y = GROUND - 650 + Math.sin(t * 2) * 10;
      }
      // camera
      camera.x += (p.x + Math.max(0, p.vx) * 0.25 - camera.x) * Math.min(1, dt * 4);
      camera.y += (Math.min(GROUND - 380, p.y) - camera.y) * Math.min(1, dt * 3);
      shake = Math.max(0, shake - dt);

      // ---- render
      ctx.save();
      if (shake > 0) ctx.translate((Math.random() - 0.5) * shake * 24, (Math.random() - 0.5) * shake * 24);
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, "#07021a");
      sky.addColorStop(0.55, "#2a0b4d");
      sky.addColorStop(1, "#ff2bd6");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);
      for (const s of stars) {
        ctx.fillStyle = `rgba(255,255,255,${0.4 + 0.6 * Math.abs(Math.sin(t + s.x * 30))})`;
        ctx.fillRect(((s.x * W - camera.x * 0.02) % W + W) % W, s.y * H, s.r, s.r);
      }
      ctx.fillStyle = "rgba(255,240,220,.9)";
      ctx.shadowColor = "#ffe6b0";
      ctx.shadowBlur = 40;
      ctx.beginPath();
      ctx.arc(W * 0.8, H * 0.2, Math.min(W, H) * 0.07, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      drawSkyline(0.1, "#1a0838", 1.1, 70, 1);
      drawSkyline(0.25, "#12052a", 1.4, 95, 7);

      // buildings
      for (const b of buildings) {
        const x0 = sx(b.x),
          x1 = sx(b.x + b.w);
        if (x1 < -50 || x0 > W + 50) continue;
        const top = sy(GROUND - b.h);
        const bottom = sy(GROUND) + 10;
        const g2 = ctx.createLinearGradient(0, top, 0, bottom);
        g2.addColorStop(0, `hsl(${b.hue} 35% 18%)`);
        g2.addColorStop(1, `hsl(${b.hue} 40% 8%)`);
        ctx.fillStyle = g2;
        ctx.fillRect(x0, top, x1 - x0, bottom - top);
        // windows
        let ws = b.seed;
        const wr = () => ((ws = (ws * 16807) % 2147483647) / 2147483647);
        const cw = 16 * S,
          ch = 22 * S;
        for (let yy = top + 14 * S; yy < bottom - 20; yy += ch + 10 * S)
          for (let xx = x0 + 10 * S; xx < x1 - cw; xx += cw + 9 * S) {
            const lit = wr() > 0.55;
            ctx.fillStyle = lit ? (wr() > 0.85 ? "rgba(0,229,255,.75)" : "rgba(255,214,140,.7)") : "rgba(255,255,255,.05)";
            ctx.fillRect(xx, yy, cw, ch);
          }
        ctx.fillStyle = `hsl(${b.hue} 60% 55%)`;
        ctx.fillRect(x0, top, x1 - x0, 3);
        if (b.spire) {
          const cx = sx(b.x + b.w / 2);
          ctx.strokeStyle = `hsl(${b.hue} 30% 40%)`;
          ctx.lineWidth = 4 * S;
          ctx.beginPath();
          ctx.moveTo(cx, top);
          ctx.lineTo(cx, sy(GROUND - b.h - b.spire));
          ctx.stroke();
          ctx.fillStyle = Math.sin(t * 4 + b.seed) > 0 ? "#ff4d6d" : "#5a1020";
          ctx.beginPath();
          ctx.arc(cx, sy(GROUND - b.h - b.spire), 4 * S, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // street
      ctx.fillStyle = "#0a0614";
      ctx.fillRect(0, sy(GROUND), W, H);
      ctx.fillStyle = "rgba(255,43,214,.5)";
      ctx.fillRect(0, sy(GROUND), W, 3);
      for (let x = (-(camera.x * S) % 80) - 80; x < W; x += 80) {
        ctx.fillStyle = "rgba(255,255,255,.25)";
        ctx.fillRect(x, sy(GROUND) + 40 * S, 40, 4);
      }

      // target hint
      if (!rope && !over) {
        const a = bestAnchor();
        if (a) {
          ctx.strokeStyle = "rgba(0,229,255,.7)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(sx(a.x), sy(a.y), 9 + Math.sin(t * 8) * 2, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      // orbs
      for (const o of orbs) {
        if (o.taken) continue;
        const x = sx(o.x),
          y = sy(o.y + Math.sin(t * 3 + o.x) * 6);
        if (x < -30 || x > W + 30) continue;
        ctx.fillStyle = "#00e5ff";
        ctx.shadowColor = "#00e5ff";
        ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.arc(x, y, 8 * S + 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      // drones
      for (const d of drones) {
        if (d.hit) continue;
        const x = sx(d.x),
          y = sy(d.y + Math.sin(t * 2 + d.ph) * 40);
        if (x < -40 || x > W + 40) continue;
        ctx.fillStyle = "#1b1b26";
        ctx.beginPath();
        ctx.roundRect(x - 20 * S, y - 8 * S, 40 * S, 16 * S, 6 * S);
        ctx.fill();
        ctx.fillStyle = "#ff4d6d";
        ctx.shadowColor = "#ff4d6d";
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(x, y, 5 * S, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = "rgba(255,255,255,.5)";
        ctx.lineWidth = 2;
        for (const s of [-1, 1]) {
          const r = 14 * S * Math.abs(Math.sin(t * 40));
          ctx.beginPath();
          ctx.moveTo(x + s * 18 * S - r, y - 12 * S);
          ctx.lineTo(x + s * 18 * S + r, y - 12 * S);
          ctx.stroke();
        }
      }
      // web
      if (rope) {
        ctx.strokeStyle = "rgba(255,255,255,.92)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(sx(rope.a.x), sy(rope.a.y));
        ctx.lineTo(sx(p.x) + Math.cos(p.rot - Math.PI / 2) * 14 * S, sy(p.y) + Math.sin(p.rot - Math.PI / 2) * 14 * S);
        ctx.stroke();
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(sx(rope.a.x), sy(rope.a.y), 4, 0, Math.PI * 2);
        ctx.fill();
      }
      // speed lines
      if (p.vx > 700) {
        ctx.strokeStyle = "rgba(255,255,255,.18)";
        ctx.lineWidth = 2;
        for (let i = 0; i < 6; i++) {
          const yy = (Math.sin(i * 91 + t * 3) * 0.5 + 0.5) * H;
          ctx.beginPath();
          ctx.moveTo(W, yy);
          ctx.lineTo(W - 80 - (p.vx - 700) * 0.2, yy);
          ctx.stroke();
        }
      }
      drawHero();
      // particles & popups
      for (const q of parts) {
        q.life -= dt;
        q.x += q.vx * dt;
        q.y += q.vy * dt;
        ctx.globalAlpha = Math.max(0, q.life * 1.6);
        ctx.fillStyle = q.c;
        ctx.fillRect(sx(q.x), sy(q.y), 3, 3);
      }
      ctx.globalAlpha = 1;
      for (let i = parts.length - 1; i >= 0; i--) if (parts[i].life <= 0) parts.splice(i, 1);
      ctx.font = `900 ${Math.round(16 + S * 6)}px system-ui`;
      ctx.textAlign = "center";
      for (const q of popups) {
        q.life -= dt;
        q.y -= 50 * dt;
        ctx.globalAlpha = Math.max(0, q.life);
        ctx.fillStyle = "#fff";
        ctx.fillText(q.text, sx(q.x), sy(q.y));
      }
      ctx.globalAlpha = 1;
      for (let i = popups.length - 1; i >= 0; i--) if (popups[i].life <= 0) popups.splice(i, 1);
      ctx.restore();

      // HUD
      ctx.textAlign = "left";
      ctx.fillStyle = "#fff";
      ctx.font = "900 28px system-ui";
      ctx.fillText(score().toLocaleString(), 16, 40);
      ctx.font = "600 13px system-ui";
      ctx.fillStyle = "rgba(255,255,255,.7)";
      ctx.fillText(`${Math.floor(dist / 10)} m`, 16, 60);
      ctx.textAlign = "right";
      ctx.font = "20px system-ui";
      ctx.fillText("❤".repeat(Math.max(0, lives)) + "♡".repeat(Math.max(0, 3 - lives)), W - 16, 36);
      if (combo > 1) {
        ctx.fillStyle = "#00e5ff";
        ctx.font = "900 18px system-ui";
        ctx.fillText(`COMBO ×${combo}`, W - 16, 62);
      }
      if (!started) {
        ctx.textAlign = "center";
        ctx.fillStyle = "rgba(0,0,0,.45)";
        ctx.fillRect(W / 2 - 170, H * 0.62 - 34, 340, 70);
        ctx.fillStyle = "#fff";
        ctx.font = "900 20px system-ui";
        ctx.fillText("HOLD to web · RELEASE to fly", W / 2, H * 0.62);
        ctx.font = "13px system-ui";
        ctx.fillStyle = "rgba(255,255,255,.75)";
        ctx.fillText("Flip in the air & grab orbs for combos · dodge drones · don't hit the street", W / 2, H * 0.62 + 22);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      cv.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("keydown", key);
      window.removeEventListener("keyup", key);
      void ac?.close();
    };
  }, [onOver, onScore]);
  return <canvas ref={ref} className="block size-full touch-none select-none" />;
}
