"use client";

// Offline audio processing for the music tools — everything runs in the browser.

import { integratedLoudness } from "./audio";

export const RATE = 44100;

/** 16/24-bit PCM WAV */
export function encodeWav(buf: AudioBuffer, bits: 16 | 24 = 24): Blob {
  const chs = Math.min(2, buf.numberOfChannels);
  const n = buf.length;
  const bps = bits / 8;
  const data = new DataView(new ArrayBuffer(44 + n * chs * bps));
  const str = (o: number, s: string) => [...s].forEach((c, i) => data.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  data.setUint32(4, 36 + n * chs * bps, true);
  str(8, "WAVE");
  str(12, "fmt ");
  data.setUint32(16, 16, true);
  data.setUint16(20, 1, true);
  data.setUint16(22, chs, true);
  data.setUint32(24, buf.sampleRate, true);
  data.setUint32(28, buf.sampleRate * chs * bps, true);
  data.setUint16(32, chs * bps, true);
  data.setUint16(34, bits, true);
  str(36, "data");
  data.setUint32(40, n * chs * bps, true);
  const ch = Array.from({ length: chs }, (_, k) => buf.getChannelData(k));
  let o = 44;
  for (let i = 0; i < n; i++)
    for (let k = 0; k < chs; k++) {
      const v = Math.max(-1, Math.min(1, ch[k][i]));
      if (bits === 16) {
        data.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true);
        o += 2;
      } else {
        const x = Math.round(v < 0 ? v * 0x800000 : v * 0x7fffff);
        data.setUint8(o, x & 255);
        data.setUint8(o + 1, (x >> 8) & 255);
        data.setUint8(o + 2, (x >> 16) & 255);
        o += 3;
      }
    }
  return new Blob([data.buffer], { type: "audio/wav" });
}

export function download(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
export const baseName = (f: { name: string }) => f.name.replace(/\.[^.]+$/, "");

/** stereo room impulse response for the convolver */
export function impulse(ctx: BaseAudioContext, seconds: number, decay: number) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return ir;
}

export const peak = (buf: AudioBuffer) => {
  let p = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) {
      const v = Math.abs(d[i]);
      if (v > p) p = v;
    }
  }
  return p;
};
export const db = (x: number) => 20 * Math.log10(Math.max(1e-9, x));
export const undb = (d: number) => Math.pow(10, d / 20);

export function gain(buf: AudioBuffer, g: number) {
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] *= g;
  }
  return buf;
}

/** brick-wall look-ahead limiter (in place) */
export function limit(buf: AudioBuffer, ceilingDb = -1) {
  const ceil = undb(ceilingDb);
  const rate = buf.sampleRate;
  const look = Math.floor(rate * 0.005);
  const rel = Math.exp(-1 / (rate * 0.08));
  const chs = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c));
  const n = buf.length;
  // required gain per sample
  const need = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let p = 0;
    for (const d of chs) p = Math.max(p, Math.abs(d[i]));
    need[i] = p > ceil ? ceil / p : 1;
  }
  // look-ahead minimum + smooth release
  const env = new Float32Array(n);
  let g = 1;
  for (let i = n - 1; i >= 0; i--) env[i] = Math.min(need[i], i + 1 < n ? env[i + 1] + (1 - env[i + 1]) / look : 1);
  for (let i = 0; i < n; i++) {
    const target = env[i];
    g = target < g ? target : target + (g - target) * rel;
    for (const d of chs) d[i] = Math.max(-ceil, Math.min(ceil, d[i] * g));
  }
  return buf;
}

export async function lufs(buf: AudioBuffer) {
  const chs = Array.from({ length: Math.min(2, buf.numberOfChannels) }, (_, c) => buf.getChannelData(c));
  return integratedLoudness(chs, buf.sampleRate);
}

export function slice(buf: AudioBuffer, start: number, end: number): AudioBuffer {
  const a = Math.max(0, Math.floor(start * buf.sampleRate));
  const b = Math.min(buf.length, Math.floor(end * buf.sampleRate));
  const out = new AudioBuffer({ length: Math.max(1, b - a), numberOfChannels: buf.numberOfChannels, sampleRate: buf.sampleRate });
  for (let c = 0; c < buf.numberOfChannels; c++) out.copyToChannel(buf.getChannelData(c).subarray(a, b), c);
  return out;
}

export function fades(buf: AudioBuffer, inSec: number, outSec: number) {
  const fi = Math.floor(inSec * buf.sampleRate);
  const fo = Math.floor(outSec * buf.sampleRate);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < fi && i < d.length; i++) d[i] *= i / fi;
    for (let i = 0; i < fo && i < d.length; i++) d[d.length - 1 - i] *= i / fo;
  }
  return buf;
}

export function toStereo(buf: AudioBuffer) {
  if (buf.numberOfChannels >= 2) return buf;
  const out = new AudioBuffer({ length: buf.length, numberOfChannels: 2, sampleRate: buf.sampleRate });
  out.copyToChannel(buf.getChannelData(0), 0);
  out.copyToChannel(buf.getChannelData(0), 1);
  return out;
}

/** speed (tape-style: pitch follows) + optional reverb + tone */
export async function vibe(buf: AudioBuffer, o: { speed: number; reverb: number; size: number; lowpass: number | null; bass: number }) {
  const src0 = toStereo(buf);
  const len = Math.ceil(src0.length / o.speed + src0.sampleRate * (o.reverb > 0 ? o.size + 0.5 : 0.1));
  const ctx = new OfflineAudioContext(2, len, src0.sampleRate);
  const src = ctx.createBufferSource();
  src.buffer = src0;
  src.playbackRate.value = o.speed;
  const lows = ctx.createBiquadFilter();
  lows.type = "lowshelf";
  lows.frequency.value = 120;
  lows.gain.value = o.bass;
  let node: AudioNode = src.connect(lows);
  if (o.lowpass) {
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = o.lowpass;
    node = node.connect(lp);
  }
  const dry = ctx.createGain();
  dry.gain.value = 1 - o.reverb * 0.45;
  node.connect(dry).connect(ctx.destination);
  if (o.reverb > 0) {
    const conv = ctx.createConvolver();
    conv.buffer = impulse(ctx, o.size, 2.6);
    const wet = ctx.createGain();
    wet.gain.value = o.reverb;
    const pre = ctx.createDelay();
    pre.delayTime.value = 0.03;
    node.connect(pre).connect(conv).connect(wet).connect(ctx.destination);
  }
  src.start();
  const out = await ctx.startRendering();
  const p = peak(out);
  if (p > 0.98) gain(out, 0.98 / p);
  return out;
}

export type MasterStyle = "balanced" | "warm" | "bright" | "punchy" | "loud";
const STYLES: Record<MasterStyle, { low: number; high: number; mid: number; thr: number; ratio: number }> = {
  balanced: { low: 1, high: 1.5, mid: 0, thr: -18, ratio: 2 },
  warm: { low: 2.5, high: -0.5, mid: -1, thr: -18, ratio: 2 },
  bright: { low: 0.5, high: 3, mid: 0.5, thr: -18, ratio: 2 },
  punchy: { low: 2, high: 2, mid: -1.5, thr: -20, ratio: 3 },
  loud: { low: 1.5, high: 2, mid: 0, thr: -24, ratio: 4 },
};

/** one-click master: clean low end, tone EQ, glue compression, loudness target, true-peak-safe limiter */
export async function master(buf: AudioBuffer, style: MasterStyle, targetLufs: number, onStep?: (s: string) => void) {
  onStep?.("Shaping tone…");
  const src0 = toStereo(buf);
  const ctx = new OfflineAudioContext(2, src0.length, src0.sampleRate);
  const s = STYLES[style];
  const src = ctx.createBufferSource();
  src.buffer = src0;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 28;
  const low = ctx.createBiquadFilter();
  low.type = "lowshelf";
  low.frequency.value = 110;
  low.gain.value = s.low;
  const mid = ctx.createBiquadFilter();
  mid.type = "peaking";
  mid.frequency.value = 400;
  mid.Q.value = 0.8;
  mid.gain.value = s.mid;
  const high = ctx.createBiquadFilter();
  high.type = "highshelf";
  high.frequency.value = 9000;
  high.gain.value = s.high;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = s.thr;
  comp.ratio.value = s.ratio;
  comp.knee.value = 8;
  comp.attack.value = 0.012;
  comp.release.value = 0.18;
  src.connect(hp).connect(low).connect(mid).connect(high).connect(comp).connect(ctx.destination);
  src.start();
  const out = await ctx.startRendering();
  onStep?.("Measuring loudness…");
  for (let pass = 0; pass < 2; pass++) {
    const l = await lufs(out);
    if (l === null) break;
    gain(out, undb(targetLufs - l));
    onStep?.(pass ? "Final limiting…" : "Limiting…");
    limit(out, -1);
  }
  return out;
}

/** karaoke: cancel the centre (vocals) but keep the bass; or the reverse for a rough a cappella */
export async function centre(buf: AudioBuffer, mode: "instrumental" | "acapella") {
  if (buf.numberOfChannels < 2) throw new Error("This needs a stereo file — mono songs have no stereo image to separate.");
  const n = buf.length;
  const L = buf.getChannelData(0),
    R = buf.getChannelData(1);
  const side = new AudioBuffer({ length: n, numberOfChannels: 2, sampleRate: buf.sampleRate });
  const mid = new AudioBuffer({ length: n, numberOfChannels: 2, sampleRate: buf.sampleRate });
  const s0 = side.getChannelData(0),
    s1 = side.getChannelData(1),
    m0 = mid.getChannelData(0),
    m1 = mid.getChannelData(1);
  for (let i = 0; i < n; i++) {
    const sd = (L[i] - R[i]) / 2;
    const md = (L[i] + R[i]) / 2;
    s0[i] = sd;
    s1[i] = -sd;
    m0[i] = m1[i] = md;
  }
  const ctx = new OfflineAudioContext(2, n, buf.sampleRate);
  if (mode === "instrumental") {
    // sides (no centre vocal) + the centre's low end (kick/bass)
    const a = ctx.createBufferSource();
    a.buffer = side;
    a.connect(ctx.destination);
    const b = ctx.createBufferSource();
    b.buffer = mid;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 160;
    b.connect(lp).connect(ctx.destination);
    a.start();
    b.start();
  } else {
    // centre minus a bit of the sides, band-limited to the voice range
    const b = ctx.createBufferSource();
    b.buffer = mid;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 140;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 11000;
    b.connect(hp).connect(lp).connect(ctx.destination);
    b.start();
  }
  const out = await ctx.startRendering();
  const p = peak(out);
  if (p > 0) gain(out, Math.min(4, 0.95 / p));
  return out;
}
