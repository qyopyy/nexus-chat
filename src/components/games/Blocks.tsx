"use client";

import { useEffect, useRef } from "react";
import { TouchPad, useKeyPress, type GameProps } from "./common";

// Neon Blocks — falling-block puzzle. Clear lines, speed goes up every 10 lines.
const COLS = 10;
const ROWS = 20;
const SHAPES: { c: string; m: number[][] }[] = [
  { c: "#00e5ff", m: [[1, 1, 1, 1]] },
  { c: "#ffd400", m: [[1, 1], [1, 1]] }, // prettier-ignore
  { c: "#b44dff", m: [[0, 1, 0], [1, 1, 1]] }, // prettier-ignore
  { c: "#00ff9c", m: [[0, 1, 1], [1, 1, 0]] }, // prettier-ignore
  { c: "#ff4d6d", m: [[1, 1, 0], [0, 1, 1]] }, // prettier-ignore
  { c: "#2b7bff", m: [[1, 0, 0], [1, 1, 1]] }, // prettier-ignore
  { c: "#ff9f2b", m: [[0, 0, 1], [1, 1, 1]] }, // prettier-ignore
];
type Piece = { m: number[][]; c: string; x: number; y: number };
const rotate = (m: number[][]) => m[0].map((_, i) => m.map((r) => r[i]).reverse());

export default function Blocks({ onOver, onScore }: GameProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const api = useRef<{ press: (k: "up" | "down" | "left" | "right" | "action") => void }>({ press: () => {} });
  useKeyPress((k) => api.current.press(k));

  useEffect(() => {
    const cv = ref.current!;
    const ctx = cv.getContext("2d")!;
    const grid: (string | null)[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    let bag: number[] = [];
    const nextShape = () => {
      if (!bag.length) bag = [0, 1, 2, 3, 4, 5, 6].sort(() => Math.random() - 0.5);
      const s = SHAPES[bag.pop()!];
      return { m: s.m.map((r) => [...r]), c: s.c, x: Math.floor((COLS - s.m[0].length) / 2), y: 0 } as Piece;
    };
    let cur = nextShape();
    let next = nextShape();
    let score = 0, lines = 0, level = 1, acc = 0, over = false, flashRows: number[] = [], flashT = 0; // prettier-ignore
    const fits = (p: Piece, dx = 0, dy = 0, m = p.m) =>
      m.every((row, y) => row.every((v, x) => !v || (p.x + x + dx >= 0 && p.x + x + dx < COLS && p.y + y + dy < ROWS && (p.y + y + dy < 0 || !grid[p.y + y + dy][p.x + x + dx]))));
    const lock = () => {
      cur.m.forEach((row, y) => row.forEach((v, x) => v && cur.y + y >= 0 && (grid[cur.y + y][cur.x + x] = cur.c)));
      const full = grid.map((r, i) => (r.every(Boolean) ? i : -1)).filter((i) => i >= 0);
      if (full.length) {
        flashRows = full;
        flashT = 0.18;
        for (const i of full) {
          grid.splice(i, 1);
          grid.unshift(Array(COLS).fill(null));
        }
        lines += full.length;
        score += [0, 100, 300, 500, 800][full.length] * level;
        level = 1 + Math.floor(lines / 10);
      }
      cur = next;
      next = nextShape();
      if (!fits(cur)) {
        over = true;
        draw();
        setTimeout(() => onOver(score), 900);
      }
      onScore(score);
    };
    api.current.press = (k) => {
      if (over) return;
      if (k === "left" && fits(cur, -1)) cur.x--;
      else if (k === "right" && fits(cur, 1)) cur.x++;
      else if (k === "down") {
        if (fits(cur, 0, 1)) {
          cur.y++;
          score += 1;
        } else lock();
      } else if (k === "up") {
        const r = rotate(cur.m);
        for (const kick of [0, -1, 1, -2, 2]) if (fits(cur, kick, 0, r)) ((cur.m = r), (cur.x += kick));
      } else if (k === "action") {
        while (fits(cur, 0, 1)) {
          cur.y++;
          score += 2;
        }
        lock();
      }
      draw();
    };

    const draw = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = cv.clientWidth, H = cv.clientHeight; // prettier-ignore
      cv.width = W * dpr;
      cv.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#07070d";
      ctx.fillRect(0, 0, W, H);
      const cell = Math.floor(Math.min((H - 30) / ROWS, (W - 130) / COLS, 34));
      const ox = Math.floor((W - cell * COLS - 110) / 2), oy = 16; // prettier-ignore
      ctx.fillStyle = "#11111c";
      ctx.fillRect(ox, oy, cell * COLS, cell * ROWS);
      ctx.strokeStyle = "rgba(255,255,255,.04)";
      for (let x = 0; x <= COLS; x++) ctx.strokeRect(ox + x * cell, oy, 0, cell * ROWS);
      const sq = (x: number, y: number, c: string, a = 1) => {
        ctx.globalAlpha = a;
        ctx.fillStyle = c;
        ctx.fillRect(ox + x * cell + 1, oy + y * cell + 1, cell - 2, cell - 2);
        ctx.fillStyle = "rgba(255,255,255,.25)";
        ctx.fillRect(ox + x * cell + 1, oy + y * cell + 1, cell - 2, 3);
        ctx.globalAlpha = 1;
      };
      grid.forEach((r, y) => r.forEach((c, x) => c && sq(x, y, c)));
      let gy = 0;
      while (fits(cur, 0, gy + 1)) gy++;
      cur.m.forEach((r, y) => r.forEach((v, x) => v && sq(cur.x + x, cur.y + y + gy, cur.c, 0.18)));
      cur.m.forEach((r, y) => r.forEach((v, x) => v && cur.y + y >= 0 && sq(cur.x + x, cur.y + y, cur.c)));
      if (flashT > 0) {
        ctx.fillStyle = "rgba(255,255,255,.5)";
        for (const r of flashRows) ctx.fillRect(ox, oy + r * cell, cell * COLS, cell);
      }
      const sx = ox + cell * COLS + 16;
      ctx.fillStyle = "#fff";
      ctx.font = "bold 13px ui-sans-serif, system-ui";
      ctx.fillText("NEXT", sx, oy + 14);
      next.m.forEach((r, y) => r.forEach((v, x) => v && ((ctx.fillStyle = next.c), ctx.fillRect(sx + x * 18, oy + 24 + y * 18, 16, 16))));
      ctx.fillStyle = "#b5bac1";
      ctx.font = "12px ui-sans-serif, system-ui";
      ctx.fillText("SCORE", sx, oy + 90);
      ctx.fillText("LINES", sx, oy + 136);
      ctx.fillText("LEVEL", sx, oy + 182);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 20px ui-sans-serif, system-ui";
      ctx.fillText(String(score), sx, oy + 112);
      ctx.fillText(String(lines), sx, oy + 158);
      ctx.fillText(String(level), sx, oy + 204);
      if (over) {
        ctx.fillStyle = "rgba(0,0,0,.6)";
        ctx.fillRect(ox, oy, cell * COLS, cell * ROWS);
        ctx.fillStyle = "#ff4d6d";
        ctx.font = "900 30px ui-sans-serif, system-ui";
        ctx.textAlign = "center";
        ctx.fillText("GAME OVER", ox + (cell * COLS) / 2, oy + (cell * ROWS) / 2);
        ctx.textAlign = "left";
      }
    };

    let last = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!over && !document.hidden) {
        acc += dt;
        flashT -= dt;
        const speed = Math.max(0.06, 0.8 - (level - 1) * 0.07);
        if (acc > speed) {
          acc = 0;
          if (fits(cur, 0, 1)) cur.y++;
          else lock();
        }
        draw();
      }
      if (!over) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [onOver, onScore]);

  return (
    <div className="relative size-full">
      <canvas ref={ref} className="size-full touch-none" />
      <TouchPad layout="blocks" onPress={(k) => api.current.press(k)} />
    </div>
  );
}
