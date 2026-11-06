"use client";

import { useEffect, useRef, useState } from "react";
import { Minus, Plus, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import AppFrame from "./AppFrame";

type Subdiv = "none" | "8th" | "triplet";

export default function Metronome({ onBack, mobile }: { onBack: () => void; mobile?: boolean }) {
  const [bpm, setBpm] = useState(120);
  const [beats, setBeats] = useState(4);
  const [subdiv, setSubdiv] = useState<Subdiv>("none");
  const [muteOffbeats, setMuteOffbeats] = useState(false);
  const [running, setRunning] = useState(false);
  const [beat, setBeat] = useState(0);
  const bpmRef = useRef(bpm);
  const beatsRef = useRef(beats);
  const subdivRef = useRef(subdiv);
  const muteRef = useRef(muteOffbeats);
  const ctxRef = useRef<AudioContext | null>(null);
  const nextRef = useRef(0);
  const beatRef = useRef(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    bpmRef.current = bpm;
  }, [bpm]);
  useEffect(() => {
    beatsRef.current = beats;
  }, [beats]);
  useEffect(() => {
    subdivRef.current = subdiv;
  }, [subdiv]);
  useEffect(() => {
    muteRef.current = muteOffbeats;
  }, [muteOffbeats]);

  useEffect(() => {
    return () => {
      if (timerRef.current != null) window.clearInterval(timerRef.current);
      void ctxRef.current?.close();
    };
  }, []);

  function click(kind: "accent" | "beat" | "sub", time: number) {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = kind === "accent" ? 1200 : kind === "beat" ? 800 : 560;
    const peak = kind === "sub" ? 0.08 : 0.18;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(peak, time + 0.001);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + (kind === "sub" ? 0.035 : 0.06));
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(time);
    osc.stop(time + 0.07);
  }

  function stop() {
    if (timerRef.current != null) window.clearInterval(timerRef.current);
    timerRef.current = null;
    setRunning(false);
    setBeat(0);
    beatRef.current = 0;
  }

  async function start() {
    const ctx = ctxRef.current || new AudioContext();
    ctxRef.current = ctx;
    if (ctx.state === "suspended") await ctx.resume();
    nextRef.current = ctx.currentTime + 0.05;
    beatRef.current = 0;
    setBeat(0);
    setRunning(true);
    if (timerRef.current != null) window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => {
      const now = ctx.currentTime;
      const interval = 60 / bpmRef.current;
      const bar = beatsRef.current;
      const parts = subdivRef.current === "8th" ? 2 : subdivRef.current === "triplet" ? 3 : 1;
      const step = interval / parts;
      while (nextRef.current < now + 0.12) {
        const total = beatRef.current;
        const beatIdx = Math.floor(total / parts) % bar;
        const part = total % parts;
        const accent = beatIdx === 0 && part === 0;
        if (part === 0) {
          if (accent) click("accent", nextRef.current);
          else if (!muteRef.current) click("beat", nextRef.current);
          setBeat(beatIdx);
        } else {
          click("sub", nextRef.current);
        }
        beatRef.current += 1;
        nextRef.current += step;
      }
    }, 25);
  }

  return (
    <AppFrame title="Metronome" Icon={Timer} iconClass="text-[#f23f42]" mobile={mobile} onBack={onBack}>
      <p className="text-sm text-sub">Keep time while you write or practice. Optional 8th / triplet subdivisions stay in this tab.</p>
      <div className="rounded-2xl bg-side p-5">
        <div className="flex items-center justify-center gap-4">
          <button onClick={() => setBpm((v) => Math.max(40, v - 1))} className="grid size-12 place-items-center rounded-full bg-black/25 hover:bg-black/35" aria-label="Slower">
            <Minus className="size-5" />
          </button>
          <div className="text-center">
            <div className="text-5xl font-black tabular-nums">{bpm}</div>
            <div className="text-xs font-semibold tracking-wide text-sub uppercase">BPM</div>
          </div>
          <button onClick={() => setBpm((v) => Math.min(240, v + 1))} className="grid size-12 place-items-center rounded-full bg-black/25 hover:bg-black/35" aria-label="Faster">
            <Plus className="size-5" />
          </button>
        </div>
        <input type="range" min={40} max={240} value={bpm} onChange={(e) => setBpm(Number(e.target.value))} className="mt-5 w-full" aria-label="BPM" />
        <div className="mt-5 flex justify-center gap-2">
          {Array.from({ length: beats }, (_, i) => (
            <span key={i} className={cn("size-3 rounded-full transition", running && beat === i ? (i === 0 ? "scale-125 bg-[#f23f42]" : "scale-125 bg-accent") : "bg-white/20")} />
          ))}
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {[2, 3, 4, 5, 6].map((n) => (
            <button key={n} onClick={() => setBeats(n)} className={cn("rounded-xl px-3 py-2 text-sm font-semibold", beats === n ? "bg-accent text-white" : "bg-black/25 hover:bg-black/35")}>
              {n}/4
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          {(
            [
              ["none", "Quarter"],
              ["8th", "8ths"],
              ["triplet", "Triplets"],
            ] as [Subdiv, string][]
          ).map(([id, label]) => (
            <button key={id} type="button" onClick={() => setSubdiv(id)} className={cn("rounded-xl px-3 py-2 text-sm font-semibold", subdiv === id ? "bg-accent text-white" : "bg-black/25 hover:bg-black/35")}>
              {label}
            </button>
          ))}
        </div>
        <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 text-sm text-sub">
          <input type="checkbox" checked={muteOffbeats} onChange={(e) => setMuteOffbeats(e.target.checked)} className="size-4 accent-accent" />
          Mute offbeats (accent only)
        </label>
        <button onClick={() => (running ? stop() : void start())} className={cn("mt-6 w-full rounded-xl py-3 text-sm font-bold text-white", running ? "bg-[#f23f42]" : "bg-accent")}>
          {running ? "Stop" : "Start"}
        </button>
      </div>
    </AppFrame>
  );
}
