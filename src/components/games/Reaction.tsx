"use client";

import { useEffect, useRef, useState } from "react";
import { type GameProps } from "./common";

/** Reaction Rush — wait for green, tap fast; 5 rounds. */
export default function Reaction({ onOver, onScore }: GameProps) {
  const [phase, setPhase] = useState<"wait" | "ready" | "go" | "early" | "done">("wait");
  const [round, setRound] = useState(0);
  const [times, setTimes] = useState<number[]>([]);
  const start = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const arm = () => {
    setPhase("ready");
    timer.current = setTimeout(() => {
      start.current = performance.now();
      setPhase("go");
    }, 900 + Math.random() * 2200);
  };

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const tap = () => {
    if (phase === "wait" || phase === "early") {
      arm();
      return;
    }
    if (phase === "ready") {
      if (timer.current) clearTimeout(timer.current);
      setPhase("early");
      return;
    }
    if (phase !== "go") return;
    const ms = Math.round(performance.now() - start.current);
    const next = [...times, ms];
    setTimes(next);
    const score = Math.max(0, 500 - ms) + next.reduce((a, t) => a + Math.max(0, 400 - t), 0);
    onScore(score);
    if (next.length >= 5) {
      setPhase("done");
      onOver(score);
    } else {
      setRound(next.length);
      setPhase("wait");
    }
  };

  const avg = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;
  const bg = phase === "go" ? "#22c55e" : phase === "early" ? "#ef4444" : "#1e293b";

  return (
    <button onClick={tap} className="flex size-full flex-col items-center justify-center gap-3 p-6 text-center text-white transition" style={{ background: bg }}>
      <div className="text-xs font-bold tracking-widest uppercase opacity-80">Round {Math.min(round + 1, 5)} / 5</div>
      <div className="text-3xl font-black sm:text-5xl">
        {phase === "wait" && "Tap to start"}
        {phase === "ready" && "Wait for green…"}
        {phase === "go" && "TAP!"}
        {phase === "early" && "Too soon — tap to retry"}
        {phase === "done" && `Avg ${avg} ms`}
      </div>
      {times.length > 0 && <div className="text-sm opacity-80">{times.map((t) => `${t}ms`).join(" · ")}</div>}
    </button>
  );
}
