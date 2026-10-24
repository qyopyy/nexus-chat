"use client";

// Music tools, all in the browser (nothing is uploaded for analysis):
//   analyzeAudio → BPM, key (+ Camelot), integrated loudness (LUFS, ITU-R BS.1770), true peak, clipping,
//                  silence, stereo correlation, file format (sample rate / bit depth / channels)
//   fingerprintClip → 12 s 8 kHz mono WAV clip for the copyright check (≈190 KB)
//   copyrightCheck → sends the clip to the `audiocheck` function (ACRCloud fingerprint match)

import { supabase } from "./supabase";

export type AudioReport = {
  duration: number;
  sampleRate: number;
  channels: number;
  bitDepth: number | null;
  format: string;
  bpm: number | null;
  key: string | null;
  camelot: string | null;
  keyConfidence: number;
  lufs: number | null;
  truePeak: number | null; // dBTP
  samplePeak: number; // dBFS
  clippedSamples: number;
  silenceStart: number; // seconds
  silenceEnd: number;
  correlation: number | null; // −1…1 (stereo only)
  dcOffset: number;
  warnings: string[];
};

export type CheckMatch = {
  title: string;
  artists: string[];
  album: string | null;
  label: string | null;
  release_date: string | null;
  isrc: string | null;
  upc: string | null;
  score: number | null;
  offset_s: number | null;
  spotify_id: string | null;
  youtube_id: string | null;
};
export type AudioCheck = {
  id: string;
  user_id: string;
  target_kind: "track" | "video" | "tool";
  target_id: string | null;
  provider: string;
  status: "clean" | "match" | "own" | "error";
  matches: CheckMatch[];
  note: string | null;
  created_at: string;
};

const yieldUI = () => new Promise((r) => setTimeout(r, 0));

let sharedCtx: AudioContext | null = null;
export function audioCtx() {
  if (!sharedCtx) {
    const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    sharedCtx = new C();
  }
  return sharedCtx;
}

/** decode a whole file (audio, or the soundtrack of a video) */
export async function decodeFile(file: Blob): Promise<AudioBuffer> {
  const buf = await file.arrayBuffer();
  const ctx = audioCtx();
  return await new Promise<AudioBuffer>((res, rej) => {
    const p = ctx.decodeAudioData(buf.slice(0), res, rej);
    if (p && typeof (p as Promise<AudioBuffer>).then === "function") (p as Promise<AudioBuffer>).then(res, rej);
  });
}

/** read sample rate / bit depth straight from the WAV or FLAC header */
export async function fileFormat(file: Blob): Promise<{ format: string; bitDepth: number | null; sampleRate: number | null; channels: number | null }> {
  const h = new DataView(await file.slice(0, 4096).arrayBuffer());
  const tag = (o: number) => String.fromCharCode(h.getUint8(o), h.getUint8(o + 1), h.getUint8(o + 2), h.getUint8(o + 3));
  try {
    if (tag(0) === "RIFF" && tag(8) === "WAVE") {
      let o = 12;
      while (o + 8 < h.byteLength) {
        const id = tag(o);
        const size = h.getUint32(o + 4, true);
        if (id === "fmt ") {
          const fmt = h.getUint16(o + 8, true);
          return { format: fmt === 3 ? "WAV (32-bit float)" : "WAV", channels: h.getUint16(o + 10, true), sampleRate: h.getUint32(o + 12, true), bitDepth: h.getUint16(o + 22, true) };
        }
        o += 8 + size + (size % 2);
      }
      return { format: "WAV", bitDepth: null, sampleRate: null, channels: null };
    }
    if (tag(0) === "fLaC") {
      // STREAMINFO: 20 bits rate, 3 bits channels-1, 5 bits bps-1
      const b = (i: number) => h.getUint8(8 + i);
      const sampleRate = (b(10) << 12) | (b(11) << 4) | (b(12) >> 4);
      const channels = ((b(12) >> 1) & 7) + 1;
      const bitDepth = (((b(12) & 1) << 4) | (b(13) >> 4)) + 1;
      return { format: "FLAC", sampleRate, channels, bitDepth };
    }
    if (tag(0).startsWith("ID3") || (h.getUint8(0) === 0xff && (h.getUint8(1) & 0xe0) === 0xe0)) return { format: "MP3", bitDepth: null, sampleRate: null, channels: null };
    if (tag(4) === "ftyp") return { format: "MP4 / M4A", bitDepth: null, sampleRate: null, channels: null };
    if (tag(0) === "OggS") return { format: "OGG", bitDepth: null, sampleRate: null, channels: null };
  } catch {
    /* short file */
  }
  return { format: (file as File).type || "audio", bitDepth: null, sampleRate: null, channels: null };
}

// ------------------------------------------------------------------ helpers
export async function resample(buf: AudioBuffer, rate: number, channels = 1, start = 0, seconds?: number): Promise<Float32Array[]> {
  const dur = Math.max(0.1, Math.min(seconds ?? buf.duration, buf.duration - start));
  const OAC = window.OfflineAudioContext || (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  const off = new OAC(channels, Math.ceil(dur * rate), rate);
  const src = off.createBufferSource();
  src.buffer = buf;
  src.connect(off.destination);
  src.start(0, start, dur);
  const out = await off.startRendering();
  return Array.from({ length: channels }, (_, c) => out.getChannelData(c));
}

export function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

const db = (x: number) => (x > 0 ? 20 * Math.log10(x) : -Infinity);

// ------------------------------------------------------------------ loudness (BS.1770-4)
function biquad(b0: number, b1: number, b2: number, a1: number, a2: number) {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0; // prettier-ignore
  return (x: number) => {
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    return y;
  };
}
function kWeighting(rate: number) {
  // stage 1: high shelf (+4 dB above ~1.7 kHz), stage 2: RLB high-pass (~38 Hz); coefficients per pyloudnorm
  let f0 = 1681.974450955533, G = 3.999843853973347, Q = 0.7071752369554196; // prettier-ignore
  let K = Math.tan((Math.PI * f0) / rate);
  const Vh = Math.pow(10, G / 20);
  const Vb = Math.pow(Vh, 0.4996667741545416);
  let a0 = 1 + K / Q + K * K;
  const s1 = biquad((Vh + (Vb * K) / Q + K * K) / a0, (2 * (K * K - Vh)) / a0, (Vh - (Vb * K) / Q + K * K) / a0, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0);
  f0 = 38.13547087602444;
  Q = 0.5003270373238773;
  K = Math.tan((Math.PI * f0) / rate);
  a0 = 1 + K / Q + K * K;
  const s2 = biquad(1, -2, 1, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0);
  return (x: number) => s2(s1(x));
}

async function integratedLoudness(chs: Float32Array[], rate: number): Promise<number | null> {
  const block = Math.round(0.4 * rate);
  const hop = Math.round(0.1 * rate);
  const n = chs[0].length;
  if (n < block) return null;
  // K-weighted squared signal, summed in 100 ms hops
  const hops = Math.floor(n / hop);
  const hopPower = new Float64Array(hops);
  for (const ch of chs.slice(0, 2)) {
    const f = kWeighting(rate);
    for (let h = 0; h < hops; h++) {
      let s = 0;
      const end = (h + 1) * hop;
      for (let i = h * hop; i < end; i++) {
        const y = f(ch[i]);
        s += y * y;
      }
      hopPower[h] += s;
      if (h % 2000 === 0) await yieldUI();
    }
  }
  const blocks: number[] = [];
  for (let h = 0; h + 4 <= hops; h++) blocks.push((hopPower[h] + hopPower[h + 1] + hopPower[h + 2] + hopPower[h + 3]) / block);
  const L = (p: number) => -0.691 + 10 * Math.log10(p);
  const abs = blocks.filter((p) => p > 0 && L(p) > -70);
  if (!abs.length) return null;
  const rel = L(abs.reduce((a, b) => a + b, 0) / abs.length) - 10;
  const gated = abs.filter((p) => L(p) > rel);
  return gated.length ? L(gated.reduce((a, b) => a + b, 0) / gated.length) : null;
}

/** 4× oversampled peak (windowed-sinc interpolation) — what stores call "true peak" */
async function truePeak(chs: Float32Array[]): Promise<number> {
  const TAPS = 12;
  const phases = [0.25, 0.5, 0.75].map((frac) => {
    const k: number[] = [];
    for (let t = -TAPS / 2 + 1; t <= TAPS / 2; t++) {
      const x = t - frac;
      const sinc = Math.abs(x) < 1e-9 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
      const w = 0.5 + 0.5 * Math.cos((Math.PI * x) / (TAPS / 2));
      k.push(sinc * w);
    }
    return k;
  });
  let peak = 0;
  for (const ch of chs.slice(0, 2)) {
    for (let i = 0; i < ch.length; i++) {
      const a = Math.abs(ch[i]);
      if (a > peak) peak = a;
      // only interpolate around loud samples (where inter-sample peaks can exceed the max)
      if (a > peak * 0.7 && a > 0.3) {
        for (const k of phases) {
          let s = 0;
          for (let t = 0; t < TAPS; t++) {
            const j = i - TAPS / 2 + 1 + t;
            if (j >= 0 && j < ch.length) s += ch[j] * k[t];
          }
          if (Math.abs(s) > peak) peak = Math.abs(s);
        }
      }
      if (i % 500_000 === 0) await yieldUI();
    }
  }
  return peak;
}

// ------------------------------------------------------------------ tempo
function detectBpm(x: Float32Array, rate: number): number | null {
  // onset envelope: positive energy flux in ~11.6 ms hops (rate 11025 → 128 samples)
  const hop = 128;
  const frames = Math.floor(x.length / hop);
  if (frames < 200) return null;
  const env = new Float64Array(frames);
  let prev = 0;
  for (let f = 0; f < frames; f++) {
    let e = 0;
    for (let i = f * hop; i < (f + 1) * hop; i++) e += x[i] * x[i];
    e = Math.log1p(1000 * e);
    env[f] = Math.max(0, e - prev);
    prev = e;
  }
  const mean = env.reduce((a, b) => a + b, 0) / frames;
  for (let i = 0; i < frames; i++) env[i] -= mean;
  const fps = rate / hop;
  const minLag = Math.floor((fps * 60) / 200);
  const maxLag = Math.ceil((fps * 60) / 60);
  const ac = new Float64Array(maxLag + 2);
  for (let lag = minLag; lag <= maxLag + 1; lag++) {
    let s = 0;
    for (let i = 0; i + lag < frames; i++) s += env[i] * env[i + lag];
    ac[lag] = s;
  }
  // prefer tempos near 120 BPM a little (log-gaussian), avoids half/double errors
  let best = minLag;
  let bestScore = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    const bpm = (60 * fps) / lag;
    const w = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 120) / 1.0, 2));
    const score = ac[lag] * w;
    if (score > bestScore) {
      bestScore = score;
      best = lag;
    }
  }
  // no clear pulse (drones, ambient, speech) → no tempo
  let zero = 0;
  for (let i = 0; i < frames; i++) zero += env[i] * env[i];
  if (!zero || ac[best] / zero < 0.12) return null;
  // parabolic refinement
  const a = ac[best - 1] ?? 0, b = ac[best], c = ac[best + 1] ?? 0; // prettier-ignore
  const d = a - 2 * b + c;
  const lag = d !== 0 ? best + (0.5 * (a - c)) / d : best;
  let bpm = (60 * fps) / lag;
  while (bpm < 70) bpm *= 2;
  while (bpm > 180) bpm /= 2;
  return Math.round(bpm * 10) / 10;
}

// ------------------------------------------------------------------ key
const NOTES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const CAMELOT_MAJ = ["8B", "3B", "10B", "5B", "12B", "7B", "2B", "9B", "4B", "11B", "6B", "1B"];
const CAMELOT_MIN = ["5A", "12A", "7A", "2A", "9A", "4A", "11A", "6A", "1A", "8A", "3A", "10A"];

function corr(a: number[], b: number[]) {
  const ma = a.reduce((x, y) => x + y, 0) / a.length;
  const mb = b.reduce((x, y) => x + y, 0) / b.length;
  let n = 0, da = 0, dbb = 0; // prettier-ignore
  for (let i = 0; i < a.length; i++) {
    n += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    dbb += (b[i] - mb) ** 2;
  }
  return n / Math.sqrt(da * dbb || 1);
}

async function detectKey(x: Float32Array, rate: number) {
  const N = 8192;
  const chroma = new Array(12).fill(0);
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  const hann = Float64Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
  const binPc: number[] = [];
  for (let k = 0; k < N / 2; k++) {
    const f = (k * rate) / N;
    binPc.push(f < 55 || f > 2000 ? -1 : ((Math.round(12 * Math.log2(f / 440)) % 12) + 12 + 9) % 12);
  }
  let frames = 0;
  for (let s = 0; s + N <= x.length; s += N) {
    for (let i = 0; i < N; i++) {
      re[i] = x[s + i] * hann[i];
      im[i] = 0;
    }
    fft(re, im);
    const frame = new Array(12).fill(0);
    for (let k = 1; k < N / 2; k++) if (binPc[k] >= 0) frame[binPc[k]] += Math.sqrt(re[k] * re[k] + im[k] * im[k]);
    const sum = frame.reduce((a, b) => a + b, 0) || 1;
    for (let p = 0; p < 12; p++) chroma[p] += frame[p] / sum;
    if (++frames % 40 === 0) await yieldUI();
  }
  if (!frames) return { key: null, camelot: null, confidence: 0 };
  const scores: { key: string; camelot: string; r: number }[] = [];
  for (let t = 0; t < 12; t++) {
    const rot = (p: number[]) => p.map((_, i) => p[(i - t + 12) % 12]);
    scores.push({ key: `${NOTES[t]} major`, camelot: CAMELOT_MAJ[t], r: corr(chroma, rot(MAJOR)) });
    scores.push({ key: `${NOTES[t]} minor`, camelot: CAMELOT_MIN[t], r: corr(chroma, rot(MINOR)) });
  }
  scores.sort((a, b) => b.r - a.r);
  return { key: scores[0].key, camelot: scores[0].camelot, confidence: Math.max(0, Math.min(1, (scores[0].r - scores[1].r) * 8 + scores[0].r * 0.5)) };
}

// ------------------------------------------------------------------ public
export async function analyzeAudio(file: File | Blob, onStep?: (s: string) => void, decoded?: AudioBuffer): Promise<AudioReport> {
  onStep?.("Reading file…");
  const fmt = await fileFormat(file);
  const buf = decoded ?? (await decodeFile(file));
  onStep?.("Measuring loudness…");
  const chs = Array.from({ length: Math.min(2, buf.numberOfChannels) }, (_, c) => buf.getChannelData(c));
  const rate = buf.sampleRate;

  let samplePeak = 0;
  let clipped = 0;
  let dc = 0;
  for (const ch of chs) {
    let run = 0;
    for (let i = 0; i < ch.length; i++) {
      const a = Math.abs(ch[i]);
      if (a > samplePeak) samplePeak = a;
      dc += ch[i];
      if (a >= 0.9999) {
        if (++run === 3) clipped++;
      } else run = 0;
    }
  }
  dc /= chs.length * chs[0].length;

  // silence at start / end (below −60 dBFS)
  const thr = 0.001;
  const loudAt = (i: number) => chs.some((c) => Math.abs(c[i]) > thr);
  let s0 = 0;
  while (s0 < chs[0].length && !loudAt(s0)) s0++;
  let s1 = chs[0].length - 1;
  while (s1 > s0 && !loudAt(s1)) s1--;

  let correlation: number | null = null;
  if (chs.length === 2) {
    let lr = 0, ll = 0, rr = 0; // prettier-ignore
    for (let i = 0; i < chs[0].length; i += 4) {
      lr += chs[0][i] * chs[1][i];
      ll += chs[0][i] ** 2;
      rr += chs[1][i] ** 2;
    }
    correlation = ll && rr ? lr / Math.sqrt(ll * rr) : 1;
  }

  const lufs = await integratedLoudness(chs, rate);
  onStep?.("Checking true peak…");
  const tp = await truePeak(chs);
  onStep?.("Finding tempo and key…");
  const [mono] = await resample(buf, 11025, 1);
  const bpm = detectBpm(mono, 11025);
  const key = await detectKey(mono, 11025);

  const truePeakDb = tp > 0 ? Math.round(db(tp) * 10) / 10 : null;
  const warnings: string[] = [];
  const sr = fmt.sampleRate ?? rate;
  if (fmt.format.startsWith("MP3") || fmt.format.startsWith("MP4") || fmt.format === "OGG") warnings.push("Stores need lossless audio — export WAV or FLAC for distribution.");
  if (sr < 44100) warnings.push(`Sample rate ${sr} Hz — stores need 44.1 kHz or higher.`);
  if (fmt.bitDepth && fmt.bitDepth < 16) warnings.push(`${fmt.bitDepth}-bit audio — use 16 or 24-bit.`);
  if (clipped > 0) warnings.push(`${clipped} clipped spot${clipped === 1 ? "" : "s"} — lower the master a little.`);
  if (truePeakDb !== null && truePeakDb > -1) warnings.push(`True peak ${truePeakDb} dBTP — keep it at −1 dBTP or lower to avoid distortion after encoding.`);
  if (lufs !== null && lufs > -7) warnings.push("Very loud master — streaming services will turn it down a lot.");
  if (s0 / rate > 2) warnings.push(`${(s0 / rate).toFixed(1)} s of silence at the start.`);
  if ((chs[0].length - 1 - s1) / rate > 5) warnings.push(`${((chs[0].length - 1 - s1) / rate).toFixed(1)} s of silence at the end.`);
  if (correlation !== null && correlation < 0) warnings.push("Stereo phase problem — the track may sound thin in mono.");
  if (Math.abs(dc) > 0.01) warnings.push("DC offset detected.");
  if (buf.duration < 30) warnings.push("Shorter than 30 seconds — streams under 30 s don't earn royalties.");

  return {
    duration: buf.duration,
    sampleRate: sr,
    channels: fmt.channels ?? buf.numberOfChannels,
    bitDepth: fmt.bitDepth,
    format: fmt.format,
    bpm,
    key: key.key,
    camelot: key.camelot,
    keyConfidence: key.confidence,
    lufs: lufs === null ? null : Math.round(lufs * 10) / 10,
    truePeak: truePeakDb,
    samplePeak: Math.round(db(samplePeak) * 10) / 10,
    clippedSamples: clipped,
    silenceStart: s0 / rate,
    silenceEnd: (chs[0].length - 1 - s1) / rate,
    correlation: correlation === null ? null : Math.round(correlation * 100) / 100,
    dcOffset: dc,
    warnings,
  };
}

/** how much each service will turn the track down/up (normalization targets) */
export const PLATFORMS: { name: string; target: number; upOnly?: boolean }[] = [
  { name: "Spotify", target: -14 },
  { name: "YouTube", target: -14, upOnly: true },
  { name: "Apple Music", target: -16 },
  { name: "Amazon Music", target: -14 },
  { name: "Tidal", target: -14 },
  { name: "Deezer", target: -15 },
];

// ------------------------------------------------------------------ fingerprint clip + check
function wav16(x: Float32Array, rate: number) {
  const buf = new ArrayBuffer(44 + x.length * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF");
  v.setUint32(4, 36 + x.length * 2, true);
  w(8, "WAVE");
  w(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, "data");
  v.setUint32(40, x.length * 2, true);
  for (let i = 0; i < x.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, x[i])) * 0x7fff, true);
  return new Uint8Array(buf);
}

function b64(bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** where to sample: 30% in (past intros), at least 12 s before the end */
const clipStart = (duration: number, len: number) => Math.max(0, Math.min(Math.max(duration * 0.3, Math.min(30, duration / 3)), duration - len));

export async function clipFromBuffer(buf: AudioBuffer, at?: number, seconds = 12) {
  const start = at ?? clipStart(buf.duration, seconds);
  const [x] = await resample(buf, 8000, 1, start, seconds);
  return wav16(x, 8000);
}

/** soundtrack clip from a video too big to decode: plays the file silently into Web Audio for 12 s */
export async function clipFromMedia(file: Blob, seconds = 12): Promise<Uint8Array> {
  const ctx = audioCtx();
  await ctx.resume();
  const url = URL.createObjectURL(file);
  const el = document.createElement("video");
  el.src = url;
  el.playsInline = true;
  el.preload = "auto";
  try {
    await new Promise<void>((res, rej) => {
      el.onloadedmetadata = () => res();
      el.onerror = () => rej(new Error("Can't read this file's audio"));
      setTimeout(() => rej(new Error("Can't read this file's audio")), 15000);
    });
    el.currentTime = clipStart(el.duration || 0, seconds);
    await new Promise((r) => ((el.onseeked = r), setTimeout(r, 3000)));
    const src = ctx.createMediaElementSource(el); // re-routed away from the speakers: nothing is heard
    const proc = ctx.createScriptProcessor(4096, 2, 1);
    const chunks: Float32Array[] = [];
    proc.onaudioprocess = (e) => {
      const l = e.inputBuffer.getChannelData(0);
      const r = e.inputBuffer.numberOfChannels > 1 ? e.inputBuffer.getChannelData(1) : l;
      const m = new Float32Array(l.length);
      for (let i = 0; i < l.length; i++) m[i] = (l[i] + r[i]) / 2;
      chunks.push(m);
      e.outputBuffer.getChannelData(0).fill(0);
    };
    const sink = ctx.createGain();
    sink.gain.value = 0;
    src.connect(proc);
    proc.connect(sink);
    sink.connect(ctx.destination);
    await el.play();
    await new Promise((r) => setTimeout(r, seconds * 1000 + 300));
    el.pause();
    src.disconnect();
    proc.disconnect();
    const total = chunks.reduce((a, c) => a + c.length, 0);
    const pcm = ctx.createBuffer(1, Math.max(1, total), ctx.sampleRate);
    let o = 0;
    const dst = pcm.getChannelData(0);
    for (const c of chunks) {
      dst.set(c, o);
      o += c.length;
    }
    const [x] = await resample(pcm, 8000, 1, 0);
    return wav16(x, 8000);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** biggest file we decode in memory (phones have less RAM) */
export const decodeLimit = () => (typeof navigator !== "undefined" && /iPhone|iPad|Android/i.test(navigator.userAgent) ? 120 : 400) * 1024 * 1024;

/** decode when reasonable, otherwise play-capture the soundtrack */
export async function clipFromFile(file: File, decoded?: AudioBuffer) {
  if (decoded) return clipFromBuffer(decoded);
  if (file.size <= decodeLimit()) {
    try {
      return await clipFromBuffer(await decodeFile(file));
    } catch {
      /* container the browser can't decode directly — fall through */
    }
  }
  return clipFromMedia(file);
}

export type CheckStatus = { configured: boolean; provider: string | null; staff: boolean; shieldBucket?: boolean };
export async function checkStatus(): Promise<CheckStatus> {
  const { data } = await supabase.functions.invoke("audiocheck", { body: { action: "status" } });
  return (data as CheckStatus) ?? { configured: false, provider: null, staff: false };
}
export async function saveShieldBucket(token: string, bucket: string) {
  const { error } = await supabase.functions.invoke("audiocheck", { body: { action: "set_bucket", token, bucket } });
  if (error) throw new Error(await fnError(error));
}

async function fnError(error: unknown) {
  const ctx = (error as { context?: Response }).context;
  if (ctx && typeof ctx.json === "function") {
    const j = await ctx.json().catch(() => null);
    if (j?.error) return String(j.error);
  }
  return (error as Error)?.message ?? "Request failed";
}

export async function copyrightCheck(clip: Uint8Array, target: { kind: "track" | "video" | "tool"; id?: string }): Promise<AudioCheck> {
  const { data, error } = await supabase.functions.invoke("audiocheck", { body: { action: "check", target_kind: target.kind, target_id: target.id ?? null, sample: b64(clip) } });
  if (error) throw new Error(await fnError(error));
  return data as AudioCheck;
}

export async function saveCheckConfig(host: string, key: string, secret: string) {
  const { error } = await supabase.functions.invoke("audiocheck", { body: { action: "set_config", host, key, secret } });
  if (error) throw new Error(await fnError(error));
}
export async function clearCheckConfig() {
  const { error } = await supabase.functions.invoke("audiocheck", { body: { action: "clear_config" } });
  if (error) throw new Error(await fnError(error));
}

export async function latestChecks(kind: "track" | "video", ids: string[]) {
  if (!ids.length) return {} as Record<string, AudioCheck>;
  const { data } = await supabase.from("audio_checks").select("*").eq("target_kind", kind).in("target_id", ids).order("created_at", { ascending: false });
  const out: Record<string, AudioCheck> = {};
  for (const c of (data ?? []) as AudioCheck[]) if (c.target_id && !out[c.target_id]) out[c.target_id] = c;
  return out;
}

export async function myToolChecks() {
  const { data } = await supabase.from("audio_checks").select("*").eq("target_kind", "tool").order("created_at", { ascending: false }).limit(20);
  return (data ?? []) as AudioCheck[];
}

export const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** words that usually mean a track should be marked Explicit */
const EXPLICIT = /\b(fuck\w*|shit\w*|bitch\w*|cunt\w*|dick|pussy|motherfuck\w*|ass(hole)?|whore|slut|cock\w*|faszom|fasz|kurva\w*|geci|picsa|bazdmeg|baszd\w*|basz\w*)\b/i;
export const lyricsLookExplicit = (lyrics: string | null | undefined) => !!lyrics && EXPLICIT.test(lyrics);
