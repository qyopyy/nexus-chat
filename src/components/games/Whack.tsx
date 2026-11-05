"use client";

import { useEffect, useRef, useState } from "react";
import { type GameProps } from "./common";

/** Whack-a-Mole — 30 seconds, tap lit holes. */
export default function Whack({ onOver, onScore }: GameProps) {
  const [active, setActive] = useState(-1);
  const [score, setScore] = useState(0);
  const [left, setLeft] = useState(30);
  const over = useRef(false);
  const scoreRef = useRef(0);

  useEffect(() => {
    const tick = setInterval(() => {
      setLeft((s) => {
        if (s <= 1) {
          clearInterval(tick);
          if (!over.current) {
            over.current = true;
            onOver(scoreRef.current);
          }
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    const mole = setInterval(() => setActive(Math.floor(Math.random() * 9)), 650);
    return () => {
      clearInterval(tick);
      clearInterval(mole);
    };
  }, [onOver]);

  const hit = (i: number) => {
    if (over.current || i !== active) return;
    scoreRef.current += 10;
    setScore(scoreRef.current);
    onScore(scoreRef.current);
    setActive(-1);
  };

  return (
    <div className="flex size-full flex-col items-center justify-center gap-4 bg-[#1a0b2e] p-4 text-white">
      <div className="flex gap-6 text-sm font-bold">
        <span>Score {score}</span>
        <span>{left}s</span>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 9 }, (_, i) => (
          <button
            key={i}
            onClick={() => hit(i)}
            className="grid size-20 place-items-center rounded-full bg-black/40 text-4xl ring-2 ring-white/10 transition active:scale-90 sm:size-24"
            style={{ background: i === active ? "#facc15" : undefined }}
          >
            {i === active ? "🐹" : ""}
          </button>
        ))}
      </div>
    </div>
  );
}
