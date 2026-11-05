"use client";

import { useEffect, useMemo, useState } from "react";
import { type GameProps } from "./common";

const EMOJIS = ["🐤", "🚗", "🌴", "🎵", "🚀", "💎", "🔥", "🌊", "⭐", "🎮", "🍕", "🐱"];

/** Memory Flip — match pairs; fewer flips = higher score. */
export default function MemoryFlip({ onOver, onScore }: GameProps) {
  const deck = useMemo(() => {
    const picks = EMOJIS.slice(0, 8);
    const cards = [...picks, ...picks].map((emoji, i) => ({ id: i, emoji, key: `${emoji}-${i}` }));
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    return cards;
  }, []);
  const [open, setOpen] = useState<number[]>([]);
  const [matched, setMatched] = useState<Set<string>>(() => new Set());
  const [flips, setFlips] = useState(0);
  const [lock, setLock] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (matched.size === 8 && !done) {
      setDone(true);
      const score = Math.max(50, 800 - flips * 20);
      onScore(score);
      onOver(score);
    }
  }, [matched, flips, done, onOver, onScore]);

  const tap = (i: number) => {
    if (lock || done || open.includes(i) || matched.has(deck[i].emoji)) return;
    const next = [...open, i];
    setOpen(next);
    if (next.length === 2) {
      setFlips((f) => f + 1);
      setLock(true);
      const [a, b] = next;
      if (deck[a].emoji === deck[b].emoji) {
        setMatched((m) => new Set(m).add(deck[a].emoji));
        setOpen([]);
        setLock(false);
        onScore(Math.max(50, 800 - (flips + 1) * 20));
      } else {
        setTimeout(() => {
          setOpen([]);
          setLock(false);
        }, 650);
      }
    }
  };

  return (
    <div className="flex size-full flex-col items-center justify-center gap-4 bg-[#0b1220] p-4">
      <div className="text-sm font-bold text-white/70">
        Flips {flips} · Matches {matched.size}/8
      </div>
      <div className="grid w-full max-w-md grid-cols-4 gap-2">
        {deck.map((c, i) => {
          const show = open.includes(i) || matched.has(c.emoji);
          return (
            <button
              key={c.key}
              onClick={() => tap(i)}
              className="aspect-square rounded-2xl text-3xl transition active:scale-95"
              style={{ background: show ? "linear-gradient(135deg,#38bdf8,#a855f7)" : "#1e293b" }}
            >
              {show ? c.emoji : "?"}
            </button>
          );
        })}
      </div>
    </div>
  );
}
