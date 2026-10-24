"use client";

import { useEffect, useRef, useState } from "react";
import { AudioWaveform, Barcode, Calculator, Copy, Download, Drum, Fingerprint, Mic, Printer, ShieldAlert, Signature, Upload } from "lucide-react";
import TakedownTool from "./Takedown";
import { supabase, errorText } from "@/lib/supabase";
import { NEED, gate, useMyTier } from "@/lib/premium";
import { openModal, useApp } from "@/store/app";
import { studioGo } from "@/store/studio";
import { myRank } from "@/lib/admin";
import { analyzeAudio, checkStatus, decodeLimit, clipFromFile, copyrightCheck, decodeFile, myToolChecks, type AudioCheck, type AudioReport } from "@/lib/audio";
import { toast } from "@/store/app";
import { musicGo } from "@/store/music";
import { cn } from "@/lib/utils";
import { CheckView, ReportView, SplitEditor, printSplitSheet } from "./AudioBits";
import type { Split } from "@/lib/types";

export type ToolId = "isrc" | "takedown" | "analyzer" | "copyright" | "splits" | "tempo" | "tuner" | "royalties";

export const TOOLS: { id: ToolId; label: string; sub: string; color: string; icon: React.ReactNode }[] = [
  { id: "isrc", label: "Audia ISRC generator", sub: "Official QT6HV codes", color: "#1DB954", icon: <Barcode className="size-5" /> },
  { id: "takedown", label: "Takedown notice", sub: "Spotify & Apple Music", color: "#E5484D", icon: <ShieldAlert className="size-5" /> },
  { id: "analyzer", label: "Audio analyzer", sub: "BPM, key, LUFS, true peak", color: "#F0B232", icon: <AudioWaveform className="size-5" /> },
  { id: "copyright", label: "Copyright check", sub: "Find copyrighted music", color: "#ED4245", icon: <Fingerprint className="size-5" /> },
  { id: "splits", label: "Split sheet", sub: "Who owns what %", color: "#9B59B6", icon: <Signature className="size-5" /> },
  { id: "royalties", label: "Royalty calculator", sub: "Streams → money", color: "#3BA55D", icon: <Calculator className="size-5" /> },
  { id: "tempo", label: "Tap tempo & metronome", sub: "Tap or click along", color: "#2AABEE", icon: <Drum className="size-5" /> },
  { id: "tuner", label: "Tuner", sub: "Tune with your mic", color: "#EB459E", icon: <Mic className="size-5" /> },
];

export function ToolsGrid({ onPick, active }: { onPick?: (t: ToolId) => void; active?: ToolId | null }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {TOOLS.map((t) => (
        <button
          key={t.id}
          onClick={() => (onPick ? onPick(t.id) : musicGo({ view: "tool", tool: t.id }))}
          data-active={active === t.id || undefined} className="flex items-center gap-3 rounded-2xl bg-side p-3 text-left ring-accent hover:bg-hover active:scale-[.98] data-[active]:ring-2"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-xl text-white" style={{ background: t.color }}>
            {t.icon}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{t.label}</span>
            <span className="block truncate text-xs text-sub">{t.sub}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

export default function ToolView({ tool }: { tool: ToolId }) {
  const t = TOOLS.find((x) => x.id === tool)!;
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-3 sm:p-5">
      <div className="flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-xl text-white" style={{ background: t.color }}>
          {t.icon}
        </span>
        <div>
          <h1 className="text-xl font-bold">{t.label}</h1>
          <p className="text-sm text-sub">{t.sub}</p>
        </div>
      </div>
      {tool === "isrc" && <IsrcTool />}
      {tool === "takedown" && <TakedownTool />}
      {tool === "analyzer" && <AnalyzerTool />}
      {tool === "copyright" && <AnalyzerTool copyrightFirst />}
      {tool === "splits" && <SplitTool />}
      {tool === "royalties" && <RoyaltyTool />}
      {tool === "tempo" && <TempoTool />}
      {tool === "tuner" && <TunerTool />}
    </div>
  );
}

// ------------------------------------------------------------------ analyzer + copyright
function DropZone({ onFile, accept, label }: { onFile: (f: File) => void; accept: string; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  return (
    <div
      onDragOver={(e) => (e.preventDefault(), setDrag(true))}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
      onClick={() => ref.current?.click()}
      className={cn("flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-line p-6 text-center transition hover:border-accent/60", drag && "border-accent bg-accent/10")}
    >
      <Upload className="size-8 text-sub" />
      <div className="font-semibold">{label}</div>
      <div className="text-xs text-sub">Drop a file here or tap to choose · stays on your device</div>
      <input ref={ref} type="file" accept={accept} hidden onChange={(e) => (e.target.files?.[0] && onFile(e.target.files[0]), (e.target.value = ""))} />
    </div>
  );
}

function AnalyzerTool({ copyrightFirst }: { copyrightFirst?: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<string | null>(null);
  const [report, setReport] = useState<AudioReport | null>(null);
  const [check, setCheck] = useState<AudioCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [history, setHistory] = useState<AudioCheck[]>([]);
  const decoded = useRef<AudioBuffer | null>(null);

  useEffect(() => {
    void checkStatus().then((s) => setConfigured(s.configured));
    void myToolChecks().then(setHistory);
  }, []);

  const runCheck = async (f: File) => {
    setChecking(true);
    try {
      const clip = await clipFromFile(f, decoded.current ?? undefined);
      const c = await copyrightCheck(clip, { kind: "tool" });
      setCheck(c);
      setHistory((h) => [c, ...h].slice(0, 20));
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setChecking(false);
    }
  };

  const pick = async (f: File) => {
    setFile(f);
    setReport(null);
    setCheck(null);
    decoded.current = null;
    try {
      if (f.size <= decodeLimit()) {
        setStep("Decoding audio…");
        decoded.current = await decodeFile(f);
      }
      if (copyrightFirst) {
        setStep(null);
        if (configured) await runCheck(f);
        return;
      }
      if (!decoded.current) throw new Error("File is too big to analyze on this device");
      setReport(await analyzeAudio(f, setStep, decoded.current));
    } catch (e) {
      toast(`Couldn't read this file: ${(e as Error).message}`, "error");
    } finally {
      setStep(null);
    }
  };

  return (
    <div className="space-y-4">
      {copyrightFirst && configured === false && (
        <div className="rounded-xl bg-idle/10 p-3 text-sm ring-1 ring-idle/25">
          The copyright check isn&apos;t connected yet — an admin adds ACRCloud keys in Studio → Admin → Distribution settings. The audio analyzer works without it.
          {myRank() >= 3 && (
            <button
              onClick={() => {
                studioGo("dist-settings");
                useApp.setState({ hub: "studio" });
              }}
              className="mt-2 block rounded-full bg-idle px-4 py-1.5 text-sm font-bold text-black"
            >
              Open Distribution settings
            </button>
          )}
        </div>
      )}
      <DropZone
        onFile={(f) => void pick(f)}
        accept={copyrightFirst ? "audio/*,video/*,.wav,.flac,.mp3,.m4a,.mov,.mp4" : "audio/*,.wav,.flac,.mp3,.m4a,.aiff,.ogg"}
        label={copyrightFirst ? "Choose a song or video to check" : "Choose a track (WAV, FLAC, MP3, M4A)"}
      />
      {file && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="min-w-0 truncate font-semibold">{file.name}</span>
          <span className="text-sub">{(file.size / 1048576).toFixed(1)} MB</span>
          {step && <span className="animate-pulse text-sub">{step}</span>}
          {(configured || copyrightFirst) && !checking && !step && (
            <button disabled={!configured} onClick={() => void runCheck(file)} className="ml-auto flex items-center gap-1.5 rounded-full bg-dnd px-3.5 py-1.5 font-semibold text-white disabled:opacity-50">
              <Fingerprint className="size-4" /> {check ? "Check again" : "Check copyright"}
            </button>
          )}
          {checking && <span className="ml-auto animate-pulse text-sub">Listening for copyrighted music… (about 15 s)</span>}
        </div>
      )}
      {check && <CheckView c={check} />}
      {report && <ReportView r={report} />}
      {copyrightFirst && history.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-bold tracking-wide text-sub uppercase">Your recent checks</div>
          <div className="space-y-2">
            {history.slice(0, 6).map((h) => (
              <CheckView key={h.id} c={h} />
            ))}
          </div>
        </div>
      )}
      <p className="text-xs text-faint">
        Copyright matching compares an audio fingerprint against ACRCloud&apos;s database of released music. Audible Magic (the Content ID-style service big platforms use) needs an enterprise agreement
        with them — once you have one, it can be added as a second provider.
      </p>
    </div>
  );
}

// ------------------------------------------------------------------ split sheet
function SplitTool() {
  const KEY = "nexus:splitsheet";
  const [s, setS] = useState<{ title: string; artist: string; isrc: string; splits: Split[] }>(() => {
    try {
      return JSON.parse(localStorage.getItem(KEY) ?? "") as { title: string; artist: string; isrc: string; splits: Split[] };
    } catch {
      return { title: "", artist: "", isrc: "", splits: [{ name: "", role: "Songwriter", share: 50 }, { name: "", role: "Producer", share: 50 }] };
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      /* private mode */
    }
  }, [s]);
  const total = s.splits.reduce((a, x) => a + x.share, 0);
  return (
    <div className="space-y-3 rounded-2xl bg-side p-4">
      <div className="grid gap-2 sm:grid-cols-3">
        <input value={s.title} onChange={(e) => setS({ ...s, title: e.target.value })} placeholder="Song title" className="rounded-lg border border-line bg-transparent px-3 py-2 text-sm outline-none focus:border-accent" />
        <input value={s.artist} onChange={(e) => setS({ ...s, artist: e.target.value })} placeholder="Artist" className="rounded-lg border border-line bg-transparent px-3 py-2 text-sm outline-none focus:border-accent" />
        <input value={s.isrc} onChange={(e) => setS({ ...s, isrc: e.target.value.toUpperCase() })} placeholder="ISRC (optional)" className="rounded-lg border border-line bg-transparent px-3 py-2 font-mono text-sm outline-none focus:border-accent" />
      </div>
      <SplitEditor splits={s.splits} onChange={(splits) => setS({ ...s, splits })} />
      <button
        disabled={!s.title.trim() || Math.round(total * 100) / 100 !== 100 || s.splits.some((x) => !x.name.trim())}
        onClick={() => printSplitSheet({ title: s.title, artist: s.artist, isrc: s.isrc }, s.splits)}
        className="flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        <Printer className="size-4" /> Print / save as PDF
      </button>
      <p className="text-xs text-faint">Tip: in a release, each track has its own split sheet under Studio → Releases.</p>
    </div>
  );
}

// ------------------------------------------------------------------ royalties
const RATES = [
  { name: "Spotify", rate: 0.0035 },
  { name: "Apple Music", rate: 0.0075 },
  { name: "Amazon Music", rate: 0.004 },
  { name: "YouTube Music", rate: 0.002 },
  { name: "Tidal", rate: 0.0125 },
  { name: "Deezer", rate: 0.0064 },
];
function RoyaltyTool() {
  const [streams, setStreams] = useState<Record<string, string>>({ Spotify: "100000" });
  const [rates, setRates] = useState<Record<string, string>>(Object.fromEntries(RATES.map((r) => [r.name, String(r.rate)])));
  const [fee, setFee] = useState("0");
  const [share, setShare] = useState("100");
  const num = (v: string | undefined) => Math.max(0, Number((v ?? "").replace(",", ".")) || 0);
  const gross = RATES.reduce((a, r) => a + num(streams[r.name]) * num(rates[r.name]), 0);
  const net = gross * (1 - num(fee) / 100) * (num(share) / 100);
  const usd = (n: number) => n.toLocaleString([], { style: "currency", currency: "USD", maximumFractionDigits: n < 10 ? 2 : 0 });
  return (
    <div className="space-y-3 rounded-2xl bg-side p-4">
      <div className="grid grid-cols-[1fr_110px_90px] gap-x-2 gap-y-1.5 text-sm">
        <div className="text-xs font-bold text-sub uppercase">Platform</div>
        <div className="text-xs font-bold text-sub uppercase">Streams</div>
        <div className="text-xs font-bold text-sub uppercase">$ / stream</div>
        {RATES.map((r) => (
          <div key={r.name} className="contents">
            <div className="self-center">{r.name}</div>
            <input inputMode="numeric" value={streams[r.name] ?? ""} onChange={(e) => setStreams({ ...streams, [r.name]: e.target.value.replace(/[^\d]/g, "") })} placeholder="0" className="rounded-lg border border-line bg-transparent px-2 py-1.5 text-right tabular-nums outline-none focus:border-accent" />
            <input inputMode="decimal" value={rates[r.name]} onChange={(e) => setRates({ ...rates, [r.name]: e.target.value })} className="rounded-lg border border-line bg-transparent px-2 py-1.5 text-right tabular-nums outline-none focus:border-accent" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-sm">
          <span className="mb-1 block text-xs text-sub">Distributor fee %</span>
          <input inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} className="w-full rounded-lg border border-line bg-transparent px-2 py-1.5 outline-none focus:border-accent" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-sub">Your share %</span>
          <input inputMode="decimal" value={share} onChange={(e) => setShare(e.target.value)} className="w-full rounded-lg border border-line bg-transparent px-2 py-1.5 outline-none focus:border-accent" />
        </label>
      </div>
      <div className="flex items-end justify-between rounded-xl bg-black/25 p-3">
        <div>
          <div className="text-xs text-sub">Gross</div>
          <div className="font-semibold tabular-nums">{usd(gross)}</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-sub">You get</div>
          <div className="text-2xl font-bold text-ok tabular-nums">{usd(net)}</div>
        </div>
      </div>
      <p className="text-xs text-faint">Per-stream rates are rough averages — real payouts depend on country, subscription type and the month. Edit them to match your statements.</p>
    </div>
  );
}

// ------------------------------------------------------------------ tap tempo + metronome
function TempoTool() {
  const [bpm, setBpm] = useState(120);
  const [beats, setBeats] = useState(4);
  const [running, setRunning] = useState(false);
  const [beat, setBeat] = useState(-1);
  const taps = useRef<number[]>([]);
  const ctxRef = useRef<AudioContext | null>(null);
  const timer = useRef<number | null>(null);
  const next = useRef({ t: 0, n: 0 });
  const live = useRef({ bpm, beats });
  live.current = { bpm, beats };

  const tap = () => {
    const now = performance.now();
    const t = taps.current.filter((x) => now - x < 2500);
    t.push(now);
    taps.current = t.slice(-8);
    if (t.length >= 2) {
      const gaps = t.slice(1).map((x, i) => x - t[i]);
      const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      setBpm(Math.max(30, Math.min(300, Math.round(60000 / avg))));
    }
  };

  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setRunning(false);
    setBeat(-1);
  };
  const start = async () => {
    const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = (ctxRef.current ??= new C());
    await ctx.resume();
    next.current = { t: ctx.currentTime + 0.05, n: 0 };
    setRunning(true);
    timer.current = window.setInterval(() => {
      while (next.current.t < ctx.currentTime + 0.12) {
        const { t, n } = next.current;
        const accent = n % live.current.beats === 0;
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.value = accent ? 1600 : 1000;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(accent ? 0.8 : 0.45, t + 0.002);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
        o.connect(g).connect(ctx.destination);
        o.start(t);
        o.stop(t + 0.06);
        const delay = Math.max(0, (t - ctx.currentTime) * 1000);
        setTimeout(() => setBeat(n % live.current.beats), delay);
        next.current = { t: t + 60 / live.current.bpm, n: n + 1 };
      }
    }, 25);
  };
  useEffect(() => () => stop(), []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4 rounded-2xl bg-side p-4">
      <div className="text-center">
        <div className="text-6xl font-black tabular-nums">{bpm}</div>
        <div className="text-sm text-sub">BPM</div>
      </div>
      <div className="flex justify-center gap-2">
        {Array.from({ length: beats }, (_, i) => (
          <span key={i} className={cn("size-4 rounded-full transition", beat === i ? (i === 0 ? "scale-125 bg-accent" : "scale-110 bg-txt") : "bg-white/15")} />
        ))}
      </div>
      <input type="range" min={30} max={300} value={bpm} onChange={(e) => setBpm(Number(e.target.value))} className="w-full accent-[var(--color-accent)]" />
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button onClick={() => setBpm((b) => Math.max(30, b - 1))} className="rounded-full bg-hover px-3 py-2 font-semibold">
          −1
        </button>
        <button onClick={tap} className="rounded-full bg-accent px-8 py-3 text-lg font-bold text-white active:scale-95">
          TAP
        </button>
        <button onClick={() => setBpm((b) => Math.min(300, b + 1))} className="rounded-full bg-hover px-3 py-2 font-semibold">
          +1
        </button>
      </div>
      <div className="flex items-center justify-center gap-3">
        <select value={beats} onChange={(e) => setBeats(Number(e.target.value))} className="rounded-lg border border-line bg-transparent px-2 py-2 text-sm outline-none">
          {[2, 3, 4, 5, 6, 7].map((n) => (
            <option key={n} value={n} className="bg-side">
              {n}/4
            </option>
          ))}
        </select>
        <button onClick={() => (running ? stop() : void start())} className={cn("rounded-full px-6 py-2 font-semibold text-white", running ? "bg-dnd" : "bg-ok")}>
          {running ? "Stop" : "Start metronome"}
        </button>
      </div>
      <p className="text-center text-xs text-faint">Tap along to any song to find its tempo.</p>
    </div>
  );
}

// ------------------------------------------------------------------ tuner
const NOTE_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
function pitchOf(buf: Float32Array, rate: number): number | null {
  let rms = 0;
  for (const x of buf) rms += x * x;
  if (Math.sqrt(rms / buf.length) < 0.01) return null;
  // normalized autocorrelation (McLeod-style) between 50 Hz and 1.5 kHz
  const minLag = Math.floor(rate / 1500);
  const maxLag = Math.floor(rate / 50);
  let best = -1;
  let bestVal = 0;
  const vals = new Float32Array(maxLag + 2);
  for (let lag = minLag; lag <= maxLag; lag++) {
    let ac = 0, e = 0; // prettier-ignore
    for (let i = 0; i + lag < buf.length; i++) {
      ac += buf[i] * buf[i + lag];
      e += buf[i] * buf[i] + buf[i + lag] * buf[i + lag];
    }
    vals[lag] = e ? (2 * ac) / e : 0;
  }
  const peak = Math.max(...vals);
  for (let lag = minLag; lag <= maxLag; lag++) {
    if (vals[lag] > 0.9 * peak && vals[lag] >= vals[lag - 1] && vals[lag] >= vals[lag + 1]) {
      best = lag;
      bestVal = vals[lag];
      break;
    }
  }
  if (best < 0 || bestVal < 0.6) return null;
  const a = vals[best - 1], b = vals[best], c = vals[best + 1]; // prettier-ignore
  const shift = (a - c) / (2 * (a - 2 * b + c) || 1);
  return rate / (best + shift);
}

function TunerTool() {
  const [on, setOn] = useState(false);
  const [hz, setHz] = useState<number | null>(null);
  const [ref, setRef] = useState(440);
  const stopRef = useRef<(() => void) | null>(null);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new C();
      const an = ctx.createAnalyser();
      an.fftSize = 4096;
      ctx.createMediaStreamSource(stream).connect(an);
      const buf = new Float32Array(an.fftSize);
      let raf = 0;
      let smooth: number | null = null;
      const loop = () => {
        an.getFloatTimeDomainData(buf);
        const p = pitchOf(buf, ctx.sampleRate);
        if (p) smooth = smooth && Math.abs(p - smooth) / smooth < 0.06 ? smooth * 0.7 + p * 0.3 : p;
        setHz(p ? smooth : null);
        raf = requestAnimationFrame(loop);
      };
      loop();
      stopRef.current = () => {
        cancelAnimationFrame(raf);
        stream.getTracks().forEach((t) => t.stop());
        void ctx.close();
      };
      setOn(true);
    } catch {
      toast("Allow microphone access to use the tuner", "error");
    }
  };
  const stop = () => {
    stopRef.current?.();
    stopRef.current = null;
    setOn(false);
    setHz(null);
  };
  useEffect(() => () => stopRef.current?.(), []);

  const midi = hz ? 69 + 12 * Math.log2(hz / ref) : null;
  const n = midi != null ? Math.round(midi) : null;
  const cents = midi != null && n != null ? Math.round((midi - n) * 100) : 0;
  const inTune = hz != null && Math.abs(cents) <= 5;

  return (
    <div className="space-y-4 rounded-2xl bg-side p-5 text-center">
      <div className={cn("text-7xl font-black transition-colors", inTune ? "text-ok" : hz ? "text-txt" : "text-faint")}>
        {n != null ? NOTE_NAMES[((n % 12) + 12) % 12] : "–"}
        <span className="text-3xl text-sub">{n != null ? Math.floor(n / 12) - 1 : ""}</span>
      </div>
      <div className="text-sm text-sub tabular-nums">{hz ? `${hz.toFixed(1)} Hz · ${cents > 0 ? "+" : ""}${cents} cents` : on ? "Play a note…" : "Microphone off"}</div>
      <div className="relative mx-auto h-3 max-w-sm rounded-full bg-black/30">
        <div className="absolute top-1/2 left-1/2 h-5 w-0.5 -translate-x-1/2 -translate-y-1/2 bg-ok" />
        {hz != null && (
          <div className={cn("absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full transition-all", inTune ? "bg-ok" : "bg-idle")} style={{ left: `${50 + Math.max(-50, Math.min(50, cents))}%` }} />
        )}
      </div>
      <div className="flex items-center justify-center gap-3">
        <button onClick={() => (on ? stop() : void start())} className={cn("rounded-full px-6 py-2 font-semibold text-white", on ? "bg-dnd" : "bg-accent")}>
          {on ? "Stop" : "Start tuner"}
        </button>
        <label className="flex items-center gap-1 text-sm text-sub">
          A =
          <input type="number" min={415} max={466} value={ref} onChange={(e) => setRef(Math.max(415, Math.min(466, Number(e.target.value) || 440)))} className="w-16 rounded-lg border border-line bg-transparent px-2 py-1 text-txt outline-none" />
          Hz
        </label>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Audia ISRC generator
type IsrcRow = { code: string; title: string | null; artist: string | null; created_at: string };
const fmtIsrc = (c: string) => `${c.slice(0, 2)}-${c.slice(2, 5)}-${c.slice(5, 7)}-${c.slice(7)}`;

function IsrcTool() {
  const tier = useMyTier();
  const [cfg, setCfg] = useState<{ prefix: string; next: string; allowed: boolean; admin?: boolean } | null>(null);
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [count, setCount] = useState(1);
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<IsrcRow[]>([]);
  const [history, setHistory] = useState<IsrcRow[]>([]);
  const [admin, setAdmin] = useState({ prefix: "", next: "" });

  const load = async () => {
    const { data } = await supabase.rpc("isrc_config");
    const c = data as { prefix: string; next: string; allowed: boolean; admin?: boolean } | null;
    setCfg(c);
    if (c) setAdmin({ prefix: c.prefix, next: String(c.next) });
    const h = await supabase.from("isrc_codes").select("code, title, artist, created_at").order("created_at", { ascending: false }).limit(200);
    setHistory((h.data ?? []) as IsrcRow[]);
  };
  useEffect(() => void load(), [tier]);

  const copy = (t: string) => void navigator.clipboard.writeText(t).then(() => toast("Copied", "success"));
  const csv = () => {
    const rows = [["ISRC", "Title", "Artist", "Created"], ...history.map((r) => [r.code, r.title ?? "", r.artist ?? "", r.created_at])];
    const blob = new Blob([rows.map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(",")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "audia-isrc-codes.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const yy = String(new Date().getFullYear() % 100).padStart(2, "0");

  return (
    <div className="space-y-4">
      <div className="rounded-2xl p-4 text-white" style={{ background: "linear-gradient(135deg,#0f5132,#1DB954)" }}>
        <div className="text-xs font-bold tracking-widest text-white/75 uppercase">Audia Music Recordings · registrant</div>
        <div className="mt-1 font-mono text-3xl font-black tracking-wider">
          {(cfg?.prefix ?? "QT6HV").slice(0, 2)}-{(cfg?.prefix ?? "QT6HV").slice(2)}-{yy}-•••••
        </div>
        <p className="mt-1 text-sm text-white/85">Every code comes from one shared counter, so no ISRC is ever handed out twice. Codes are saved to your history.</p>
      </div>

      {cfg && !cfg.allowed ? (
        <div className="rounded-2xl bg-side p-4 text-sm">
          <div className="font-semibold">🎵 Audia ISRC codes come with Music Distribution</div>
          <p className="mt-1 text-sub">Get the Nexus Lighting Premium + Music Distribution plan to generate official codes for your releases.</p>
          <button onClick={() => openModal("premium", "dist")} className="mt-3 rounded-full bg-[#1DB954] px-4 py-2 font-bold text-black">
            See plans
          </button>
        </div>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!gate(NEED.isrc, "Audia ISRC codes")) return;
            setBusy(true);
            const { data, error } = await supabase.rpc("generate_isrc", { p_title: title.trim() || null, p_artist: artist.trim() || null, p_count: count });
            setBusy(false);
            if (error) return toast(errorText(error), "error");
            setMade((data ?? []) as IsrcRow[]);
            toast(`${(data as IsrcRow[]).length} code(s) generated`, "success");
            void load();
          }}
          className="grid gap-2 rounded-2xl bg-side p-4 sm:grid-cols-[1fr_1fr_90px_auto]"
        >
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Track title (optional)" className="min-w-0 rounded-lg border border-line bg-transparent px-3 py-2 text-sm outline-none focus:border-accent" />
          <input value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="Artist (optional)" className="min-w-0 rounded-lg border border-line bg-transparent px-3 py-2 text-sm outline-none focus:border-accent" />
          <input type="number" min={1} max={50} value={count} onChange={(e) => setCount(Math.max(1, Math.min(50, Number(e.target.value) || 1)))} title="How many codes" className="rounded-lg border border-line bg-transparent px-2 py-2 text-sm outline-none" />
          <button disabled={busy} className="rounded-full bg-[#1DB954] px-5 py-2 text-sm font-bold text-black disabled:opacity-50">
            {busy ? "Generating…" : count > 1 ? `Generate ${count}` : "Generate"}
          </button>
        </form>
      )}

      {made.length > 0 && (
        <div className="rounded-2xl border border-[#1DB954]/40 bg-[#1DB954]/10 p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <span className="flex-1">New codes</span>
            <button onClick={() => copy(made.map((r) => r.code).join("\n"))} className="flex items-center gap-1 rounded-full bg-hover px-3 py-1 text-xs hover:bg-active">
              <Copy className="size-3.5" /> Copy all
            </button>
          </div>
          {made.map((r) => (
            <button key={r.code} onClick={() => copy(r.code)} className="block w-full rounded-lg px-2 py-1 text-left font-mono text-lg font-bold hover:bg-white/5">
              {fmtIsrc(r.code)}
            </button>
          ))}
        </div>
      )}

      {history.length > 0 && (
        <div className="rounded-2xl bg-side p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <span className="flex-1">History ({history.length})</span>
            <button onClick={csv} className="flex items-center gap-1 rounded-full bg-hover px-3 py-1 text-xs hover:bg-active">
              <Download className="size-3.5" /> CSV
            </button>
          </div>
          <div className="max-h-80 space-y-0.5 overflow-y-auto">
            {history.map((r) => (
              <button key={r.code} onClick={() => copy(r.code)} className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-hover">
                <span className="font-mono font-semibold">{r.code}</span>
                <span className="min-w-0 flex-1 truncate text-sub">{[r.title, r.artist].filter(Boolean).join(" — ")}</span>
                <span className="text-xs text-sub">{new Date(r.created_at).toLocaleDateString([], { dateStyle: "short" })}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {cfg?.admin && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const { error } = await supabase.rpc("set_isrc_config", { p_prefix: admin.prefix.trim().toUpperCase(), p_next: Number(admin.next) || 1 });
            if (error) return toast(errorText(error), "error");
            toast("ISRC settings saved", "success");
            void load();
          }}
          className="flex flex-wrap items-end gap-2 rounded-2xl border border-line/70 p-3 text-sm"
        >
          <div className="w-full text-xs font-semibold text-sub uppercase">Admin · registrant settings</div>
          <label className="block">
            <span className="text-xs text-sub">Prefix</span>
            <input value={admin.prefix} onChange={(e) => setAdmin({ ...admin, prefix: e.target.value.toUpperCase().slice(0, 5) })} className="block w-28 rounded-lg border border-line bg-transparent px-2 py-1.5 font-mono outline-none" />
          </label>
          <label className="block">
            <span className="text-xs text-sub">Next number (min)</span>
            <input type="number" min={1} max={99999} value={admin.next} onChange={(e) => setAdmin({ ...admin, next: e.target.value })} className="block w-32 rounded-lg border border-line bg-transparent px-2 py-1.5 outline-none" />
          </label>
          <button className="rounded-full bg-accent px-4 py-1.5 font-semibold text-white">Save</button>
        </form>
      )}
    </div>
  );
}
