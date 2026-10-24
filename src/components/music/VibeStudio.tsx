"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Pause, Play, Repeat, RotateCcw, Upload } from "lucide-react";
import { toast } from "@/store/app";
import { decodeFile, decodeLimit, fmtTime } from "@/lib/audio";
import { baseName, download, encodeWav, gain, impulse, peak, toStereo } from "@/lib/dsp";
import { cn } from "@/lib/utils";

// Slowed / sped up — a live effects rack. Everything you move is heard instantly; export renders the same chain offline.

export type Fx = {
  speed: number; // 0.5..1.5 (tape style: pitch follows)
  reverb: number; // wet 0..1
  size: number; // seconds 0.5..8
  bass: number; // dB 0..12
  tone: number; // lowpass Hz 800..20000
  echo: number; // mix 0..1
  echoTime: number; // s
  echoFb: number; // 0..0.85
  pan8d: number; // Hz 0..0.6
  panDepth: number; // 0..1
  lofi: number; // 0..1 (bit crush)
  crackle: number; // 0..1
  volume: number; // 0..1.5
};
const BASE: Fx = { speed: 1, reverb: 0, size: 2.5, bass: 0, tone: 20000, echo: 0, echoTime: 0.32, echoFb: 0.35, pan8d: 0, panDepth: 0.9, lofi: 0, crackle: 0, volume: 1 };
const PRESETS: { name: string; fx: Partial<Fx> }[] = [
  { name: "Original", fx: {} },
  { name: "Slowed + reverb", fx: { speed: 0.82, reverb: 0.5, size: 3.4, bass: 3, tone: 9500 } },
  { name: "Lo-fi", fx: { speed: 0.9, reverb: 0.25, size: 2, bass: 2, tone: 3800, lofi: 0.45, crackle: 0.45 } },
  { name: "Sped up", fx: { speed: 1.22 } },
  { name: "Nightcore", fx: { speed: 1.3, reverb: 0.12, size: 1.2, bass: 1 } },
  { name: "8D audio", fx: { pan8d: 0.12, panDepth: 1, reverb: 0.3, size: 2.5 } },
  { name: "Underwater", fx: { speed: 0.9, tone: 900, reverb: 0.35, size: 3, bass: 4 } },
  { name: "Dreamy echo", fx: { speed: 0.88, echo: 0.4, echoTime: 0.42, echoFb: 0.5, reverb: 0.45, size: 5 } },
  { name: "Bass boosted", fx: { bass: 10, volume: 0.85 } },
  { name: "Vinyl", fx: { tone: 7000, crackle: 0.6, lofi: 0.15 } },
];

// ------------------------------------------------------------------ the effect chain (shared by live + export)
function crushCurve(amount: number) {
  const n = 4096;
  const c = new Float32Array(n);
  const steps = amount <= 0.001 ? 0 : Math.pow(2, 16 - amount * 12.5); // 16 → ~3.5 bits
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = steps ? Math.round(x * steps) / steps : x;
  }
  return c;
}
function crackleBuffer(ctx: BaseAudioContext) {
  const len = ctx.sampleRate * 4;
  const b = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * 0.012; // hiss
    for (let k = 0; k < 90; k++) {
      // pops
      const at = Math.floor(Math.random() * (len - 200));
      const amp = 0.15 + Math.random() * 0.5;
      for (let j = 0; j < 40; j++) d[at + j] += (Math.random() * 2 - 1) * amp * (1 - j / 40);
    }
  }
  return b;
}

type Chain = { input: AudioNode; output: GainNode; analyser: AnalyserNode; set: (fx: Fx, now?: boolean) => void; start: (t: number) => void; stop: () => void };
function buildChain(ctx: BaseAudioContext, fx: Fx): Chain {
  const t = () => ctx.currentTime;
  const bass = ctx.createBiquadFilter();
  bass.type = "lowshelf";
  bass.frequency.value = 110;
  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.Q.value = 0.5;
  const crush = ctx.createWaveShaper();
  crush.oversample = "none";
  bass.connect(tone).connect(crush);

  const pan = ctx.createStereoPanner();
  const dry = ctx.createGain();
  crush.connect(dry).connect(pan);

  const pre = ctx.createDelay(0.2);
  pre.delayTime.value = 0.03;
  const conv = ctx.createConvolver();
  const wet = ctx.createGain();
  crush.connect(pre).connect(conv).connect(wet).connect(pan);

  const delay = ctx.createDelay(1.5);
  const fb = ctx.createGain();
  const echoOut = ctx.createGain();
  const echoTone = ctx.createBiquadFilter();
  echoTone.type = "lowpass";
  echoTone.frequency.value = 4500;
  crush.connect(delay);
  delay.connect(echoTone).connect(fb).connect(delay);
  echoTone.connect(echoOut).connect(pan);

  const lfo = ctx.createOscillator();
  const lfoAmt = ctx.createGain();
  lfo.connect(lfoAmt).connect(pan.pan);

  const master = ctx.createGain();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  pan.connect(master);
  master.connect(analyser);

  const crackle = ctx.createBufferSource();
  crackle.buffer = crackleBuffer(ctx);
  crackle.loop = true;
  const crackleGain = ctx.createGain();
  crackle.connect(crackleGain).connect(master);

  let size = -1;
  let lofi = -1;
  const set = (f: Fx, now = false) => {
    const k = now ? 0 : 0.04;
    const ramp = (p: AudioParam, v: number) => (now ? p.setValueAtTime(v, t()) : p.setTargetAtTime(v, t(), k));
    ramp(bass.gain, f.bass);
    ramp(tone.frequency, f.tone);
    ramp(dry.gain, 1 - Math.min(0.6, f.reverb * 0.5) - f.echo * 0.25);
    ramp(wet.gain, f.reverb * 1.1);
    ramp(delay.delayTime, f.echoTime);
    ramp(fb.gain, f.echoFb);
    ramp(echoOut.gain, f.echo);
    ramp(lfo.frequency, Math.max(0.001, f.pan8d));
    ramp(lfoAmt.gain, f.pan8d > 0 ? f.panDepth : 0);
    ramp(crackleGain.gain, f.crackle * 0.9);
    ramp(master.gain, f.volume);
    if (Math.abs(f.size - size) > 0.05) {
      size = f.size;
      conv.buffer = impulse(ctx, f.size, 2.4);
    }
    if (Math.abs(f.lofi - lofi) > 0.005) {
      lofi = f.lofi;
      crush.curve = crushCurve(f.lofi);
    }
  };
  set(fx, true);
  return {
    input: bass,
    output: master,
    analyser,
    set,
    start: (at) => {
      lfo.start(at);
      crackle.start(at);
    },
    stop: () => {
      try {
        lfo.stop();
        crackle.stop();
      } catch {
        /* not started */
      }
    },
  };
}

async function renderOffline(buf: AudioBuffer, fx: Fx) {
  const src0 = toStereo(buf);
  const tail = Math.max(fx.reverb > 0 ? fx.size : 0, fx.echo > 0 ? fx.echoTime * 8 : 0) + 0.3;
  const len = Math.ceil((src0.duration / fx.speed + tail) * src0.sampleRate);
  const ctx = new OfflineAudioContext(2, len, src0.sampleRate);
  const chain = buildChain(ctx, fx);
  chain.output.connect(ctx.destination);
  const src = ctx.createBufferSource();
  src.buffer = src0;
  src.playbackRate.value = fx.speed;
  src.connect(chain.input);
  chain.start(0);
  src.start(0);
  const out = await ctx.startRendering();
  const p = peak(out);
  if (p > 0.98) gain(out, 0.98 / p);
  return out;
}

// ------------------------------------------------------------------ UI
export default function VibeStudio() {
  const [src, setSrc] = useState<{ buf: AudioBuffer; file: File } | null>(null);
  const [fx, setFx] = useState<Fx>(BASE);
  const [preset, setPreset] = useState("Original");
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(true);
  const [pos, setPos] = useState(0);
  const [busy, setBusy] = useState(false);
  const ctxRef = useRef<AudioContext | null>(null);
  const chainRef = useRef<Chain | null>(null);
  const node = useRef<AudioBufferSourceNode | null>(null);
  const clock = useRef({ ctxT: 0, pos: 0, rate: 1 }); // position anchor for a changing playback rate
  const fxRef = useRef(fx);
  fxRef.current = fx;
  const spectrum = useRef<HTMLCanvasElement>(null);

  const ctx = () => {
    if (!ctxRef.current) {
      const c = new AudioContext({ latencyHint: "interactive" });
      const ch = buildChain(c, fxRef.current);
      ch.output.connect(c.destination);
      ch.start(c.currentTime);
      ctxRef.current = c;
      chainRef.current = ch;
    }
    return ctxRef.current;
  };
  const now = () => {
    const c = ctxRef.current;
    if (!c || !node.current) return clock.current.pos;
    return clock.current.pos + (c.currentTime - clock.current.ctxT) * clock.current.rate;
  };

  const stopSrc = () => {
    if (!node.current) return;
    node.current.onended = null;
    try {
      node.current.stop();
    } catch {
      /* ended */
    }
    node.current = null;
  };
  const playFrom = useCallback(
    (at: number) => {
      if (!src) return;
      const c = ctx();
      void c.resume();
      stopSrc();
      const s = c.createBufferSource();
      s.buffer = src.buf;
      s.playbackRate.value = fxRef.current.speed;
      s.loop = loop;
      s.connect(chainRef.current!.input);
      const off = Math.max(0, Math.min(src.buf.duration - 0.01, at));
      s.start(0, off);
      s.onended = () => {
        if (node.current === s) {
          node.current = null;
          setPlaying(false);
          clock.current.pos = 0;
          setPos(0);
        }
      };
      node.current = s;
      clock.current = { ctxT: c.currentTime, pos: off, rate: fxRef.current.speed };
      setPlaying(true);
    },
    [src, loop],
  );
  const pause = () => {
    const d = src?.buf.duration ?? 1;
    clock.current.pos = loop ? now() % d : Math.min(now(), d);
    stopSrc();
    setPlaying(false);
  };

  // live parameter changes
  useEffect(() => {
    chainRef.current?.set(fx);
    const c = ctxRef.current;
    if (c && node.current) {
      clock.current = { ctxT: c.currentTime, pos: now(), rate: fx.speed };
      node.current.playbackRate.setValueAtTime(fx.speed, c.currentTime);
    }
  }, [fx]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (node.current) node.current.loop = loop;
  }, [loop]);

  // playhead + spectrum
  useEffect(() => {
    if (!playing || !src) return;
    let raf = 0;
    const data = new Uint8Array(256);
    const draw = () => {
      let p = now();
      if (loop) p %= src.buf.duration;
      setPos(p);
      const cv = spectrum.current;
      const an = chainRef.current?.analyser;
      if (cv && an) {
        const g = cv.getContext("2d")!;
        const W = (cv.width = cv.clientWidth),
          H = (cv.height = cv.clientHeight);
        an.getByteFrequencyData(data);
        const n = 64;
        for (let i = 0; i < n; i++) {
          const v = data[Math.floor(Math.pow(i / n, 1.5) * 200)] / 255;
          const h = v * H;
          g.fillStyle = `hsl(${280 - i * 2.5} 90% ${50 + v * 15}%)`;
          g.fillRect((i * W) / n + 1, H - h, W / n - 2, h);
        }
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [playing, src, loop]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(
    () => () => {
      stopSrc();
      chainRef.current?.stop();
      void ctxRef.current?.close();
    },
    [],
  );
  // space = play/pause
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.code !== "Space" || (e.target as HTMLElement).closest("input,textarea,select")) return;
      e.preventDefault();
      if (node.current) pause();
      else playFrom(clock.current.pos);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (patch: Partial<Fx>) => {
    setFx((f) => ({ ...f, ...patch }));
    setPreset("Custom");
  };
  const exportWav = async () => {
    if (!src) return;
    setBusy(true);
    try {
      const out = await renderOffline(src.buf, fx);
      download(encodeWav(out, 24), `${baseName(src.file)} (${preset === "Original" ? "edit" : preset.toLowerCase()}).wav`);
    } catch (e) {
      toast((e as Error).message, "error");
    }
    setBusy(false);
  };

  if (!src) return <Pick onLoad={(buf, file) => setSrc({ buf, file })} />;
  const semis = Math.round(12 * Math.log2(fx.speed) * 10) / 10;
  const outLen = src.buf.duration / fx.speed;

  return (
    <div className="space-y-4">
      {/* transport */}
      <div className="rounded-2xl bg-side p-3">
        <div className="flex items-center gap-3">
          <button onClick={() => (playing ? pause() : playFrom(clock.current.pos))} className="grid size-14 shrink-0 place-items-center rounded-full bg-accent text-white shadow-lg active:scale-95" aria-label={playing ? "Pause" : "Play"}>
            {playing ? <Pause className="size-6 fill-current" /> : <Play className="ml-0.5 size-6 fill-current" />}
          </button>
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{src.file.name}</div>
            <div className="text-xs text-sub tabular-nums">
              {fmtTime(pos / fx.speed)} / {fmtTime(outLen)} · {Math.round(fx.speed * 100)}% speed · {semis > 0 ? "+" : ""}
              {semis} st
            </div>
          </div>
          <button onClick={() => setLoop(!loop)} className={cn("grid size-10 place-items-center rounded-full", loop ? "bg-accent/20 text-accent" : "bg-hover text-sub")} title="Loop" aria-label="Loop">
            <Repeat className="size-5" />
          </button>
        </div>
        <Wave buf={src.buf} pos={pos} onSeek={(t) => (playing ? playFrom(t) : ((clock.current.pos = t), setPos(t)))} />
        <canvas ref={spectrum} className="mt-2 h-16 w-full rounded-lg bg-black/30" />
      </div>

      {/* presets */}
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p.name}
            onClick={() => {
              setFx({ ...BASE, ...p.fx, volume: fx.volume });
              setPreset(p.name);
            }}
            className={cn("rounded-full px-3 py-1.5 text-sm font-semibold", preset === p.name ? "bg-accent text-white" : "bg-hover hover:bg-active")}
          >
            {p.name}
          </button>
        ))}
      </div>

      {/* rack */}
      <div className="grid gap-3 md:grid-cols-2">
        <Panel title="Speed & pitch">
          <Knob label="Speed" value={fx.speed} min={0.5} max={1.5} step={0.01} set={(speed) => set({ speed })} fmt={(v) => `${Math.round(v * 100)}%`} />
          <div className="flex flex-wrap gap-1">
            {[0.75, 0.8, 0.85, 0.9, 1, 1.1, 1.2, 1.25, 1.3].map((v) => (
              <button key={v} onClick={() => set({ speed: v })} className={cn("rounded-md px-2 py-0.5 text-xs font-semibold", Math.abs(fx.speed - v) < 0.005 ? "bg-accent text-white" : "bg-hover")}>
                {Math.round(v * 100)}%
              </button>
            ))}
          </div>
        </Panel>
        <Panel title="Reverb">
          <Knob label="Amount" value={fx.reverb} min={0} max={1} step={0.01} set={(reverb) => set({ reverb })} fmt={pct} />
          <Knob label="Room size" value={fx.size} min={0.5} max={8} step={0.1} set={(size) => set({ size })} fmt={(v) => `${v.toFixed(1)} s`} />
        </Panel>
        <Panel title="Echo">
          <Knob label="Amount" value={fx.echo} min={0} max={1} step={0.01} set={(echo) => set({ echo })} fmt={pct} />
          <Knob label="Time" value={fx.echoTime} min={0.05} max={1} step={0.01} set={(echoTime) => set({ echoTime })} fmt={(v) => `${Math.round(v * 1000)} ms`} />
          <Knob label="Feedback" value={fx.echoFb} min={0} max={0.85} step={0.01} set={(echoFb) => set({ echoFb })} fmt={pct} />
        </Panel>
        <Panel title="Tone">
          <Knob label="Bass boost" value={fx.bass} min={0} max={12} step={0.5} set={(bass) => set({ bass })} fmt={(v) => `+${v} dB`} />
          <Knob label="Muffle (low-pass)" value={20000 - fx.tone} min={0} max={19200} step={100} set={(v) => set({ tone: 20000 - v })} fmt={() => (fx.tone >= 19900 ? "off" : `${Math.round(fx.tone)} Hz`)} />
        </Panel>
        <Panel title="8D audio">
          <Knob label="Rotation speed" value={fx.pan8d} min={0} max={0.6} step={0.01} set={(pan8d) => set({ pan8d })} fmt={(v) => (v ? `${v.toFixed(2)} Hz` : "off")} />
          <Knob label="Width" value={fx.panDepth} min={0} max={1} step={0.01} set={(panDepth) => set({ panDepth })} fmt={pct} />
          <p className="text-[11px] text-sub">Best with headphones 🎧</p>
        </Panel>
        <Panel title="Lo-fi & vinyl">
          <Knob label="Bit crush" value={fx.lofi} min={0} max={1} step={0.01} set={(lofi) => set({ lofi })} fmt={pct} />
          <Knob label="Vinyl crackle" value={fx.crackle} min={0} max={1} step={0.01} set={(crackle) => set({ crackle })} fmt={pct} />
        </Panel>
      </div>
      <Panel title="Output">
        <Knob label="Volume" value={fx.volume} min={0} max={1.5} step={0.01} set={(volume) => setFx((f) => ({ ...f, volume }))} fmt={pct} />
      </Panel>

      <div className="flex flex-wrap gap-2">
        <button disabled={busy} onClick={() => void exportWav()} className="flex flex-1 items-center justify-center gap-2 rounded-full bg-txt py-3 font-bold text-chat disabled:opacity-50">
          <Download className="size-4" /> {busy ? "Rendering…" : `Export WAV (${fmtTime(outLen)})`}
        </button>
        <button onClick={() => (setFx(BASE), setPreset("Original"))} className="flex items-center gap-1.5 rounded-full bg-hover px-4 font-semibold" title="Reset all effects">
          <RotateCcw className="size-4" /> Reset
        </button>
        <button
          onClick={() => {
            pause();
            setSrc(null);
            clock.current.pos = 0;
            setPos(0);
          }}
          className="rounded-full bg-hover px-4 font-semibold"
        >
          New song
        </button>
      </div>
      <p className="text-xs text-sub">Speed changes pitch like a turntable (that&apos;s the classic slowed/nightcore sound). Space = play/pause · click the waveform to jump. Everything runs on your device.</p>
    </div>
  );
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2.5 rounded-2xl bg-side p-3">
      <div className="text-xs font-bold tracking-wide text-sub uppercase">{title}</div>
      {children}
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

function Wave({ buf, pos, onSeek }: { buf: AudioBuffer; pos: number; onSeek: (t: number) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const bars = useRef<Float32Array | null>(null);
  useEffect(() => {
    const d = buf.getChannelData(0);
    const n = 600;
    const out = new Float32Array(n);
    const per = Math.floor(d.length / n);
    for (let i = 0; i < n; i++) {
      let m = 0;
      for (let j = i * per; j < (i + 1) * per; j += 8) m = Math.max(m, Math.abs(d[j]));
      out[i] = m;
    }
    bars.current = out;
  }, [buf]);
  useEffect(() => {
    const cv = ref.current;
    const b = bars.current;
    if (!cv || !b) return;
    const W = (cv.width = cv.clientWidth * 2),
      H = (cv.height = 128);
    const g = cv.getContext("2d")!;
    const x0 = (pos / buf.duration) * W;
    for (let i = 0; i < b.length; i++) {
      const x = (i / b.length) * W;
      const h = Math.max(2, b[i] * H * 0.95);
      g.fillStyle = x < x0 ? "#8b5cff" : "rgba(255,255,255,.22)";
      g.fillRect(x, (H - h) / 2, W / b.length - 1, h);
    }
    g.fillStyle = "#fff";
    g.fillRect(x0, 0, 3, H);
  }, [buf, pos]);
  return (
    <canvas
      ref={ref}
      className="mt-3 h-16 w-full cursor-pointer rounded-lg"
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        onSeek(((e.clientX - r.left) / r.width) * buf.duration);
      }}
    />
  );
}

function Pick({ onLoad }: { onLoad: (buf: AudioBuffer, file: File) => void }) {
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
      className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-line px-4 py-10 text-sub hover:border-accent hover:text-txt"
    >
      <input ref={input} type="file" accept="audio/*,video/*,.wav,.mp3,.m4a,.flac,.aac,.ogg" hidden onChange={(e) => (void take(e.target.files?.[0]), (e.target.value = ""))} />
      <Upload className="size-8" />
      <span className="font-semibold">{busy ? "Reading…" : "Drop a song to remix live"}</span>
      <span className="text-xs">Slowed + reverb, sped up, nightcore, 8D, lo-fi, echo — hear every change instantly.</span>
    </button>
  );
}
