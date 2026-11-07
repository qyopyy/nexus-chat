"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Calculator, Music2, NotebookPen, ChartPie, Ruler, Timer } from "lucide-react";
import AppFrame from "./AppFrame";
import { cn } from "@/lib/utils";

type P = { onBack: () => void; mobile?: boolean };
const box = "rounded-2xl bg-side p-4 sm:p-5";
const field = "w-full rounded-xl bg-black/25 px-3 py-2.5 text-base outline-none focus:ring-2 focus:ring-accent/60";

/* ───────────── Focus timer (pomodoro) ───────────── */
export function FocusTimer({ onBack, mobile }: P) {
  const MODES = { focus: 25, short: 5, long: 15 } as const;
  const [mode, setMode] = useState<keyof typeof MODES>("focus");
  const [left, setLeft] = useState(MODES.focus * 60);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const end = useRef(0);
  useEffect(() => {
    if (!running) return;
    end.current = Date.now() + left * 1000;
    const t = setInterval(() => {
      const s = Math.max(0, Math.round((end.current - Date.now()) / 1000));
      setLeft(s);
      if (s === 0) {
        setRunning(false);
        if (mode === "focus") setDone((d) => d + 1);
        try {
          const ctx = new AudioContext();
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.frequency.value = 880;
          g.gain.setValueAtTime(0.25, ctx.currentTime);
          g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);
          o.connect(g).connect(ctx.destination);
          o.start();
          o.stop(ctx.currentTime + 1.2);
        } catch {
          /* no audio */
        }
      }
    }, 250);
    return () => clearInterval(t);
  }, [running]); // eslint-disable-line react-hooks/exhaustive-deps
  const pick = (m: keyof typeof MODES) => {
    setMode(m);
    setRunning(false);
    setLeft(MODES[m] * 60);
  };
  const total = MODES[mode] * 60;
  const pct = 1 - left / total;
  const mm = `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`;
  return (
    <AppFrame title="Focus timer" Icon={Timer} iconClass="text-[#f23f42]" mobile={mobile} onBack={onBack}>
      <div className={cn(box, "text-center")}>
        <div className="flex justify-center gap-1 rounded-full bg-black/25 p-1">
          {(Object.keys(MODES) as (keyof typeof MODES)[]).map((m) => (
            <button key={m} onClick={() => pick(m)} className={cn("flex-1 rounded-full py-2 text-sm font-semibold", mode === m ? "bg-accent text-white" : "text-sub")}>
              {m === "focus" ? "Focus" : m === "short" ? "Short break" : "Long break"}
            </button>
          ))}
        </div>
        <div className="relative mx-auto mt-6 size-56 sm:size-64">
          <svg viewBox="0 0 100 100" className="size-full -rotate-90">
            <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="6" />
            <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" className="text-accent transition-[stroke-dashoffset] duration-300" strokeDasharray={283} strokeDashoffset={283 * (1 - pct)} />
          </svg>
          <div className="absolute inset-0 grid place-items-center text-5xl font-black tabular-nums sm:text-6xl">{mm}</div>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-2">
          <button onClick={() => setRunning(!running)} className="rounded-xl bg-accent py-3.5 text-base font-bold text-white active:scale-[.98]">
            {running ? "Pause" : left === total ? "Start" : "Resume"}
          </button>
          <button onClick={() => pick(mode)} className="rounded-xl bg-black/25 py-3.5 text-base font-semibold active:scale-[.98]">
            Reset
          </button>
        </div>
        <p className="mt-3 text-sm text-sub">Focus sessions done today: {done}</p>
      </div>
    </AppFrame>
  );
}

/* ───────────── Unit converter ───────────── */
const UNITS: Record<string, Record<string, number>> = {
  Length: { mm: 0.001, cm: 0.01, m: 1, km: 1000, in: 0.0254, ft: 0.3048, yd: 0.9144, mi: 1609.344 },
  Weight: { g: 0.001, kg: 1, oz: 0.0283495, lb: 0.453592, st: 6.35029 },
  Volume: { ml: 0.001, l: 1, "fl oz": 0.0295735, cup: 0.236588, gal: 3.78541 },
  Speed: { "km/h": 1 / 3.6, "m/s": 1, mph: 0.44704, knot: 0.514444 },
  Data: { KB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12, MiB: 1048576, GiB: 1073741824 },
  Temperature: { "°C": 1, "°F": 1, K: 1 },
};
function convTemp(v: number, from: string, to: string) {
  const c = from === "°F" ? ((v - 32) * 5) / 9 : from === "K" ? v - 273.15 : v;
  return to === "°F" ? (c * 9) / 5 + 32 : to === "K" ? c + 273.15 : c;
}
export function UnitConverter({ onBack, mobile }: P) {
  const [kind, setKind] = useState("Length");
  const units = Object.keys(UNITS[kind]);
  const [from, setFrom] = useState(units[2] ?? units[0]);
  const [to, setTo] = useState(units[5] ?? units[1]);
  const [v, setV] = useState("1");
  useEffect(() => {
    const u = Object.keys(UNITS[kind]);
    setFrom(u[0]);
    setTo(u[1]);
  }, [kind]);
  const n = Number(v.replace(",", "."));
  const out = !Number.isFinite(n) || !UNITS[kind][from] || !UNITS[kind][to] ? NaN : kind === "Temperature" ? convTemp(n, from, to) : (n * UNITS[kind][from]) / UNITS[kind][to];
  return (
    <AppFrame title="Unit converter" Icon={Ruler} iconClass="text-[#00a8fc]" mobile={mobile} onBack={onBack}>
      <div className="flex flex-wrap gap-1.5">
        {Object.keys(UNITS).map((k) => (
          <button key={k} onClick={() => setKind(k)} className={cn("rounded-full px-3.5 py-2 text-sm font-semibold", kind === k ? "bg-accent text-white" : "bg-side text-sub")}>
            {k}
          </button>
        ))}
      </div>
      <div className={cn(box, "space-y-3")}>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <input value={v} onChange={(e) => setV(e.target.value)} inputMode="decimal" className={field} aria-label="Value" />
          <select value={from} onChange={(e) => setFrom(e.target.value)} className={cn(field, "w-28")}>
            {units.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </div>
        <button onClick={() => (setFrom(to), setTo(from))} className="mx-auto block rounded-full bg-black/25 px-4 py-1.5 text-sm font-semibold">
          ⇅ Swap
        </button>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <div className={cn(field, "font-bold tabular-nums")}>{Number.isFinite(out) ? +out.toPrecision(10) : "—"}</div>
          <select value={to} onChange={(e) => setTo(e.target.value)} className={cn(field, "w-28")}>
            {units.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </div>
      </div>
    </AppFrame>
  );
}

/* ───────────── Tip & split ───────────── */
export function TipSplit({ onBack, mobile }: P) {
  const [bill, setBill] = useState("50");
  const [tip, setTip] = useState(15);
  const [people, setPeople] = useState(2);
  const b = Number(bill.replace(",", ".")) || 0;
  const tipAmt = (b * tip) / 100;
  const each = (b + tipAmt) / Math.max(1, people);
  const fmt = (x: number) => x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (
    <AppFrame title="Tip & split" Icon={Calculator} iconClass="text-[#57f287]" mobile={mobile} onBack={onBack}>
      <div className={cn(box, "space-y-4")}>
        <label className="block text-sm font-semibold text-sub">
          Bill total
          <input value={bill} onChange={(e) => setBill(e.target.value)} inputMode="decimal" className={cn(field, "mt-1 text-2xl font-bold")} />
        </label>
        <div>
          <div className="mb-1.5 text-sm font-semibold text-sub">Tip · {tip}%</div>
          <div className="grid grid-cols-5 gap-1.5">
            {[0, 10, 15, 18, 20].map((p) => (
              <button key={p} onClick={() => setTip(p)} className={cn("rounded-xl py-2.5 text-sm font-bold", tip === p ? "bg-accent text-white" : "bg-black/25")}>
                {p}%
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-sub">People</span>
          <div className="flex items-center gap-3">
            <button onClick={() => setPeople(Math.max(1, people - 1))} className="grid size-11 place-items-center rounded-full bg-black/25 text-xl font-bold" aria-label="Fewer people">
              −
            </button>
            <span className="w-8 text-center text-xl font-bold tabular-nums">{people}</span>
            <button onClick={() => setPeople(Math.min(50, people + 1))} className="grid size-11 place-items-center rounded-full bg-black/25 text-xl font-bold" aria-label="More people">
              +
            </button>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className={box}>
          <div className="text-xs font-semibold text-sub uppercase">Tip</div>
          <div className="text-2xl font-black tabular-nums">{fmt(tipAmt)}</div>
        </div>
        <div className={cn(box, "bg-accent/20")}>
          <div className="text-xs font-semibold text-sub uppercase">Each pays</div>
          <div className="text-2xl font-black tabular-nums">{fmt(each)}</div>
        </div>
      </div>
    </AppFrame>
  );
}

/* ───────────── Key & scale finder ───────────── */
const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const SCALES: Record<string, number[]> = {
  Major: [0, 2, 4, 5, 7, 9, 11],
  "Natural minor": [0, 2, 3, 5, 7, 8, 10],
  "Harmonic minor": [0, 2, 3, 5, 7, 8, 11],
  Dorian: [0, 2, 3, 5, 7, 9, 10],
  Mixolydian: [0, 2, 4, 5, 7, 9, 10],
  "Pentatonic major": [0, 2, 4, 7, 9],
  "Pentatonic minor": [0, 3, 5, 7, 10],
  Blues: [0, 3, 5, 6, 7, 10],
};
const CHORD_Q: Record<string, string[]> = { Major: ["", "m", "m", "", "", "m", "dim"], "Natural minor": ["m", "dim", "", "m", "m", "", ""] };
export function KeyScale({ onBack, mobile }: P) {
  const [root, setRoot] = useState(0);
  const [scale, setScale] = useState("Major");
  const notes = SCALES[scale].map((i) => NOTES[(root + i) % 12]);
  const inScale = new Set(SCALES[scale].map((i) => (root + i) % 12));
  const chords = CHORD_Q[scale]?.map((q, i) => notes[i] + q);
  const relative = scale === "Major" ? `${NOTES[(root + 9) % 12]} minor` : scale === "Natural minor" ? `${NOTES[(root + 3) % 12]} major` : null;
  const play = (idx: number) => {
    try {
      const ctx = new AudioContext();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "triangle";
      o.frequency.value = 261.63 * Math.pow(2, idx / 12);
      g.gain.setValueAtTime(0.3, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
      o.connect(g).connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.8);
    } catch {
      /* no audio */
    }
  };
  return (
    <AppFrame title="Key & scale finder" Icon={Music2} iconClass="text-[#eb459e]" mobile={mobile} onBack={onBack}>
      <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-12">
        {NOTES.map((n, i) => (
          <button key={n} onClick={() => setRoot(i)} className={cn("rounded-xl py-2.5 text-sm font-bold", root === i ? "bg-accent text-white" : "bg-side")}>
            {n}
          </button>
        ))}
      </div>
      <select value={scale} onChange={(e) => setScale(e.target.value)} className={field}>
        {Object.keys(SCALES).map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
      <div className={box}>
        <div className="text-2xl font-black">
          {NOTES[root]} {scale.toLowerCase()}
        </div>
        {relative && <div className="text-sm text-sub">Relative key: {relative}</div>}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {notes.map((n, i) => (
            <button key={n + i} onClick={() => play((root + SCALES[scale][i]) % 12 + (root + SCALES[scale][i] >= 12 ? 12 : 0))} className="rounded-lg bg-black/25 px-3 py-2 font-bold hover:bg-black/40">
              {n}
            </button>
          ))}
        </div>
        {chords && (
          <div className="mt-4">
            <div className="text-xs font-semibold text-sub uppercase">Chords in key</div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {chords.map((c, i) => (
                <span key={c + i} className="rounded-lg bg-accent/15 px-2.5 py-1.5 text-sm font-semibold">
                  {["I", "II", "III", "IV", "V", "VI", "VII"][i]} · {c}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
      {/* one-octave keyboard */}
      <div className="relative flex h-32 select-none">
        {NOTES.map((n, i) =>
          n.includes("#") ? null : (
            <button key={n} onClick={() => play(i)} className={cn("relative flex-1 rounded-b-lg border border-black/40", inScale.has(i) ? "bg-[#c9cdfb]" : "bg-white")} aria-label={n}>
              <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[10px] font-bold text-black/50">{n}</span>
            </button>
          ),
        )}
        {NOTES.map((n, i) => {
          if (!n.includes("#")) return null;
          const whiteIndex = NOTES.slice(0, i).filter((x) => !x.includes("#")).length;
          return (
            <button key={n} onClick={() => play(i)} className={cn("absolute top-0 h-20 w-[9%] -translate-x-1/2 rounded-b-md", inScale.has(i) ? "bg-accent" : "bg-black")} style={{ left: `${(whiteIndex / 7) * 100}%` }} aria-label={n} />
          );
        })}
      </div>
    </AppFrame>
  );
}

/* ───────────── Royalty splits ───────────── */
type Split = { name: string; pct: number };
export function RoyaltySplits({ onBack, mobile }: P) {
  const [streams, setStreams] = useState("100000");
  const [rate, setRate] = useState("0.0035");
  const [rows, setRows] = useState<Split[]>([
    { name: "Artist", pct: 50 },
    { name: "Producer", pct: 30 },
    { name: "Writer", pct: 20 },
  ]);
  const total = rows.reduce((a, r) => a + (r.pct || 0), 0);
  const revenue = (Number(streams) || 0) * (Number(rate.replace(",", ".")) || 0);
  const fmt = (x: number) => x.toLocaleString(undefined, { style: "currency", currency: "USD" });
  const update = (i: number, patch: Partial<Split>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const colors = ["#5865f2", "#ff2bd6", "#00c2ff", "#ffd400", "#36d39a", "#ff7a59"];
  const gradient = useMemo(() => {
    let acc = 0;
    return `conic-gradient(${rows.map((r, i) => `${colors[i % colors.length]} ${acc}% ${(acc += Math.max(0, r.pct))}%`).join(",")}, rgba(255,255,255,.08) ${acc}% 100%)`;
  }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <AppFrame title="Royalty splits" Icon={ChartPie} iconClass="text-[#ffd400]" mobile={mobile} onBack={onBack}>
      <div className={cn(box, "grid gap-3 sm:grid-cols-2")}>
        <label className="text-sm font-semibold text-sub">
          Streams
          <input value={streams} onChange={(e) => setStreams(e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric" className={cn(field, "mt-1")} />
        </label>
        <label className="text-sm font-semibold text-sub">
          Payout per stream ($)
          <input value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" className={cn(field, "mt-1")} />
        </label>
        <div className="sm:col-span-2 text-lg font-bold">Total: {fmt(revenue)}</div>
      </div>
      <div className={cn(box, "flex flex-col items-center gap-5 sm:flex-row sm:items-start")}>
        <div className="size-36 shrink-0 rounded-full" style={{ background: gradient }} />
        <div className="w-full space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="size-3 shrink-0 rounded-full" style={{ background: colors[i % colors.length] }} />
              <input value={r.name} onChange={(e) => update(i, { name: e.target.value })} className={cn(field, "min-w-0 flex-1 py-2 text-sm")} />
              <input value={r.pct} onChange={(e) => update(i, { pct: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} inputMode="decimal" className={cn(field, "w-16 py-2 text-right text-sm")} aria-label="Percent" />
              <span className="w-24 text-right text-sm font-semibold tabular-nums">{fmt((revenue * r.pct) / 100)}</span>
              <button onClick={() => setRows(rows.filter((_, j) => j !== i))} className="grid size-8 place-items-center rounded-full text-sub hover:bg-black/25" aria-label="Remove">
                ×
              </button>
            </div>
          ))}
          <div className="flex items-center justify-between pt-1">
            <button disabled={rows.length >= 6} onClick={() => setRows([...rows, { name: `Collaborator ${rows.length + 1}`, pct: 0 }])} className="rounded-lg bg-black/25 px-3 py-2 text-sm font-semibold disabled:opacity-40">
              + Add person
            </button>
            <span className={cn("text-sm font-bold", total === 100 ? "text-ok" : "text-dnd")}>{total}% {total === 100 ? "✓" : "— should be 100%"}</span>
          </div>
        </div>
      </div>
      <p className="text-xs text-sub">Payout rates vary by store and country — this is an estimate, not a statement.</p>
    </AppFrame>
  );
}

/* ───────────── Quick notes (saved on this device) ───────────── */
const NOTES_KEY = "nexus.apps.notes";
export function QuickNotes({ onBack, mobile }: P) {
  const [notes, setNotes] = useState<{ id: string; text: string; at: number }[]>([]);
  const [cur, setCur] = useState<string | null>(null);
  useEffect(() => {
    try {
      setNotes(JSON.parse(localStorage.getItem(NOTES_KEY) || "[]"));
    } catch {
      /* storage blocked */
    }
  }, []);
  const save = (next: typeof notes) => {
    setNotes(next);
    try {
      localStorage.setItem(NOTES_KEY, JSON.stringify(next));
    } catch {
      /* storage blocked */
    }
  };
  const active = notes.find((n) => n.id === cur);
  return (
    <AppFrame title="Quick notes" Icon={NotebookPen} iconClass="text-[#fee75c]" mobile={mobile} onBack={onBack}>
      {active ? (
        <div className="space-y-2">
          <button onClick={() => setCur(null)} className="text-sm font-semibold text-accent">
            ← All notes
          </button>
          <textarea autoFocus value={active.text} onChange={(e) => save(notes.map((n) => (n.id === active.id ? { ...n, text: e.target.value, at: Date.now() } : n)))} rows={14} className={cn(field, "min-h-[50vh] resize-y")} placeholder="Write anything…" />
          <button onClick={() => (save(notes.filter((n) => n.id !== active.id)), setCur(null))} className="text-sm font-semibold text-dnd">
            Delete note
          </button>
        </div>
      ) : (
        <>
          <button
            onClick={() => {
              const n = { id: crypto.randomUUID(), text: "", at: Date.now() };
              save([n, ...notes]);
              setCur(n.id);
            }}
            className="w-full rounded-xl bg-accent py-3 font-bold text-white active:scale-[.98]"
          >
            + New note
          </button>
          {notes.length === 0 ? (
            <p className="py-8 text-center text-sm text-sub">No notes yet. They stay on this device only.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {[...notes].sort((a, b) => b.at - a.at).map((n) => (
                <button key={n.id} onClick={() => setCur(n.id)} className="rounded-2xl bg-side p-4 text-left hover:bg-hover">
                  <div className="line-clamp-3 text-sm whitespace-pre-wrap">{n.text || <span className="text-sub">Empty note</span>}</div>
                  <div className="mt-2 text-xs text-sub">{new Date(n.at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </AppFrame>
  );
}
