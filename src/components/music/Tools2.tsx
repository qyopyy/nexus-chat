"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Pause, Play, Square, Upload } from "lucide-react";
import { toast } from "@/store/app";
import { decodeFile, decodeLimit, fmtTime } from "@/lib/audio";
import { baseName, centre, db, download, encodeWav, fades, gain, limit, lufs, master, peak, slice, undb, type MasterStyle } from "@/lib/dsp";
import { cn } from "@/lib/utils";

// ------------------------------------------------------------------ shared bits
let previewCtx: AudioContext | null = null;
const pctx = () => (previewCtx ??= new AudioContext());

/** play an AudioBuffer (one at a time across all tools) */
function usePreview() {
  const cur = useRef<{ src: AudioBufferSourceNode; started: number; offset: number } | null>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const stop = useCallback(() => {
    try {
      cur.current?.src.stop();
    } catch {
      /* already stopped */
    }
    cur.current = null;
    setPlaying(false);
  }, []);
  const play = useCallback(
    (buf: AudioBuffer, offset = 0) => {
      stop();
      const c = pctx();
      void c.resume();
      const src = c.createBufferSource();
      src.buffer = buf;
      src.connect(c.destination);
      src.start(0, offset);
      src.onended = () => cur.current?.src === src && (cur.current = null, setPlaying(false));
      cur.current = { src, started: c.currentTime, offset };
      setPlaying(true);
    },
    [stop],
  );
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => cur.current && setPos(cur.current.offset + pctx().currentTime - cur.current.started), 100);
    return () => clearInterval(id);
  }, [playing]);
  useEffect(() => stop, [stop]);
  return { play, stop, playing, pos };
}

function AudioPick({ onLoad, label = "Drop a song or beat" }: { onLoad: (buf: AudioBuffer, file: File) => void; label?: string }) {
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const take = async (f?: File | null) => {
    if (!f) return;
    if (f.size > decodeLimit()) return toast(`That file is too big to process in the browser (max ${Math.round(decodeLimit() / 1048576)} MB)`, "error");
    setBusy(true);
    try {
      onLoad(await decodeFile(f), f);
    } catch {
      toast("Couldn't read that file — try WAV, MP3, M4A or FLAC", "error");
    }
    setBusy(false);
  };
  return (
    <button
      onClick={() => input.current?.click()}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => (e.preventDefault(), void take(e.dataTransfer.files[0]))}
      className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-line px-4 py-8 text-sub hover:border-accent hover:text-txt"
    >
      <input ref={input} type="file" accept="audio/*,video/*,.wav,.mp3,.m4a,.flac,.aac,.ogg" hidden onChange={(e) => (void take(e.target.files?.[0]), (e.target.value = ""))} />
      <Upload className="size-8" />
      <span className="font-semibold">{busy ? "Reading…" : label}</span>
      <span className="text-xs">WAV, MP3, M4A, FLAC, OGG — or a video's soundtrack. Processed on your device.</span>
    </button>
  );
}

function Waveform({ buf, start = 0, end, pos, onSeek, h = 80 }: { buf: AudioBuffer; start?: number; end?: number; pos?: number; onSeek?: (t: number) => void; h?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const W = cv.clientWidth,
      dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = W * dpr;
    cv.height = h * dpr;
    const g = cv.getContext("2d")!;
    g.scale(dpr, dpr);
    g.clearRect(0, 0, W, h);
    const d = buf.getChannelData(0);
    const per = Math.max(1, Math.floor(d.length / W));
    const e = end ?? buf.duration;
    for (let x = 0; x < W; x++) {
      let mn = 1,
        mx = -1;
      for (let i = x * per; i < (x + 1) * per && i < d.length; i += 4) {
        const v = d[i];
        if (v < mn) mn = v;
        if (v > mx) mx = v;
      }
      const t = (x / W) * buf.duration;
      g.fillStyle = t >= start && t <= e ? "#8b5cff" : "rgba(255,255,255,.18)";
      g.fillRect(x, ((1 - mx) / 2) * h, 1, Math.max(1, ((mx - mn) / 2) * h));
    }
    if (pos !== undefined) {
      g.fillStyle = "#fff";
      g.fillRect((pos / buf.duration) * W, 0, 2, h);
    }
  }, [buf, start, end, pos, h]);
  return (
    <canvas
      ref={ref}
      className={cn("w-full rounded-xl bg-black/30", onSeek && "cursor-pointer")}
      style={{ height: h }}
      onClick={(e) => {
        if (!onSeek) return;
        const r = e.currentTarget.getBoundingClientRect();
        onSeek(((e.clientX - r.left) / r.width) * buf.duration);
      }}
    />
  );
}

function ResultBar({ buf, name, note }: { buf: AudioBuffer; name: string; note?: string }) {
  const pv = usePreview();
  const [bits, setBits] = useState<16 | 24>(24);
  return (
    <div className="space-y-2 rounded-2xl bg-side p-3">
      <div className="flex items-center gap-2">
        <button onClick={() => (pv.playing ? pv.stop() : pv.play(buf))} className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-white" aria-label={pv.playing ? "Stop" : "Play result"}>
          {pv.playing ? <Square className="size-4 fill-current" /> : <Play className="size-4 fill-current" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{name}.wav</div>
          <div className="text-xs text-sub">
            {fmtTime(buf.duration)} · {buf.sampleRate / 1000} kHz{note ? ` · ${note}` : ""}
          </div>
        </div>
        <select value={bits} onChange={(e) => setBits(Number(e.target.value) as 16 | 24)} className="rounded-lg bg-hover px-2 py-1.5 text-sm">
          <option value={24}>24-bit</option>
          <option value={16}>16-bit</option>
        </select>
        <button onClick={() => download(encodeWav(buf, bits), `${name}.wav`)} className="flex items-center gap-1.5 rounded-full bg-txt px-4 py-2 text-sm font-bold text-chat">
          <Download className="size-4" /> WAV
        </button>
      </div>
      <Waveform buf={buf} pos={pv.playing ? pv.pos : undefined} h={48} />
    </div>
  );
}

function Seg<T extends string | number>({ value, set, options }: { value: T; set: (v: T) => void; options: [T, string][] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(([v, l]) => (
        <button key={String(v)} onClick={() => set(v)} className={cn("rounded-full px-3 py-1.5 text-sm font-semibold", value === v ? "bg-accent text-white" : "bg-hover hover:bg-active")}>
          {l}
        </button>
      ))}
    </div>
  );
}
function Knob({ label, value, min, max, step, set, fmt }: { label: string; value: number; min: number; max: number; step: number; set: (v: number) => void; fmt: (v: number) => string }) {
  return (
    <label className="block">
      <span className="flex justify-between text-xs text-sub">
        <span>{label}</span>
        <span className="font-semibold text-txt tabular-nums">{fmt(value)}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => set(Number(e.target.value))} className="vol mt-1 w-full" style={{ ["--fill" as string]: `${((value - min) / (max - min)) * 100}%` }} />
    </label>
  );
}

// ------------------------------------------------------------------ quick master
const TARGETS: [number, string][] = [
  [-14, "Spotify / YouTube −14"],
  [-16, "Apple Music −16"],
  [-11, "Loud −11"],
  [-9, "Club −9"],
];
export function MasterTool() {
  const [src, setSrc] = useState<{ buf: AudioBuffer; file: File; lufs: number | null } | null>(null);
  const [style, setStyle] = useState<MasterStyle>("balanced");
  const [target, setTarget] = useState(-14);
  const [out, setOut] = useState<{ buf: AudioBuffer; lufs: number | null; peak: number } | null>(null);
  const [step, setStep] = useState<string | null>(null);
  const [ab, setAb] = useState<"a" | "b">("b");
  const pv = usePreview();
  const run = async () => {
    if (!src) return;
    setOut(null);
    try {
      const m = await master(src.buf, style, target, setStep);
      setOut({ buf: m, lufs: await lufs(m), peak: db(peak(m)) });
    } catch (e) {
      toast((e as Error).message, "error");
    }
    setStep(null);
  };
  if (!src)
    return (
      <AudioPick
        label="Drop your mixdown"
        onLoad={async (buf, file) => {
          setSrc({ buf, file, lufs: null });
          setSrc({ buf, file, lufs: await lufs(buf) });
        }}
      />
    );
  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-side p-3 text-sm">
        <div className="font-semibold">{src.file.name}</div>
        <div className="text-xs text-sub">
          Now: {src.lufs === null ? "measuring…" : `${src.lufs.toFixed(1)} LUFS`} · peak {db(peak(src.buf)).toFixed(1)} dBFS
        </div>
      </div>
      <div>
        <div className="mb-1.5 text-xs font-bold tracking-wide text-sub uppercase">Sound</div>
        <Seg
          value={style}
          set={setStyle}
          options={[
            ["balanced", "Balanced"],
            ["warm", "Warm"],
            ["bright", "Bright"],
            ["punchy", "Punchy"],
            ["loud", "Loud & dense"],
          ]}
        />
      </div>
      <div>
        <div className="mb-1.5 text-xs font-bold tracking-wide text-sub uppercase">Loudness target</div>
        <Seg value={target} set={setTarget} options={TARGETS} />
      </div>
      <button disabled={!!step} onClick={() => void run()} className="w-full rounded-full bg-accent py-2.5 font-bold text-white disabled:opacity-50">
        {step ?? "Master it"}
      </button>
      {out && (
        <>
          <div className="flex items-center gap-2">
            <span className="text-sm text-sub">Compare:</span>
            {(["a", "b"] as const).map((k) => (
              <button
                key={k}
                onClick={() => {
                  setAb(k);
                  const at = pv.playing ? pv.pos : 0;
                  pv.play(k === "a" ? src.buf : out.buf, Math.min(at, out.buf.duration - 0.1));
                }}
                className={cn("rounded-full px-4 py-1.5 text-sm font-bold", ab === k && pv.playing ? "bg-txt text-chat" : "bg-hover")}
              >
                {k === "a" ? "A · original" : "B · mastered"}
              </button>
            ))}
            {pv.playing && (
              <button onClick={pv.stop} className="grid size-8 place-items-center rounded-full bg-hover" aria-label="Stop">
                <Square className="size-3.5 fill-current" />
              </button>
            )}
          </div>
          <ResultBar buf={out.buf} name={`${baseName(src.file)} (master)`} note={`${out.lufs?.toFixed(1) ?? "?"} LUFS · ${out.peak.toFixed(1)} dBFS peak`} />
        </>
      )}
      <p className="text-xs text-sub">A fast automatic master for demos, snippets and social posts. For a release, a mastering engineer will still do better on the details.</p>
    </div>
  );
}

// ------------------------------------------------------------------ converter / trimmer
export function ConvertTool() {
  const [src, setSrc] = useState<{ buf: AudioBuffer; file: File } | null>(null);
  const [range, setRange] = useState<[number, number]>([0, 0]);
  const [fade, setFade] = useState<[number, number]>([0, 0]);
  const [norm, setNorm] = useState<"none" | "peak" | "lufs">("none");
  const [rate, setRate] = useState<0 | 44100 | 48000>(0);
  const [mono, setMono] = useState(false);
  const [out, setOut] = useState<AudioBuffer | null>(null);
  const [busy, setBusy] = useState(false);
  const pv = usePreview();
  const run = async () => {
    if (!src) return;
    setBusy(true);
    try {
      let b = slice(src.buf, range[0], range[1]);
      const sr = rate || b.sampleRate;
      const chs = mono ? 1 : Math.min(2, b.numberOfChannels);
      if (sr !== b.sampleRate || chs !== b.numberOfChannels) {
        const c = new OfflineAudioContext(chs, Math.ceil(b.duration * sr), sr);
        const s = c.createBufferSource();
        s.buffer = b;
        s.connect(c.destination);
        s.start();
        b = await c.startRendering();
      }
      fades(b, fade[0], fade[1]);
      if (norm === "peak") gain(b, undb(-1) / Math.max(1e-6, peak(b)));
      if (norm === "lufs") {
        const l = await lufs(b);
        if (l !== null) gain(b, undb(-14 - l));
        limit(b, -1);
      }
      setOut(b);
    } catch (e) {
      toast((e as Error).message, "error");
    }
    setBusy(false);
  };
  if (!src) return <AudioPick onLoad={(buf, file) => (setSrc({ buf, file }), setRange([0, buf.duration]))} />;
  const d = src.buf.duration;
  return (
    <div className="space-y-4">
      <Waveform buf={src.buf} start={range[0]} end={range[1]} pos={pv.playing ? pv.pos : undefined} onSeek={(t) => pv.play(src.buf, t)} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Knob label="Start" value={range[0]} min={0} max={d} step={0.01} set={(v) => setRange([Math.min(v, range[1] - 0.1), range[1]])} fmt={fmtTime} />
        <Knob label="End" value={range[1]} min={0} max={d} step={0.01} set={(v) => setRange([range[0], Math.max(v, range[0] + 0.1)])} fmt={fmtTime} />
        <Knob label="Fade in" value={fade[0]} min={0} max={10} step={0.1} set={(v) => setFade([v, fade[1]])} fmt={(x) => `${x.toFixed(1)} s`} />
        <Knob label="Fade out" value={fade[1]} min={0} max={10} step={0.1} set={(v) => setFade([fade[0], v])} fmt={(x) => `${x.toFixed(1)} s`} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => pv.play(src.buf, range[0])} className="flex items-center gap-1.5 rounded-full bg-hover px-3 py-1.5 text-sm font-semibold">
          <Play className="size-3.5 fill-current" /> Preview selection
        </button>
        {pv.playing && (
          <button onClick={pv.stop} className="flex items-center gap-1.5 rounded-full bg-hover px-3 py-1.5 text-sm font-semibold">
            <Pause className="size-3.5" /> Stop
          </button>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <div className="mb-1 text-xs font-bold tracking-wide text-sub uppercase">Volume</div>
          <Seg
            value={norm}
            set={setNorm}
            options={[
              ["none", "Keep"],
              ["peak", "Peak −1 dB"],
              ["lufs", "−14 LUFS"],
            ]}
          />
        </div>
        <div>
          <div className="mb-1 text-xs font-bold tracking-wide text-sub uppercase">Sample rate</div>
          <Seg
            value={rate}
            set={setRate}
            options={[
              [0, `Keep ${src.buf.sampleRate / 1000}k`],
              [44100, "44.1k"],
              [48000, "48k"],
            ]}
          />
        </div>
        <div>
          <div className="mb-1 text-xs font-bold tracking-wide text-sub uppercase">Channels</div>
          <Seg
            value={mono ? "m" : "s"}
            set={(v) => setMono(v === "m")}
            options={[
              ["s", "Stereo"],
              ["m", "Mono"],
            ]}
          />
        </div>
      </div>
      <div className="flex gap-2">
        <button disabled={busy} onClick={() => void run()} className="flex-1 rounded-full bg-accent py-2.5 font-bold text-white disabled:opacity-50">
          {busy ? "Processing…" : "Convert"}
        </button>
        <button onClick={() => (setSrc(null), setOut(null))} className="rounded-full bg-hover px-4 font-semibold">
          New file
        </button>
      </div>
      {out && <ResultBar buf={out} name={`${baseName(src.file)} (edit)`} />}
    </div>
  );
}

// ------------------------------------------------------------------ vocal remover
export function KaraokeTool() {
  const [src, setSrc] = useState<{ buf: AudioBuffer; file: File } | null>(null);
  const [mode, setMode] = useState<"instrumental" | "acapella">("instrumental");
  const [out, setOut] = useState<AudioBuffer | null>(null);
  const [busy, setBusy] = useState(false);
  if (!src) return <AudioPick onLoad={(buf, file) => setSrc({ buf, file })} />;
  return (
    <div className="space-y-4">
      <Waveform buf={src.buf} h={56} />
      <Seg
        value={mode}
        set={(m) => (setMode(m), setOut(null))}
        options={[
          ["instrumental", "Remove vocals (karaoke)"],
          ["acapella", "Isolate centre (rough a cappella)"],
        ]}
      />
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            setOut(await centre(src.buf, mode));
          } catch (e) {
            toast((e as Error).message, "error");
          }
          setBusy(false);
        }}
        className="w-full rounded-full bg-accent py-2.5 font-bold text-white disabled:opacity-50"
      >
        {busy ? "Separating…" : "Separate"}
      </button>
      {out && <ResultBar buf={out} name={`${baseName(src.file)} (${mode})`} />}
      <p className="text-xs text-sub">Works by cancelling what&apos;s panned to the centre — great on most pop/rap mixes with centred vocals, weaker on vocals with wide stereo reverb. Only use songs you have the rights to.</p>
    </div>
  );
}

// ------------------------------------------------------------------ beat maker
type Inst = "kick" | "snare" | "clap" | "hat" | "open" | "808" | "rim" | "perc";
const INSTS: { id: Inst; name: string; color: string }[] = [
  { id: "kick", name: "Kick", color: "#ff4d6d" },
  { id: "808", name: "808", color: "#ff9f40" },
  { id: "snare", name: "Snare", color: "#ffd400" },
  { id: "clap", name: "Clap", color: "#36d39a" },
  { id: "hat", name: "Hi-hat", color: "#2fa8ff" },
  { id: "open", name: "Open hat", color: "#00e0d0" },
  { id: "rim", name: "Rim", color: "#8b5cff" },
  { id: "perc", name: "Perc", color: "#ff2bd6" },
];
type Pattern = Record<Inst, boolean[]>;
const row = (on: number[]) => Array.from({ length: 16 }, (_, i) => on.includes(i));
const PRESETS: Record<string, { bpm: number; swing: number; p: Pattern }> = {
  Trap: { bpm: 140, swing: 0, p: { kick: row([0, 7, 10]), "808": row([0, 7, 10]), snare: row([8]), clap: row([8]), hat: row([0, 2, 4, 6, 8, 10, 11, 12, 14, 15]), open: row([]), rim: row([13]), perc: row([]) } },
  Drill: { bpm: 142, swing: 0, p: { kick: row([0, 11]), "808": row([0, 3, 11, 14]), snare: row([6, 14]), clap: row([6, 14]), hat: row([0, 3, 6, 8, 10, 12]), open: row([]), rim: row([9]), perc: row([4]) } },
  "Boom bap": { bpm: 90, swing: 0.18, p: { kick: row([0, 3, 9, 10]), "808": row([]), snare: row([4, 12]), clap: row([]), hat: row([0, 2, 4, 6, 8, 10, 12, 14]), open: row([14]), rim: row([7]), perc: row([]) } },
  House: { bpm: 124, swing: 0.08, p: { kick: row([0, 4, 8, 12]), "808": row([]), snare: row([]), clap: row([4, 12]), hat: row([]), open: row([2, 6, 10, 14]), rim: row([7, 15]), perc: row([3, 11]) } },
  Reggaeton: { bpm: 96, swing: 0, p: { kick: row([0, 4, 8, 12]), "808": row([0, 8]), snare: row([3, 6, 11, 14]), clap: row([]), hat: row([0, 2, 4, 6, 8, 10, 12, 14]), open: row([]), rim: row([]), perc: row([]) } },
  Empty: { bpm: 120, swing: 0, p: { kick: row([]), "808": row([]), snare: row([]), clap: row([]), hat: row([]), open: row([]), rim: row([]), perc: row([]) } },
};
const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();
function noise(c: BaseAudioContext) {
  let b = noiseCache.get(c);
  if (!b) {
    b = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseCache.set(c, b);
  }
  return b;
}
function hit(c: BaseAudioContext, out: AudioNode, inst: Inst, t: number, root: number) {
  const env = (g: GainNode, peak: number, dec: number) => {
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
  };
  const nz = (dec: number, type: BiquadFilterType, f: number, vol: number, at = t) => {
    const s = c.createBufferSource();
    s.buffer = noise(c);
    const fl = c.createBiquadFilter();
    fl.type = type;
    fl.frequency.value = f;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dec);
    s.connect(fl).connect(g).connect(out);
    s.start(at, Math.random() * 0.5);
    s.stop(at + dec + 0.02);
  };
  const osc = (type: OscillatorType, f0: number, f1: number, glide: number, vol: number, dec: number) => {
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + glide);
    const g = c.createGain();
    env(g, vol, dec);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dec + 0.02);
  };
  switch (inst) {
    case "kick":
      osc("sine", 160, 42, 0.12, 1, 0.45);
      nz(0.012, "highpass", 3000, 0.3);
      break;
    case "808": {
      const f = 55 * Math.pow(2, root / 12) * (root > 6 ? 0.5 : 1) * 1.0;
      const o = c.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(f * 2, t);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
      const sh = c.createWaveShaper();
      const curve = new Float32Array(256);
      for (let i = 0; i < 256; i++) curve[i] = Math.tanh(((i / 255) * 2 - 1) * 2.4);
      sh.curve = curve;
      const g = c.createGain();
      g.gain.setValueAtTime(0.75, t);
      g.gain.setTargetAtTime(0.0001, t + 0.25, 0.35);
      o.connect(sh).connect(g).connect(out);
      o.start(t);
      o.stop(t + 1.6);
      break;
    }
    case "snare":
      osc("triangle", 220, 160, 0.05, 0.5, 0.12);
      nz(0.18, "bandpass", 1900, 0.8);
      break;
    case "clap":
      for (const d of [0, 0.011, 0.023]) nz(d === 0.023 ? 0.2 : 0.03, "bandpass", 1300, 0.9, t + d);
      break;
    case "hat":
      nz(0.05, "highpass", 8000, 0.5);
      break;
    case "open":
      nz(0.28, "highpass", 7500, 0.45);
      break;
    case "rim":
      osc("square", 1750, 1700, 0.01, 0.18, 0.04);
      nz(0.02, "bandpass", 3000, 0.3);
      break;
    case "perc":
      osc("sine", 420, 300, 0.12, 0.6, 0.18);
      break;
  }
}

export function BeatTool() {
  const KEY = "nexus:beat";
  const [p, setP] = useState<Pattern>(() => {
    try {
      return { ...PRESETS.Trap.p, ...(JSON.parse(localStorage.getItem(KEY) ?? "null")?.p ?? {}) };
    } catch {
      return PRESETS.Trap.p;
    }
  });
  const [bpm, setBpm] = useState(140);
  const [swing, setSwing] = useState(0);
  const [root, setRoot] = useState(0);
  const [mute, setMute] = useState<Partial<Record<Inst, boolean>>>({});
  const [playing, setPlaying] = useState(false);
  const [step, setStep] = useState(-1);
  const [busy, setBusy] = useState(false);
  const live = useRef({ p, bpm, swing, root, mute });
  live.current = { p, bpm, swing, root, mute };
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ p }));
    } catch {
      /* private mode */
    }
  }, [p]);

  useEffect(() => {
    if (!playing) return;
    const c = pctx();
    void c.resume();
    const bus = c.createDynamicsCompressor();
    bus.threshold.value = -10;
    bus.ratio.value = 3;
    bus.connect(c.destination);
    let next = c.currentTime + 0.06;
    let s = 0;
    const id = setInterval(() => {
      while (next < c.currentTime + 0.12) {
        const L = live.current;
        const sixteenth = 60 / L.bpm / 4;
        const t = next + (s % 2 ? L.swing * sixteenth : 0);
        for (const ins of INSTS) if (L.p[ins.id][s] && !L.mute[ins.id]) hit(c, bus, ins.id, t, L.root);
        const shown = s;
        setTimeout(() => setStep(shown), Math.max(0, (t - c.currentTime) * 1000));
        next += sixteenth;
        s = (s + 1) % 16;
      }
    }, 25);
    return () => {
      clearInterval(id);
      setTimeout(() => bus.disconnect(), 400);
      setStep(-1);
    };
  }, [playing]);

  const exportWav = async () => {
    setBusy(true);
    const bars = 4;
    const sixteenth = 60 / bpm / 4;
    const len = Math.ceil((bars * 16 * sixteenth + 1.5) * 44100);
    const c = new OfflineAudioContext(2, len, 44100);
    const bus = c.createDynamicsCompressor();
    bus.threshold.value = -10;
    bus.ratio.value = 3;
    bus.connect(c.destination);
    for (let b = 0; b < bars; b++)
      for (let s = 0; s < 16; s++) {
        const t = (b * 16 + s) * sixteenth + (s % 2 ? swing * sixteenth : 0);
        for (const ins of INSTS) if (p[ins.id][s] && !mute[ins.id]) hit(c, bus, ins.id, t, root);
      }
    const out = await c.startRendering();
    const loop = slice(out, 0, bars * 16 * sixteenth);
    limit(loop, -1);
    download(encodeWav(loop, 24), `nexus-beat-${bpm}bpm-${NOTES[root]}.wav`);
    setBusy(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setPlaying(!playing)} className={cn("flex items-center gap-2 rounded-full px-5 py-2.5 font-bold", playing ? "bg-dnd text-white" : "bg-accent text-white")}>
          {playing ? <Square className="size-4 fill-current" /> : <Play className="size-4 fill-current" />} {playing ? "Stop" : "Play"}
        </button>
        <select
          onChange={(e) => {
            const pr = PRESETS[e.target.value];
            if (!pr) return;
            setP(pr.p);
            setBpm(pr.bpm);
            setSwing(pr.swing);
            e.target.value = "";
          }}
          defaultValue=""
          className="rounded-full bg-hover px-3 py-2 text-sm font-semibold"
        >
          <option value="" disabled>
            Load a pattern…
          </option>
          {Object.keys(PRESETS).map((k) => (
            <option key={k}>{k}</option>
          ))}
        </select>
        <button disabled={busy} onClick={() => void exportWav()} className="ml-auto flex items-center gap-1.5 rounded-full bg-txt px-4 py-2 text-sm font-bold text-chat disabled:opacity-50">
          <Download className="size-4" /> {busy ? "Rendering…" : "Export 4 bars"}
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Knob label="Tempo" value={bpm} min={60} max={200} step={1} set={setBpm} fmt={(v) => `${v} BPM`} />
        <Knob label="Swing" value={swing} min={0} max={0.5} step={0.01} set={setSwing} fmt={(v) => `${Math.round(v * 100)}%`} />
        <Knob label="808 key" value={root} min={0} max={11} step={1} set={setRoot} fmt={(v) => NOTES[v]} />
      </div>
      <div className="overflow-x-auto rounded-2xl bg-black/30 p-2">
        <div className="min-w-[640px] space-y-1">
          {INSTS.map((ins) => (
            <div key={ins.id} className="flex items-center gap-1">
              <button onClick={() => setMute((m) => ({ ...m, [ins.id]: !m[ins.id] }))} className={cn("w-20 shrink-0 truncate rounded-lg px-2 py-2 text-left text-xs font-bold", mute[ins.id] ? "bg-white/5 text-faint line-through" : "bg-white/10")} title="Mute">
                {ins.name}
              </button>
              {p[ins.id].map((on, s) => (
                <button
                  key={s}
                  onClick={() => setP((cur) => ({ ...cur, [ins.id]: cur[ins.id].map((x, j) => (j === s ? !x : x)) }))}
                  onMouseDown={() => !on && hit(pctx(), pctx().destination, ins.id, pctx().currentTime, root)}
                  className={cn("h-9 flex-1 rounded-md transition", s % 4 === 0 && "ml-1", step === s && "ring-2 ring-white")}
                  style={{ background: on ? ins.color : s % 8 < 4 ? "rgba(255,255,255,.08)" : "rgba(255,255,255,.04)" }}
                  aria-label={`${ins.name} step ${s + 1}`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <p className="text-xs text-sub">Tap squares to program a 16-step pattern. Your pattern is saved on this device. Export renders 4 bars as a 24-bit WAV loop.</p>
    </div>
  );
}

// ------------------------------------------------------------------ scales & chords
const SCALES: Record<string, number[]> = {
  Major: [0, 2, 4, 5, 7, 9, 11],
  Minor: [0, 2, 3, 5, 7, 8, 10],
  "Harmonic minor": [0, 2, 3, 5, 7, 8, 11],
  Dorian: [0, 2, 3, 5, 7, 9, 10],
  Phrygian: [0, 1, 3, 5, 7, 8, 10],
  Lydian: [0, 2, 4, 6, 7, 9, 11],
  Mixolydian: [0, 2, 4, 5, 7, 9, 10],
  "Pentatonic major": [0, 2, 4, 7, 9],
  "Pentatonic minor": [0, 3, 5, 7, 10],
  Blues: [0, 3, 5, 6, 7, 10],
};
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"];
const PROGS: Record<string, { name: string; deg: number[] }[]> = {
  major: [
    { name: "Pop (I–V–vi–IV)", deg: [0, 4, 5, 3] },
    { name: "Doo-wop (I–vi–IV–V)", deg: [0, 5, 3, 4] },
    { name: "Jazz (ii–V–I)", deg: [1, 4, 0, 0] },
  ],
  minor: [
    { name: "Trap (i–VI–III–VII)", deg: [0, 5, 2, 6] },
    { name: "Sad (i–iv–VI–V)", deg: [0, 3, 5, 4] },
    { name: "Epic (i–VII–VI–VII)", deg: [0, 6, 5, 6] },
  ],
};
function pluck(midi: number, at = 0, dur = 0.9, vol = 0.18) {
  const c = pctx();
  void c.resume();
  const t = c.currentTime + at;
  const f = 440 * Math.pow(2, (midi - 69) / 12);
  for (const [type, mul, v] of [
    ["triangle", 1, 1],
    ["sine", 2, 0.25],
  ] as const) {
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = f * mul;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol * v, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
}
export function ScaleTool() {
  const [key, setKey] = useState(9); // A
  const [scale, setScale] = useState("Minor");
  const steps = SCALES[scale];
  const inScale = useMemo(() => new Set(steps.map((s) => (s + key) % 12)), [steps, key]);
  const seven = steps.length === 7;
  const chords = seven
    ? steps.map((_, i) => {
        const notes = [0, 2, 4, 6].map((k) => {
          const idx = i + k;
          return key + steps[idx % 7] + 12 * Math.floor(idx / 7);
        });
        const third = notes[1] - notes[0],
          fifth = notes[2] - notes[0],
          sev = notes[3] - notes[0];
        const q = third === 4 && fifth === 7 ? "" : third === 3 && fifth === 7 ? "m" : third === 3 && fifth === 6 ? "dim" : "aug";
        const s7 = q === "" ? (sev === 11 ? "maj7" : "7") : q === "m" ? (sev === 10 ? "m7" : "m(maj7)") : q === "dim" ? (sev === 10 ? "m7♭5" : "dim7") : "+7";
        const roman = q === "" || q === "aug" ? ROMAN[i] : ROMAN[i].toLowerCase();
        return { roman: roman + (q === "dim" ? "°" : q === "aug" ? "+" : ""), name: NOTES[(key + steps[i]) % 12] + q, name7: NOTES[(key + steps[i]) % 12] + s7, notes };
      })
    : [];
  const playChord = (notes: number[], at = 0) => notes.slice(0, 3).forEach((n, i) => pluck(48 + n, at + i * 0.012, 1.4, 0.12));
  const progs = scale === "Major" || scale === "Lydian" || scale === "Mixolydian" ? PROGS.major : PROGS.minor;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {NOTES.map((n, i) => (
          <button key={n} onClick={() => setKey(i)} className={cn("min-w-10 rounded-lg px-2 py-1.5 text-sm font-bold", key === i ? "bg-accent text-white" : "bg-hover")}>
            {n}
          </button>
        ))}
      </div>
      <Seg value={scale} set={setScale} options={Object.keys(SCALES).map((s) => [s, s] as [string, string])} />
      <div className="rounded-2xl bg-side p-3">
        <div className="text-sm font-semibold">
          {NOTES[key]} {scale}: <span className="text-accent">{steps.map((s) => NOTES[(key + s) % 12]).join(" · ")}</span>
        </div>
        {/* two-octave keyboard */}
        <div className="relative mt-3 h-32 select-none">
          <div className="flex h-full">
            {Array.from({ length: 24 }, (_, i) => i)
              .filter((i) => ![1, 3, 6, 8, 10].includes(i % 12))
              .map((i) => (
                <button key={i} onMouseDown={() => pluck(60 + i)} className={cn("relative flex-1 rounded-b-lg border border-black/40", inScale.has(i % 12) ? (i % 12 === key ? "bg-accent" : "bg-[#c9b8ff]") : "bg-white")}>
                  <span className="absolute inset-x-0 bottom-1 text-center text-[10px] font-bold text-black/60">{NOTES[i % 12]}</span>
                </button>
              ))}
          </div>
          {Array.from({ length: 24 }, (_, i) => i)
            .filter((i) => [1, 3, 6, 8, 10].includes(i % 12))
            .map((i) => {
              const whitesBefore = Array.from({ length: i }, (_, k) => k).filter((k) => ![1, 3, 6, 8, 10].includes(k % 12)).length;
              return (
                <button
                  key={i}
                  onMouseDown={() => pluck(60 + i)}
                  className={cn("absolute top-0 h-[60%] w-[4.2%] -translate-x-1/2 rounded-b-md", inScale.has(i % 12) ? (i % 12 === key ? "bg-accent" : "bg-[#6b4bd6]") : "bg-[#111]")}
                  style={{ left: `${(whitesBefore / 14) * 100}%` }}
                  aria-label={NOTES[i % 12]}
                />
              );
            })}
        </div>
      </div>
      {seven && (
        <>
          <div>
            <div className="mb-1.5 text-xs font-bold tracking-wide text-sub uppercase">Chords in this key — tap to hear</div>
            <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7">
              {chords.map((ch) => (
                <button key={ch.roman} onClick={() => playChord(ch.notes)} className="rounded-xl bg-hover px-2 py-2 text-center hover:bg-active">
                  <div className="text-xs text-sub">{ch.roman}</div>
                  <div className="font-black">{ch.name}</div>
                  <div className="text-[11px] text-sub">{ch.name7}</div>
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1.5 text-xs font-bold tracking-wide text-sub uppercase">Progressions</div>
            <div className="flex flex-wrap gap-1.5">
              {progs.map((pr) => (
                <button key={pr.name} onClick={() => pr.deg.forEach((d, i) => playChord(chords[d].notes, i * 0.75))} className="flex items-center gap-1.5 rounded-full bg-hover px-3 py-1.5 text-sm font-semibold hover:bg-active">
                  <Play className="size-3 fill-current" /> {pr.name}: {pr.deg.map((d) => chords[d].name).join(" – ")}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

