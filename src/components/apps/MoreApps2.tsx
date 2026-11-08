"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, Clock, Gauge, Mic, PenLine, Plus, Radio, Trash2, Volume2, X } from "lucide-react";
import AppFrame from "./AppFrame";
import { cn } from "@/lib/utils";

type P = { onBack: () => void; mobile?: boolean };
const box = "rounded-2xl bg-side p-4 sm:p-5";
const field = "w-full rounded-xl bg-black/25 px-3 py-2.5 text-base outline-none focus:ring-2 focus:ring-accent/60";
const NOTE_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* storage unavailable */
  }
}

/* ───────────── Instrument tuner (mic, autocorrelation) ───────────── */
function detectPitch(buf: Float32Array, rate: number): number | null {
  let rms = 0;
  for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / buf.length);
  if (rms < 0.012) return null;
  // trim leading/trailing quiet parts
  let r1 = 0;
  let r2 = buf.length - 1;
  const thr = 0.2;
  for (let i = 0; i < buf.length / 2; i++) if (Math.abs(buf[i]) < thr) { r1 = i; break; }
  for (let i = 1; i < buf.length / 2; i++) if (Math.abs(buf[buf.length - i]) < thr) { r2 = buf.length - i; break; }
  const b = buf.slice(r1, r2);
  const n = b.length;
  const c = new Float32Array(n);
  for (let lag = 0; lag < n; lag++) {
    let sum = 0;
    for (let i = 0; i < n - lag; i++) sum += b[i] * b[i + lag];
    c[lag] = sum;
  }
  let d = 0;
  while (d < n - 1 && c[d] > c[d + 1]) d++;
  let maxV = -1;
  let maxP = -1;
  for (let i = d; i < n; i++) if (c[i] > maxV) { maxV = c[i]; maxP = i; }
  if (maxP <= 0 || maxP >= n - 1) return null;
  const x1 = c[maxP - 1], x2 = c[maxP], x3 = c[maxP + 1];
  const a = (x1 + x3 - 2 * x2) / 2;
  const bb = (x3 - x1) / 2;
  const T0 = a ? maxP - bb / (2 * a) : maxP;
  const f = rate / T0;
  return f > 30 && f < 2000 ? f : null;
}

export function Tuner({ onBack, mobile }: P) {
  const [on, setOn] = useState(false);
  const [freq, setFreq] = useState<number | null>(null);
  const [a4, setA4] = useState(440);
  const [err, setErr] = useState<string | null>(null);
  const stop = useRef<() => void>(() => {});
  const smooth = useRef<number | null>(null);

  useEffect(() => () => stop.current(), []);

  const start = async () => {
    setErr(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser();
      an.fftSize = 2048;
      src.connect(an);
      const buf = new Float32Array(an.fftSize);
      let raf = 0;
      const loop = () => {
        an.getFloatTimeDomainData(buf);
        const f = detectPitch(buf, ctx.sampleRate);
        if (f) {
          smooth.current = smooth.current && Math.abs(f - smooth.current) / smooth.current < 0.06 ? smooth.current * 0.7 + f * 0.3 : f;
          setFreq(smooth.current);
        }
        raf = requestAnimationFrame(loop);
      };
      loop();
      stop.current = () => {
        cancelAnimationFrame(raf);
        stream.getTracks().forEach((t) => t.stop());
        void ctx.close();
      };
      setOn(true);
    } catch {
      setErr("Microphone access is needed for the tuner.");
    }
  };

  const info = useMemo(() => {
    if (!freq) return null;
    const n = 12 * Math.log2(freq / a4) + 69;
    const midi = Math.round(n);
    const cents = Math.round((n - midi) * 100);
    return { name: NOTE_NAMES[((midi % 12) + 12) % 12], octave: Math.floor(midi / 12) - 1, cents, target: a4 * Math.pow(2, (midi - 69) / 12) };
  }, [freq, a4]);
  const inTune = info && Math.abs(info.cents) <= 5;

  return (
    <AppFrame title="Instrument tuner" Icon={Gauge} iconClass="text-[#57f287]" mobile={mobile} onBack={onBack}>
      <div className={cn(box, "text-center")}>
        <div className={cn("text-7xl font-black tabular-nums transition-colors sm:text-8xl", inTune ? "text-ok" : "text-txt")}>
          {info ? info.name : "—"}
          <span className="text-3xl text-sub">{info ? info.octave : ""}</span>
        </div>
        <div className="mt-1 text-sm text-sub tabular-nums">{freq ? `${freq.toFixed(1)} Hz` : on ? "Play a note…" : "Tap start and play a single note"}</div>
        <div className="relative mx-auto mt-6 h-12 max-w-md overflow-hidden rounded-full bg-black/30">
          <div className="absolute inset-y-0 left-1/2 w-[10%] -translate-x-1/2 bg-ok/20" />
          {[-50, -25, 0, 25, 50].map((c) => (
            <div key={c} className="absolute inset-y-2 w-px bg-white/20" style={{ left: `${50 + c}%` }} />
          ))}
          {info && (
            <div
              className={cn("absolute inset-y-1 w-1.5 -translate-x-1/2 rounded-full transition-[left] duration-100", inTune ? "bg-ok" : Math.abs(info.cents) < 20 ? "bg-idle" : "bg-dnd")}
              style={{ left: `${50 + Math.max(-50, Math.min(50, info.cents))}%` }}
            />
          )}
        </div>
        <div className="mt-2 text-sm font-semibold tabular-nums">{info ? (inTune ? "In tune ✓" : `${info.cents > 0 ? "+" : ""}${info.cents} cents · ${info.cents > 0 ? "tune down" : "tune up"}`) : " "}</div>
        <div className="mt-5 flex items-center justify-center gap-3">
          <button
            onClick={() => {
              if (on) {
                stop.current();
                setOn(false);
                setFreq(null);
              } else void start();
            }}
            className={cn("rounded-xl px-6 py-3 font-bold text-white", on ? "bg-dnd" : "bg-accent")}
          >
            <Mic className="mr-1.5 inline size-4" /> {on ? "Stop" : "Start"}
          </button>
          <label className="flex items-center gap-2 text-sm text-sub">
            A4 =
            <input type="number" min={415} max={466} value={a4} onChange={(e) => setA4(Math.min(466, Math.max(415, Number(e.target.value) || 440)))} className="w-20 rounded-lg bg-black/25 px-2 py-1.5 text-center text-txt" />
            Hz
          </label>
        </div>
        {err && <p className="mt-3 text-sm text-dnd">{err}</p>}
        <p className="mt-4 text-xs text-faint">Standard guitar: E2 A2 D3 G3 B3 E4 · Bass: E1 A1 D2 G2 · Audio stays on your device.</p>
      </div>
    </AppFrame>
  );
}

/* ───────────── Tone generator ───────────── */
export function ToneGenerator({ onBack, mobile }: P) {
  const [freq, setFreq] = useState(440);
  const [wave, setWave] = useState<OscillatorType>("sine");
  const [vol, setVol] = useState(0.2);
  const [playing, setPlaying] = useState(false);
  const nodes = useRef<{ ctx: AudioContext; osc: OscillatorNode; gain: GainNode } | null>(null);

  useEffect(() => () => void nodes.current?.ctx.close(), []);
  useEffect(() => {
    const n = nodes.current;
    if (!n) return;
    n.osc.frequency.setTargetAtTime(freq, n.ctx.currentTime, 0.02);
    n.osc.type = wave;
    n.gain.gain.setTargetAtTime(vol, n.ctx.currentTime, 0.02);
  }, [freq, wave, vol]);

  const toggle = () => {
    if (playing && nodes.current) {
      const n = nodes.current;
      n.gain.gain.setTargetAtTime(0, n.ctx.currentTime, 0.03);
      setTimeout(() => void n.ctx.close(), 150);
      nodes.current = null;
      setPlaying(false);
      return;
    }
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = wave;
    osc.frequency.value = freq;
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(vol, ctx.currentTime, 0.03);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    nodes.current = { ctx, osc, gain };
    setPlaying(true);
  };

  const logPos = Math.log(freq / 20) / Math.log(20000 / 20);
  const n = 12 * Math.log2(freq / 440) + 69;
  const note = `${NOTE_NAMES[((Math.round(n) % 12) + 12) % 12]}${Math.floor(Math.round(n) / 12) - 1}`;

  return (
    <AppFrame title="Tone generator" Icon={Radio} iconClass="text-[#eb459e]" mobile={mobile} onBack={onBack}>
      <div className={cn(box, "text-center")}>
        <div className="text-6xl font-black tabular-nums">
          {freq < 1000 ? freq.toFixed(freq < 100 ? 1 : 0) : (freq / 1000).toFixed(2) + "k"}
          <span className="text-2xl text-sub"> Hz</span>
        </div>
        <div className="text-sm text-sub">≈ {note}</div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.0005}
          value={logPos}
          onChange={(e) => setFreq(Math.round(20 * Math.pow(1000, Number(e.target.value)) * 10) / 10)}
          className="mt-5 w-full accent-[var(--color-accent)]"
          aria-label="Frequency"
        />
        <div className="mt-1 flex justify-between text-[11px] text-faint">
          <span>20 Hz</span>
          <span>200</span>
          <span>2k</span>
          <span>20 kHz</span>
        </div>
        <div className="mt-4 flex flex-wrap justify-center gap-1.5">
          {[50, 100, 261.6, 440, 1000, 4000, 10000].map((f) => (
            <button key={f} onClick={() => setFreq(f)} className={cn("rounded-full px-3 py-1.5 text-xs font-semibold", freq === f ? "bg-accent text-white" : "bg-black/25 text-sub")}>
              {f >= 1000 ? `${f / 1000}k` : f}
            </button>
          ))}
        </div>
        <div className="mt-4 flex justify-center gap-1 rounded-full bg-black/25 p-1">
          {(["sine", "square", "sawtooth", "triangle"] as OscillatorType[]).map((w) => (
            <button key={w} onClick={() => setWave(w)} className={cn("flex-1 rounded-full py-2 text-sm font-semibold capitalize", wave === w ? "bg-accent text-white" : "text-sub")}>
              {w === "sawtooth" ? "Saw" : w}
            </button>
          ))}
        </div>
        <label className="mt-4 flex items-center gap-3 text-sm text-sub">
          <Volume2 className="size-4 shrink-0" />
          <input type="range" min={0} max={0.6} step={0.01} value={vol} onChange={(e) => setVol(Number(e.target.value))} className="w-full" aria-label="Volume" />
        </label>
        <button onClick={toggle} className={cn("mt-5 w-full rounded-xl py-3.5 text-base font-bold text-white", playing ? "bg-dnd" : "bg-accent")}>
          {playing ? "Stop" : "Play tone"}
        </button>
        <p className="mt-3 text-xs text-faint">Start quiet — high frequencies and square waves are loud. Handy for speaker checks, sub tests and tuning reference.</p>
      </div>
    </AppFrame>
  );
}

/* ───────────── Lyric lab (syllables + rhymes) ───────────── */
function syllables(word: string) {
  let w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  if (w.length <= 3) return 1;
  w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "");
  const m = w.match(/[aeiouy]{1,2}/g);
  return Math.max(1, m ? m.length : 1);
}
const lineSyl = (l: string) => l.split(/\s+/).reduce((a, w) => a + syllables(w), 0);

export function LyricLab({ onBack, mobile }: P) {
  const [text, setText] = useState("");
  const [word, setWord] = useState("");
  const [rhymes, setRhymes] = useState<{ word: string; numSyllables?: number }[] | null>(null);
  const [near, setNear] = useState<{ word: string }[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => setText(load("nexus.lyriclab", "")), []);
  useEffect(() => {
    const t = setTimeout(() => save("nexus.lyriclab", text), 400);
    return () => clearTimeout(t);
  }, [text]);

  const lines = text.split("\n");
  const words = text.split(/\s+/).filter(Boolean).length;
  const lookup = async (w: string) => {
    const q = w.trim().toLowerCase().replace(/[^a-z' -]/g, "");
    if (!q) return;
    setWord(q);
    setBusy(true);
    try {
      const [a, b] = await Promise.all([
        fetch(`https://api.datamuse.com/words?rel_rhy=${encodeURIComponent(q)}&max=60`).then((r) => r.json()),
        fetch(`https://api.datamuse.com/words?rel_nry=${encodeURIComponent(q)}&max=30`).then((r) => r.json()),
      ]);
      setRhymes(Array.isArray(a) ? a : []);
      setNear(Array.isArray(b) ? b : []);
    } catch {
      setRhymes([]);
      setNear([]);
    }
    setBusy(false);
  };
  const lastWord = (l: string) => l.trim().split(/\s+/).pop()?.replace(/[^a-zA-Z']/g, "") ?? "";

  return (
    <AppFrame title="Lyric lab" Icon={PenLine} iconClass="text-[#fee75c]" mobile={mobile} onBack={onBack} wide>
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className={box}>
          <div className="mb-2 flex items-center justify-between text-xs text-sub">
            <span>
              {lines.filter((l) => l.trim()).length} lines · {words} words
            </span>
            <span>Saved on this device</span>
          </div>
          <div className="flex gap-2">
            <div className="w-9 shrink-0 select-none pt-2.5 text-right font-mono text-[13px] leading-[1.6rem] text-faint" aria-hidden>
              {lines.map((l, i) => (
                <div key={i} title="Syllables">{l.trim() ? lineSyl(l) : ""}</div>
              ))}
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={"Write your verse here…\nThe number on the left counts syllables per line."}
              className="min-h-[50vh] flex-1 resize-y rounded-xl bg-black/25 px-3 py-2 font-mono text-[15px] leading-[1.6rem] outline-none focus:ring-2 focus:ring-accent/60"
              spellCheck
            />
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[...new Set(lines.map(lastWord).filter((w) => w.length > 1))].slice(-8).map((w) => (
              <button key={w} onClick={() => void lookup(w)} className="rounded-full bg-black/25 px-2.5 py-1 text-xs text-sub hover:text-txt">
                rhymes for “{w}”
              </button>
            ))}
          </div>
        </div>
        <div className={box}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void lookup(word);
            }}
            className="flex gap-2"
          >
            <input value={word} onChange={(e) => setWord(e.target.value)} placeholder="Find rhymes for…" className={field} />
            <button className="rounded-xl bg-accent px-4 font-bold text-white">Go</button>
          </form>
          {busy ? (
            <p className="mt-4 text-sm text-sub">Looking up…</p>
          ) : rhymes ? (
            <div className="mt-4 space-y-3">
              <div>
                <div className="mb-1.5 text-xs font-bold tracking-wide text-sub uppercase">Perfect rhymes</div>
                {rhymes.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {rhymes.map((r) => (
                      <button key={r.word} onClick={() => setText((t) => t + (t && !t.endsWith(" ") && !t.endsWith("\n") ? " " : "") + r.word)} className="rounded-lg bg-accent/15 px-2 py-1 text-sm hover:bg-accent/30" title={`${r.numSyllables ?? "?"} syllables — tap to add`}>
                        {r.word}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-sub">No perfect rhymes found.</p>
                )}
              </div>
              {near.length > 0 && (
                <div>
                  <div className="mb-1.5 text-xs font-bold tracking-wide text-sub uppercase">Near rhymes</div>
                  <div className="flex flex-wrap gap-1.5">
                    {near.map((r) => (
                      <span key={r.word} className="rounded-lg bg-black/25 px-2 py-1 text-sm">{r.word}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="mt-4 text-sm text-sub">Type a word, or tap a line ending under your lyrics. Rhymes come from the free Datamuse word API.</p>
          )}
        </div>
      </div>
    </AppFrame>
  );
}

/* ───────────── Release planner (timeline + calendar export) ───────────── */
const PLAN: { days: number; task: string }[] = [
  { days: -42, task: "Finish mix & master, lock final artwork (3000×3000)" },
  { days: -35, task: "Register ISRC/UPC, splits and songwriter credits" },
  { days: -28, task: "Deliver to distributor (allow store review time)" },
  { days: -28, task: "Submit to Spotify editorial pitch (Spotify for Artists)" },
  { days: -21, task: "Pre-save link live · announce the release date" },
  { days: -14, task: "Teasers: snippets, behind-the-scenes, cover reveal" },
  { days: -7, task: "Press kit / one-sheet to blogs, playlists and radio" },
  { days: -3, task: "Countdown posts · line up Stories & Shorts" },
  { days: -1, task: "Check store links, smart link and lyrics are live" },
  { days: 0, task: "🚀 Release day — post everywhere, thank fans, go live" },
  { days: 3, task: "Share first playlist adds and fan reposts" },
  { days: 7, task: "Week-one recap · pitch to more playlists" },
  { days: 14, task: "Release a visualizer, acoustic or sped-up version" },
  { days: 28, task: "Review stats, plan the next drop" },
];

export function ReleasePlanner({ onBack, mobile }: P) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [done, setDone] = useState<Record<number, boolean>>({});
  useEffect(() => {
    const s = load<{ title: string; date: string; done: Record<number, boolean> }>("nexus.releaseplan", { title: "", date: "", done: {} });
    setTitle(s.title);
    setDate(s.date);
    setDone(s.done);
  }, []);
  useEffect(() => save("nexus.releaseplan", { title, date, done }), [title, date, done]);

  const rel = date ? new Date(`${date}T00:00:00`) : null;
  const days = rel ? Math.ceil((rel.getTime() - Date.now()) / 86_400_000) : null;
  const at = (d: number) => (rel ? new Date(rel.getTime() + d * 86_400_000) : null);
  const ymd = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;

  const exportIcs = () => {
    if (!rel) return;
    const name = title.trim() || "My release";
    const ev = PLAN.map((p, i) => {
      const d = at(p.days)!;
      const next = new Date(d.getTime() + 86_400_000);
      return ["BEGIN:VEVENT", `UID:nexus-release-${ymd(rel)}-${i}@nexusproject.cc`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`, `DTSTART;VALUE=DATE:${ymd(d)}`, `DTEND;VALUE=DATE:${ymd(next)}`, `SUMMARY:${(name + " — " + p.task).replace(/[,;]/g, " ")}`, "END:VEVENT"].join("\r\n");
    });
    const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Nexus//Release planner//EN", ...ev, "END:VCALENDAR"].join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    a.download = `${name.replace(/[^\w-]+/g, "-").slice(0, 40) || "release"}-plan.ics`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  return (
    <AppFrame title="Release planner" Icon={CalendarDays} iconClass="text-[#00a8fc]" mobile={mobile} onBack={onBack}>
      <div className={box}>
        <div className="grid gap-2 sm:grid-cols-2">
          <input value={title} onChange={(e) => setTitle(e.target.value.slice(0, 80))} placeholder="Release title" className={field} />
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} />
        </div>
        {days != null && (
          <div className="mt-4 flex items-center gap-4 rounded-xl bg-black/25 p-3">
            <div className="text-4xl font-black tabular-nums text-accent">{Math.abs(days)}</div>
            <div className="text-sm">
              <b>{days > 0 ? "days to go" : days === 0 ? "Release day!" : "days since release"}</b>
              <div className="text-sub">{rel!.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
            </div>
            <button onClick={exportIcs} className="ml-auto rounded-xl bg-accent px-3 py-2 text-sm font-bold text-white">Add to calendar</button>
          </div>
        )}
      </div>
      <div className={box}>
        <div className="mb-2 flex items-center justify-between text-xs font-bold tracking-wide text-sub uppercase">
          <span>Timeline</span>
          <span>
            {Object.values(done).filter(Boolean).length}/{PLAN.length} done
          </span>
        </div>
        <ol className="space-y-1.5">
          {PLAN.map((p, i) => {
            const d = at(p.days);
            const past = d && d.getTime() < Date.now() - 86_400_000 && !done[i];
            return (
              <li key={i}>
                <label className={cn("flex cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5", done[i] ? "bg-ok/10" : past ? "bg-dnd/10" : "bg-black/20")}>
                  <input type="checkbox" checked={!!done[i]} onChange={(e) => setDone((x) => ({ ...x, [i]: e.target.checked }))} className="mt-1" />
                  <div className="min-w-0 flex-1">
                    <div className={cn("text-sm", done[i] && "text-sub line-through")}>{p.task}</div>
                    <div className="text-[11px] text-faint">
                      {p.days === 0 ? "Release day" : p.days < 0 ? `${-p.days} days before` : `${p.days} days after`}
                      {d ? ` · ${d.toLocaleDateString(undefined, { day: "numeric", month: "short" })}` : ""}
                      {past ? " · overdue" : ""}
                    </div>
                  </div>
                </label>
              </li>
            );
          })}
        </ol>
      </div>
    </AppFrame>
  );
}

/* ───────────── World clock & meeting planner ───────────── */
const ZONES: [string, string][] = [
  ["Budapest", "Europe/Budapest"],
  ["London", "Europe/London"],
  ["New York", "America/New_York"],
  ["Los Angeles", "America/Los_Angeles"],
  ["Chicago", "America/Chicago"],
  ["Toronto", "America/Toronto"],
  ["São Paulo", "America/Sao_Paulo"],
  ["Mexico City", "America/Mexico_City"],
  ["Paris", "Europe/Paris"],
  ["Berlin", "Europe/Berlin"],
  ["Istanbul", "Europe/Istanbul"],
  ["Moscow", "Europe/Moscow"],
  ["Dubai", "Asia/Dubai"],
  ["Lagos", "Africa/Lagos"],
  ["Johannesburg", "Africa/Johannesburg"],
  ["Mumbai", "Asia/Kolkata"],
  ["Singapore", "Asia/Singapore"],
  ["Seoul", "Asia/Seoul"],
  ["Tokyo", "Asia/Tokyo"],
  ["Sydney", "Australia/Sydney"],
  ["Auckland", "Pacific/Auckland"],
];
const hourIn = (tz: string, d: Date) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(d));

export function WorldClock({ onBack, mobile }: P) {
  const [now, setNow] = useState(() => new Date());
  const [zones, setZones] = useState<string[]>([]);
  const [add, setAdd] = useState("");
  const [offset, setOffset] = useState(0); // hours from now (meeting planner)
  useEffect(() => {
    const local = Intl.DateTimeFormat().resolvedOptions().timeZone;
    setZones(load("nexus.worldclock", [local, "America/New_York", "America/Los_Angeles", "Asia/Tokyo"]));
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (zones.length) save("nexus.worldclock", zones);
  }, [zones]);
  const at = new Date(now.getTime() + offset * 3_600_000);
  const label = (tz: string) => ZONES.find((z) => z[1] === tz)?.[0] ?? tz.split("/").pop()!.replace(/_/g, " ");

  return (
    <AppFrame title="World clock" Icon={Clock} iconClass="text-[#00a8fc]" mobile={mobile} onBack={onBack}>
      <div className={box}>
        <div className="mb-3 flex items-center justify-between text-sm">
          <span className="font-bold">{offset === 0 ? "Right now" : `${offset > 0 ? "+" : ""}${offset} h from now`}</span>
          {offset !== 0 && (
            <button onClick={() => setOffset(0)} className="text-xs font-semibold text-accent">
              Back to now
            </button>
          )}
        </div>
        <input type="range" min={-12} max={36} step={1} value={offset} onChange={(e) => setOffset(Number(e.target.value))} className="w-full" aria-label="Plan a time" />
        <p className="mt-1 text-[11px] text-faint">Slide to plan a call — green = 9:00–18:00 working hours in that city.</p>
      </div>
      <div className="space-y-2">
        {zones.map((tz) => {
          const h = hourIn(tz, at);
          const work = h >= 9 && h < 18;
          const night = h < 7 || h >= 22;
          return (
            <div key={tz} className={cn("flex items-center gap-3 rounded-2xl p-4 ring-1", work ? "bg-ok/10 ring-ok/30" : night ? "bg-black/30 ring-white/5" : "bg-side ring-white/5")}>
              <div className="text-2xl">{night ? "🌙" : h < 12 ? "🌅" : h < 18 ? "☀️" : "🌆"}</div>
              <div className="min-w-0 flex-1">
                <div className="font-bold">{label(tz)}</div>
                <div className="text-xs text-sub">{new Intl.DateTimeFormat(undefined, { timeZone: tz, weekday: "short", day: "numeric", month: "short" }).format(at)}</div>
              </div>
              <div className="text-3xl font-black tabular-nums">{new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", ...(offset === 0 ? { second: "2-digit" } : {}) }).format(at)}</div>
              <button onClick={() => setZones((z) => z.filter((x) => x !== tz))} className="rounded-lg p-1.5 text-sub hover:bg-hover" aria-label={`Remove ${label(tz)}`}>
                <X className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
      <div className={cn(box, "flex gap-2")}>
        <select value={add} onChange={(e) => setAdd(e.target.value)} className={field}>
          <option value="">Add a city…</option>
          {ZONES.filter((z) => !zones.includes(z[1])).map(([n, tz]) => (
            <option key={tz} value={tz}>
              {n}
            </option>
          ))}
        </select>
        <button
          disabled={!add}
          onClick={() => {
            setZones((z) => [...z, add].slice(0, 12));
            setAdd("");
          }}
          className="rounded-xl bg-accent px-4 font-bold text-white disabled:opacity-40"
          aria-label="Add city"
        >
          <Plus className="size-5" />
        </button>
        {zones.length > 1 && (
          <button onClick={() => setZones((z) => z.slice(0, 1))} className="rounded-xl bg-black/25 px-3 text-sub" aria-label="Clear cities" title="Keep only the first city">
            <Trash2 className="size-4" />
          </button>
        )}
      </div>
    </AppFrame>
  );
}
