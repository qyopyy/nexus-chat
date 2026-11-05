"use client";

import { useMemo, useState } from "react";
import { type GameProps } from "./common";

const W = 8,
  H = 8,
  MINES = 10;

function build() {
  const mines = new Set<number>();
  while (mines.size < MINES) mines.add(Math.floor(Math.random() * W * H));
  const adj = Array.from({ length: W * H }, (_, i) => {
    if (mines.has(i)) return -1;
    const x = i % W,
      y = (i / W) | 0;
    let n = 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx,
          ny = y + dy;
        if (nx >= 0 && nx < W && ny >= 0 && ny < H && mines.has(ny * W + nx)) n++;
      }
    return n;
  });
  return { mines, adj };
}

/** Mini Mines — clear the board without hitting a mine. */
export default function Mines({ onOver, onScore }: GameProps) {
  const field = useMemo(() => build(), []);
  const [open, setOpen] = useState<Set<number>>(() => new Set());
  const [flag, setFlag] = useState<Set<number>>(() => new Set());
  const [dead, setDead] = useState(false);
  const [won, setWon] = useState(false);

  const reveal = (start: number) => {
    if (dead || won || flag.has(start)) return;
    const next = new Set(open);
    const stack = [start];
    while (stack.length) {
      const i = stack.pop()!;
      if (next.has(i) || flag.has(i)) continue;
      next.add(i);
      if (field.adj[i] === -1) {
        setOpen(next);
        setDead(true);
        onOver(next.size * 5);
        return;
      }
      if (field.adj[i] === 0) {
        const x = i % W,
          y = (i / W) | 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx,
              ny = y + dy;
            if (nx >= 0 && nx < W && ny >= 0 && ny < H) stack.push(ny * W + nx);
          }
      }
    }
    setOpen(next);
    const score = next.size * 10;
    onScore(score);
    if (next.size === W * H - MINES) {
      setWon(true);
      onOver(score + 200);
    }
  };

  const toggleFlag = (i: number, e: React.MouseEvent | React.PointerEvent) => {
    e.preventDefault();
    if (dead || won || open.has(i)) return;
    setFlag((f) => {
      const n = new Set(f);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });
  };

  return (
    <div className="flex size-full flex-col items-center justify-center gap-3 bg-[#0f172a] p-4 text-white">
      <div className="text-sm font-bold text-white/70">
        {dead ? "Boom!" : won ? "Cleared!" : "Tap to dig · long-press / right-click to flag"} · {open.size * 10} pts
      </div>
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${W}, minmax(0, 2.25rem))` }}>
        {field.adj.map((v, i) => {
          const shown = open.has(i) || dead;
          return (
            <button
              key={i}
              onClick={() => reveal(i)}
              onContextMenu={(e) => toggleFlag(i, e)}
              onPointerDown={(e) => {
                if (e.button === 2) toggleFlag(i, e);
              }}
              className="grid aspect-square place-items-center rounded-md text-sm font-black"
              style={{ background: shown ? (v === -1 ? "#ed4245" : "#1e293b") : "#334155" }}
            >
              {flag.has(i) && !shown ? "🚩" : shown ? (v === -1 ? "💣" : v || "") : ""}
            </button>
          );
        })}
      </div>
    </div>
  );
}
