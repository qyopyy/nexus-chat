/**
 * Nexus Synth Pack — original instrumentals generated on the device (no copyrighted audio shipped),
 * then auto-charted. Each preset is deterministic, so leaderboards per preset stay comparable.
 */
import { analyze, buildChart, type Difficulty } from "./autochart";

export type SynthPreset = { id: string; title: string; bpm: number; bars: number; scale: number[]; root: number; style: "trap" | "house" | "dnb" | "synthwave" | "phonk" | "hyper"; color: string; seed: number };

export const SYNTH_PRESETS: SynthPreset[] = [
  { id: "syn-neon-run", title: "Neon Run", bpm: 128, bars: 48, scale: [0, 2, 3, 5, 7, 8, 10], root: 45, style: "synthwave", color: "#ff2bd6", seed: 11 },
  { id: "syn-static-bloom", title: "Static Bloom", bpm: 140, bars: 48, scale: [0, 3, 5, 6, 7, 10], root: 41, style: "trap", color: "#aa00ff", seed: 23 },
  { id: "syn-midnight-haze", title: "Midnight Haze", bpm: 132, bars: 48, scale: [0, 2, 3, 5, 7, 9, 10], root: 43, style: "phonk", color: "#e10600", seed: 37 },
  { id: "syn-glass-city", title: "Glass City", bpm: 124, bars: 48, scale: [0, 2, 4, 5, 7, 9, 11], root: 48, style: "house", color: "#00d6ff", seed: 51 },
  { id: "syn-overclock", title: "Overclock", bpm: 174, bars: 56, scale: [0, 2, 3, 5, 7, 8, 10], root: 40, style: "dnb", color: "#12fa05", seed: 67 },
  { id: "syn-sugar-rush", title: "Sugar Rush", bpm: 160, bars: 48, scale: [0, 2, 4, 7, 9], root: 52, style: "hyper", color: "#ffd400", seed: 83 },
];

/* tiny deterministic PRNG */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 1_000_000) / 1_000_000;
  };
}
const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);

function kick(ctx: OfflineAudioContext, t: number, out: AudioNode, hard: boolean) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.frequency.setValueAtTime(hard ? 160 : 120, t);
  o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
  g.gain.setValueAtTime(hard ? 1 : 0.85, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + (hard ? 0.4 : 0.28));
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + 0.45);
}
function noiseBuf(ctx: OfflineAudioContext, len: number, r: () => number) {
  const b = ctx.createBuffer(1, Math.ceil(len * ctx.sampleRate), ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1;
  return b;
}
function snare(ctx: OfflineAudioContext, t: number, out: AudioNode, nb: AudioBuffer, clap: boolean) {
  const s = ctx.createBufferSource();
  s.buffer = nb;
  const f = ctx.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = clap ? 1800 : 2600;
  f.Q.value = 0.8;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.7, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
  s.connect(f).connect(g).connect(out);
  s.start(t);
  s.stop(t + 0.2);
  if (!clap) {
    const o = ctx.createOscillator();
    const og = ctx.createGain();
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(140, t + 0.08);
    og.gain.setValueAtTime(0.4, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    o.connect(og).connect(out);
    o.start(t);
    o.stop(t + 0.12);
  }
}
function hat(ctx: OfflineAudioContext, t: number, out: AudioNode, nb: AudioBuffer, open: boolean, vol: number) {
  const s = ctx.createBufferSource();
  s.buffer = nb;
  const f = ctx.createBiquadFilter();
  f.type = "highpass";
  f.frequency.value = 7000;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + (open ? 0.22 : 0.05));
  s.connect(f).connect(g).connect(out);
  s.start(t);
  s.stop(t + 0.25);
}
function tone(ctx: OfflineAudioContext, t: number, dur: number, freq: number, out: AudioNode, type: OscillatorType, vol: number, detune = 0, glide?: number) {
  const o = ctx.createOscillator();
  o.type = type;
  o.detune.value = detune;
  o.frequency.setValueAtTime(glide ?? freq, t);
  if (glide) o.frequency.exponentialRampToValueAtTime(freq, t + Math.min(0.08, dur / 2));
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.setValueAtTime(vol, t + Math.max(0.02, dur - 0.04));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + dur + 0.02);
}

/** Render one preset to an AudioBuffer (mono, 32 kHz keeps memory small). */
export async function renderSynth(p: SynthPreset, onProgress?: (x: number) => void): Promise<AudioBuffer> {
  const sr = 32000;
  const beat = 60 / p.bpm;
  const total = p.bars * 4 * beat + 2;
  const ctx = new OfflineAudioContext(1, Math.ceil(total * sr), sr);
  const r = rng(p.seed);
  const nb = noiseBuf(ctx, 0.3, r);

  const master = ctx.createDynamicsCompressor();
  master.threshold.value = -14;
  master.ratio.value = 6;
  master.connect(ctx.destination);
  const drums = ctx.createGain();
  drums.gain.value = 0.9;
  drums.connect(master);
  const music = ctx.createGain();
  music.gain.value = 0.55;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 5200;
  music.connect(lp).connect(master);
  const delay = ctx.createDelay(1);
  delay.delayTime.value = beat * 0.75;
  const fb = ctx.createGain();
  fb.gain.value = 0.28;
  delay.connect(fb).connect(delay);
  const wet = ctx.createGain();
  wet.gain.value = 0.22;
  delay.connect(wet).connect(master);

  // chord progression (4 bars loop) in the scale
  const degrees = [0, 5, 3, 4].map((d) => d % p.scale.length);
  const sw = p.style;
  const lead: OscillatorType = sw === "synthwave" ? "sawtooth" : sw === "hyper" ? "square" : sw === "house" ? "triangle" : "sawtooth";
  const bassType: OscillatorType = sw === "trap" || sw === "phonk" ? "sine" : sw === "dnb" ? "sawtooth" : "square";
  // a repeating 2-bar melody motif, varied every 8 bars
  const motif = Array.from({ length: 16 }, () => (r() < 0.72 ? Math.floor(r() * p.scale.length) + (r() < 0.3 ? p.scale.length : 0) : -1));

  for (let bar = 0; bar < p.bars; bar++) {
    const t0 = 1 + bar * 4 * beat;
    const section = Math.floor(bar / 8);
    const intro = bar < 4;
    const breakdown = bar >= 24 && bar < 28;
    const deg = degrees[bar % 4];
    const rootNote = p.root + p.scale[deg];
    // drums
    for (let s = 0; s < 16; s++) {
      const t = t0 + (s * beat) / 4;
      const on4 = s % 4 === 0;
      if (!breakdown) {
        if (sw === "house" || sw === "synthwave" || sw === "hyper") {
          if (on4) kick(ctx, t, drums, false);
          if (s === 4 || s === 12) snare(ctx, t, drums, nb, sw === "house");
          if (s % 2 === 1) hat(ctx, t, drums, nb, s % 4 === 2, 0.25);
        } else if (sw === "dnb") {
          if (s === 0 || s === 10) kick(ctx, t, drums, true);
          if (s === 4 || s === 12) snare(ctx, t, drums, nb, false);
          if (s % 2 === 0) hat(ctx, t, drums, nb, false, 0.2);
        } else {
          // trap / phonk
          if (s === 0 || s === 7 || (s === 10 && r() < 0.5)) kick(ctx, t, drums, true);
          if (s === 8) snare(ctx, t, drums, nb, sw === "phonk");
          const roll = s >= 12 && r() < 0.5;
          if (roll || s % 2 === 0) hat(ctx, t, drums, nb, false, roll ? 0.18 : 0.28);
          if (roll) hat(ctx, t + beat / 8, drums, nb, false, 0.15);
        }
      } else if (on4) hat(ctx, t, drums, nb, true, 0.15);
    }
    // bass
    if (!intro || sw === "dnb") {
      const pat = sw === "house" ? [0, 2, 4, 6, 8, 10, 12, 14] : sw === "trap" || sw === "phonk" ? [0, 7, 10] : [0, 3, 6, 8, 11, 14];
      for (const s of pat) {
        const oct = s % 6 === 3 ? 12 : 0;
        tone(ctx, t0 + (s * beat) / 4, beat * (sw === "trap" ? 1.2 : 0.4), midi(rootNote - 12 + oct), music, bassType, sw === "trap" || sw === "phonk" ? 0.9 : 0.5, 0, sw === "trap" ? midi(rootNote - 24) : undefined);
      }
    }
    // chords / pad
    if (!breakdown && (sw === "synthwave" || sw === "house" || sw === "hyper" || section % 2 === 1)) {
      const chord = [0, 2, 4].map((k) => p.scale[(deg + k) % p.scale.length] + (deg + k >= p.scale.length ? 12 : 0));
      const stabs = sw === "house" ? [2, 6, 10, 14] : sw === "hyper" ? [0, 3, 6, 8, 11, 14] : [0];
      for (const s of stabs) for (const n of chord) tone(ctx, t0 + (s * beat) / 4, sw === "synthwave" ? beat * 4 : beat * 0.3, midi(p.root + 12 + n), music, "sawtooth", 0.16, n * 3 - 6);
    }
    // lead
    if (!intro) {
      const varia = section % 2;
      for (let s = 0; s < 16; s++) {
        const m = motif[(s + (bar % 2) * 8 + varia * 3) % 16];
        if (m < 0 || (sw === "trap" && s % 2 === 1 && r() < 0.5)) continue;
        const note = p.root + 24 + p.scale[m % p.scale.length] + (m >= p.scale.length ? 12 : 0);
        const dur = beat * (sw === "hyper" ? 0.22 : 0.45);
        const g = ctx.createGain();
        g.gain.value = 1;
        g.connect(music);
        g.connect(delay);
        tone(ctx, t0 + (s * beat) / 4, dur, midi(note), g, lead, sw === "hyper" ? 0.22 : 0.3, sw === "synthwave" ? 8 : 0);
      }
    }
    // riser into drops
    if (bar % 8 === 7 && !intro) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(200, t0);
      o.frequency.exponentialRampToValueAtTime(1600, t0 + 4 * beat);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.12, t0 + 4 * beat);
      o.connect(g).connect(master);
      o.start(t0);
      o.stop(t0 + 4 * beat);
    }
    onProgress?.((bar / p.bars) * 0.5);
  }
  return ctx.startRendering();
}

/** 16-bit PCM WAV so the game can fetch() it like any other Inst file. */
export function toWav(buf: AudioBuffer): Blob {
  const ch = Math.min(2, buf.numberOfChannels);
  const n = buf.length;
  const out = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const w = (o: number, s: string) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF");
  out.setUint32(4, 36 + n * ch * 2, true);
  w(8, "WAVE");
  w(12, "fmt ");
  out.setUint32(16, 16, true);
  out.setUint16(20, 1, true);
  out.setUint16(22, ch, true);
  out.setUint32(24, buf.sampleRate, true);
  out.setUint32(28, buf.sampleRate * ch * 2, true);
  out.setUint16(32, ch * 2, true);
  out.setUint16(34, 16, true);
  w(36, "data");
  out.setUint32(40, n * ch * 2, true);
  let o = 44;
  const chans = Array.from({ length: ch }, (_, i) => buf.getChannelData(i));
  for (let i = 0; i < n; i++)
    for (let c = 0; c < ch; c++) {
      const v = Math.max(-1, Math.min(1, chans[c][i]));
      out.setInt16(o, v < 0 ? v * 32768 : v * 32767, true);
      o += 2;
    }
  return new Blob([out], { type: "audio/wav" });
}

export type SynthResult = { chartUrl: string; instUrl: string; notes: number; diffLabel: string };

/** Render + auto-chart a preset. Returns object URLs the caller must revoke. */
export async function makeSynthSong(p: SynthPreset, diff: Difficulty, onProgress?: (x: number) => void): Promise<SynthResult> {
  const buf = await renderSynth(p, onProgress);
  const an = await analyze(buf, (x) => onProgress?.(0.5 + x * 0.5));
  const { json, playerNotes } = buildChart({ ...an, bpm: p.bpm }, diff, p.title);
  return {
    chartUrl: URL.createObjectURL(new Blob([JSON.stringify(json)], { type: "application/json" })),
    instUrl: URL.createObjectURL(toWav(buf)),
    notes: playerNotes,
    diffLabel: diff[0].toUpperCase() + diff.slice(1),
  };
}
