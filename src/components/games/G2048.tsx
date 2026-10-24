"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useKeyPress, useSwipe, type GameProps } from "./common";

// 2048 — slide and merge tiles.
type B = number[][];
const empty = (): B => Array.from({ length: 4 }, () => [0, 0, 0, 0]);
const add = (b: B) => {
  const free: [number, number][] = [];
  b.forEach((r, y) => r.forEach((v, x) => !v && free.push([y, x])));
  if (!free.length) return b;
  const [y, x] = free[Math.floor(Math.random() * free.length)];
  const n = b.map((r) => [...r]);
  n[y][x] = Math.random() < 0.9 ? 2 : 4;
  return n;
};
const slideRow = (r: number[]) => {
  const a = r.filter(Boolean);
  let gained = 0;
  for (let i = 0; i < a.length - 1; i++)
    if (a[i] === a[i + 1]) {
      a[i] *= 2;
      gained += a[i];
      a.splice(i + 1, 1);
    }
  while (a.length < 4) a.push(0);
  return { r: a, gained };
};
const rot = (b: B) => b[0].map((_, i) => b.map((r) => r[i]).reverse());
function move(b: B, dir: "left" | "right" | "up" | "down") {
  const turns = { left: 0, down: 1, right: 2, up: 3 }[dir];
  let m = b;
  for (let i = 0; i < turns; i++) m = rot(m);
  let gained = 0;
  m = m.map((r) => {
    const s = slideRow(r);
    gained += s.gained;
    return s.r;
  });
  for (let i = 0; i < (4 - turns) % 4; i++) m = rot(m);
  return { b: m, gained, moved: JSON.stringify(m) !== JSON.stringify(b) };
}
const canMove = (b: B) => (["left", "right", "up", "down"] as const).some((d) => move(b, d).moved);
const COLORS: Record<number, string> = { 2: "#2b2d42", 4: "#3a3d5c", 8: "#ff9f2b", 16: "#ff7b2b", 32: "#ff4d6d", 64: "#ff2b2b", 128: "#ffd400", 256: "#c6e000", 512: "#00ff9c", 1024: "#00e5ff", 2048: "#ff2bd6" };

export default function G2048({ onOver, onScore }: GameProps) {
  const [b, setB] = useState<B>(() => add(add(empty())));
  const [score, setScore] = useState(0);
  const [over, setOver] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const go = useCallback(
    (d: "up" | "down" | "left" | "right" | "action") => {
      if (over || d === "action") return;
      const r = move(b, d);
      if (!r.moved) return;
      const nb = add(r.b);
      const ns = score + r.gained;
      setB(nb);
      setScore(ns);
      onScore(ns);
      if (!canMove(nb)) {
        setOver(true);
        setTimeout(() => onOver(ns), 900);
      }
    },
    [b, score, over, onOver, onScore],
  );
  useKeyPress(go);
  useSwipe(box, go);
  useEffect(() => {
    onScore(0);
  }, [onScore]);
  return (
    <div ref={box} className="grid size-full touch-none place-items-center bg-[#07070d] p-4 select-none">
      <div className="w-full max-w-sm">
        <div className="mb-3 flex items-end justify-between text-white">
          <div className="text-4xl font-black">2048</div>
          <div className="rounded-lg bg-white/10 px-3 py-1 text-right">
            <div className="text-[10px] text-white/60 uppercase">Score</div>
            <div className="text-lg font-bold tabular-nums">{score}</div>
          </div>
        </div>
        <div className="relative grid aspect-square grid-cols-4 gap-2 rounded-2xl bg-[#14141f] p-2">
          {b.flat().map((v, i) => (
            <div
              key={i}
              className="grid place-items-center rounded-xl font-black text-white transition-colors"
              style={{ background: v ? (COLORS[v] ?? "#7c4dff") : "#1c1c2a", fontSize: v >= 1024 ? "1.4rem" : v >= 128 ? "1.7rem" : "2rem", boxShadow: v >= 128 ? `0 0 18px ${COLORS[v] ?? "#7c4dff"}66` : undefined }}
            >
              {v || ""}
            </div>
          ))}
          {over && <div className="absolute inset-0 grid place-items-center rounded-2xl bg-black/60 text-3xl font-black text-[#ff4d6d]">NO MOVES</div>}
        </div>
        <p className="mt-3 text-center text-xs text-white/50">Swipe or use the arrow keys</p>
      </div>
    </div>
  );
}
