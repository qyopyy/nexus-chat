"use client";

import { useMemo, useState } from "react";
import { type GameProps } from "./common";

type Cell = "" | "X" | "O";
const lines = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

function winner(b: Cell[]) {
  for (const [a, c, d] of lines) if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a];
  return b.every(Boolean) ? "draw" : null;
}

function botMove(b: Cell[]): number {
  const empty = b.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
  for (const mark of ["O", "X"] as const) {
    for (const i of empty) {
      const n = [...b];
      n[i] = mark;
      if (winner(n) === mark) return i;
    }
  }
  if (empty.includes(4)) return 4;
  return empty[Math.floor(Math.random() * empty.length)] ?? 0;
}

/** Tic Tac Toe vs a simple bot — score rises with wins in a streak. */
export default function TicTacToe({ onOver, onScore }: GameProps) {
  const [board, setBoard] = useState<Cell[]>(Array(9).fill(""));
  const [wins, setWins] = useState(0);
  const [over, setOver] = useState(false);
  const status = useMemo(() => winner(board), [board]);

  const play = (i: number) => {
    if (over || board[i] || status) return;
    const next = [...board];
    next[i] = "X";
    let w = winner(next);
    if (!w) {
      next[botMove(next)] = "O";
      w = winner(next);
    }
    setBoard(next);
    if (w === "X") {
      const score = (wins + 1) * 100;
      setWins((n) => n + 1);
      onScore(score);
      setTimeout(() => setBoard(Array(9).fill("")), 700);
    } else if (w === "O" || w === "draw") {
      setOver(true);
      onOver(wins * 100);
    }
  };

  return (
    <div className="flex size-full flex-col items-center justify-center gap-4 bg-[#0a0a14] p-4 text-white">
      <div className="text-sm font-bold text-white/70">
        You are X · Wins {wins} · Score {wins * 100}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {board.map((c, i) => (
          <button key={i} onClick={() => play(i)} className="grid size-20 place-items-center rounded-2xl bg-white/10 text-4xl font-black active:scale-95 sm:size-24">
            {c}
          </button>
        ))}
      </div>
      {status === "O" && <p className="font-semibold text-[#f472b6]">Bot wins</p>}
      {status === "draw" && <p className="font-semibold text-white/70">Draw</p>}
    </div>
  );
}
