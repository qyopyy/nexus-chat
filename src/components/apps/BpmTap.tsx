"use client";

import { useRef, useState } from "react";
import { Activity } from "lucide-react";
import AppFrame from "./AppFrame";

export default function BpmTap({ onBack, mobile }: { onBack: () => void; mobile?: boolean }) {
  const taps = useRef<number[]>([]);
  const [bpm, setBpm] = useState<number | null>(null);
  const [count, setCount] = useState(0);

  function tap() {
    const now = performance.now();
    const recent = taps.current.filter((t) => now - t < 4000);
    recent.push(now);
    taps.current = recent;
    setCount(recent.length);
    if (recent.length < 2) {
      setBpm(null);
      return;
    }
    const gaps: number[] = [];
    for (let i = 1; i < recent.length; i++) gaps.push(recent[i]! - recent[i - 1]!);
    const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    setBpm(Math.round(60000 / avg));
  }

  function reset() {
    taps.current = [];
    setBpm(null);
    setCount(0);
  }

  return (
    <AppFrame title="BPM tap" Icon={Activity} iconClass="text-[#57f287]" mobile={mobile} onBack={onBack}>
      <p className="text-sm text-sub">Tap along with a track to estimate tempo. Uses the average of recent taps.</p>
      <div className="rounded-2xl bg-side p-6 text-center">
        <div className="text-6xl font-black tabular-nums">{bpm ?? "—"}</div>
        <div className="mt-1 text-xs font-semibold tracking-wide text-sub uppercase">Estimated BPM</div>
        <div className="mt-2 text-sm text-sub">{count < 2 ? "Tap at least twice" : `${count} taps`}</div>
        <button
          onClick={tap}
          onKeyDown={(e) => {
            if (e.key === " " || e.key === "Enter") {
              e.preventDefault();
              tap();
            }
          }}
          className="mt-8 grid h-40 w-full place-items-center rounded-2xl bg-accent text-xl font-bold text-white active:scale-[0.98]"
        >
          Tap
        </button>
        <button onClick={reset} className="mt-3 w-full rounded-xl bg-black/25 py-2.5 text-sm font-semibold hover:bg-black/35">
          Reset
        </button>
      </div>
    </AppFrame>
  );
}
