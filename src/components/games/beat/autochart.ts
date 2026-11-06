// Beat Battle — auto-chart: turn any song on the user's device into a playable chart.
// Everything runs locally (Web Audio decode + a small FFT): spectral-flux onsets → tempo + beat grid →
// notes snapped to the grid, thinned per difficulty, lanes picked from the sound's brightness.
// Output is a Psych Engine chart (plus a Nexus `offset`), so the normal game code plays it unchanged.

export type Difficulty = "easy" | "normal" | "hard";
export type Analysis = {
  duration: number; // seconds
  fps: number;
  frameT0: number; // time of frame 0 (s)
  env: Float32Array; // onset strength (spectral flux, rectified against a moving mean)
  low: Float32Array; // same, bass band only (a light hint for the beat grid)
  rms: Float32Array;
  hit: Float32Array; // 0-1 hit strength per frame
  tone: Float32Array; // 0-1 brightness rank per frame (picks the lane)
  bpm: number;
  phase: number; // seconds: a beat lands here
  bar: number; // 0-3: which beat after `phase` starts a bar
};

const N = 1024;
const HOP = 256;
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

function fftTables(n: number) {
  const rev = new Uint32Array(n);
  const bits = Math.log2(n);
  for (let i = 0; i < n; i++) {
    let r = 0;
    for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
    rev[i] = r;
  }
  const cos = new Float64Array(n / 2);
  const sin = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) {
    cos[i] = Math.cos((2 * Math.PI * i) / n);
    sin[i] = -Math.sin((2 * Math.PI * i) / n);
  }
  return { rev, cos, sin };
}

function fft(re: Float64Array, im: Float64Array, t: ReturnType<typeof fftTables>) {
  const n = re.length;
  for (let i = 0; i < n; i++) {
    const j = t.rev[i];
    if (j > i) {
      let x = re[i];
      re[i] = re[j];
      re[j] = x;
      x = im[i];
      im[i] = im[j];
      im[j] = x;
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1;
    const stepT = n / size;
    for (let start = 0; start < n; start += size) {
      for (let k = 0; k < half; k++) {
        const wr = t.cos[k * stepT];
        const wi = t.sin[k * stepT];
        const a = start + k;
        const b = a + half;
        const xr = re[b] * wr - im[b] * wi;
        const xi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - xr;
        im[b] = im[a] - xi;
        re[a] += xr;
        im[a] += xi;
      }
    }
  }
}

function movingMean(x: Float32Array, half: number) {
  const n = x.length;
  const pre = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + x[i];
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - half);
    const b = Math.min(n, i + half + 1);
    out[i] = (pre[b] - pre[a]) / (b - a);
  }
  return out;
}

const interp = (x: Float32Array, p: number) => {
  const i = Math.floor(p);
  if (i < 0 || i + 1 >= x.length) return 0;
  const f = p - i;
  return x[i] * (1 - f) + x[i + 1] * f;
};

/** Decode a user's audio file (mp3 / m4a / wav / ogg where supported). */
export async function decodeFile(file: Blob): Promise<AudioBuffer> {
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AC();
  try {
    return await ctx.decodeAudioData(await file.arrayBuffer());
  } catch {
    throw new Error("Couldn't read that audio file — try an MP3 or M4A");
  } finally {
    void ctx.close().catch(() => {});
  }
}

export async function analyze(buf: AudioBuffer, onProgress?: (p: number) => void): Promise<Analysis> {
  if (buf.duration < 15) throw new Error("That song is too short (needs 15 s or more)");
  if (buf.duration > 600) throw new Error("That song is too long (10 minutes max)");
  // mono, ~22 kHz
  const step = Math.max(1, Math.round(buf.sampleRate / 22050));
  const sr = buf.sampleRate / step;
  const len = Math.floor(buf.length / step);
  const chans = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c));
  const x = new Float32Array(len);
  const div = step * chans.length;
  for (let i = 0; i < len; i++) {
    let v = 0;
    for (const ch of chans) for (let k = 0; k < step; k++) v += ch[i * step + k];
    x[i] = v / div;
  }
  const frames = Math.floor((len - N) / HOP) + 1;
  const fps = sr / HOP;
  const tables = fftTables(N);
  const win = new Float64Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
  const binHz = sr / N;
  const lowEnd = Math.ceil(180 / binHz);
  const prev = new Float64Array(N / 2);
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  const flux = new Float32Array(frames);
  const lowF = new Float32Array(frames);
  const cent = new Float32Array(frames);
  const rms = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    const o = f * HOP;
    let e = 0;
    for (let i = 0; i < N; i++) {
      const v = x[o + i];
      e += v * v;
      re[i] = v * win[i];
      im[i] = 0;
    }
    rms[f] = Math.sqrt(e / N);
    fft(re, im, tables);
    let fl = 0;
    let lo = 0;
    let cw = 0;
    for (let b = 1; b < N / 2; b++) {
      const m = Math.log1p(100 * Math.hypot(re[b], im[b]));
      const d = m - prev[b];
      prev[b] = m;
      if (d > 0 && f > 0) {
        fl += d;
        cw += d * b;
        if (b < lowEnd) lo += d;
      }
    }
    flux[f] = fl;
    lowF[f] = lo;
    cent[f] = fl > 0 ? (cw / fl) * binHz : 0;
    if (f % 1500 === 0) {
      onProgress?.((f / frames) * 0.8);
      await tick();
    }
  }
  // rectify against a ~0.4 s moving mean → onset envelopes
  const half = Math.round(fps * 0.4);
  const mean = movingMean(flux, half);
  const lowMean = movingMean(lowF, half);
  const env = new Float32Array(frames);
  const low = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    env[f] = Math.max(0, flux[f] - mean[f]);
    low[f] = Math.max(0, lowF[f] - lowMean[f]);
  }
  const frameT0 = N / 2 / sr - HOP / 2 / sr + 0.015; // flux at frame f describes the change into that frame (+15 ms measured on test tracks)

  // per-frame hit strength (0-1, relative to the song's loud hits) and tone (0 = darkest, 1 = brightest)
  const active: number[] = [];
  for (let f = 0; f < frames; f++) if (env[f] > 0) active.push(env[f]);
  if (active.length < frames * 0.05) throw new Error("Couldn't find a beat in that song");
  active.sort((x, y) => x - y);
  const p97 = active[Math.floor(active.length * 0.97)] || 1;
  const hit = new Float32Array(frames);
  for (let f = 0; f < frames; f++) hit[f] = Math.min(1, env[f] / p97);
  const cents: number[] = [];
  for (let f = 0; f < frames; f++) if (env[f] > 0) cents.push(cent[f]);
  cents.sort((x, y) => x - y);
  const tone = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let lo = 0,
      hi = cents.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (cents[m] < cent[f]) lo = m + 1;
      else hi = m;
    }
    tone[f] = lo / cents.length;
  }
  onProgress?.(0.85);
  await tick();

  // compress the envelopes (a few huge hits shouldn't decide the tempo)
  let lsum = 0;
  for (let f = 0; f < frames; f++) lsum += low[f];
  const emean = Math.max(1e-6, env.reduce((x, y) => x + y, 0) / frames);
  const lmean = Math.max(1e-6, lsum / frames);
  const envC = new Float32Array(frames);
  const lowC = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    envC[f] = Math.log1p(env[f] / emean);
    lowC[f] = Math.log1p(low[f] / lmean);
  }

  // tempo: try every tempo from 80 to 190 BPM on three 30 s windows; a tempo scores by how much onset energy
  // its beat grid AND its eighth-note grid land on (the eighth grid stops 2/3 or 3/4-speed impostors winning).
  const winF = Math.min(frames - 2, Math.round(fps * 30));
  const starts = [0.25, 0.5, 0.75].map((q) => Math.max(0, Math.min(frames - winF - 1, Math.floor(frames * q - winF / 2))));
  const gridMax = (st: number, P: number) => {
    let best = 0;
    for (let ph = 0; ph < P; ph += 1) {
      let s = 0,
        c = 0;
      for (let p = st + ph; p < st + winF; p += P, c++) s += interp(envC, p);
      if (c && s / c > best) best = s / c;
    }
    return best;
  };
  let bpm = 120;
  let bestS = -1;
  for (let b = 80; b < 190; b += 0.25) {
    const P = (fps * 60) / b;
    let total = 0;
    for (const st of starts) total += gridMax(st, P) + gridMax(st, P / 2);
    if (total > bestS) {
      bestS = total;
      bpm = b;
    }
    if (Math.round(b * 4) % 40 === 0) {
      onProgress?.(0.85 + ((b - 80) / 110) * 0.13);
      await tick();
    }
  }

  const a: Analysis = { duration: buf.duration, fps, frameT0, env: envC, low: lowC, rms, hit, tone, bpm, phase: 0, bar: 0 };
  const fit = fitGrid(a, bpm);
  onProgress?.(1);
  return { ...a, ...fit };
}


/** Fine-tune tempo (±1.5 %) and find where the beats and bars fall. Use with a new guess for ×2 / ÷2. */
export function fitGrid(a: Pick<Analysis, "env" | "low" | "fps" | "frameT0">, guess: number): { bpm: number; phase: number; bar: number } {
  const n = a.env.length;
  let best = { s: -1, bpm: guess, ph: 0 };
  const lo = guess * 0.985;
  const hi = guess * 1.015;
  for (let bpm = lo; bpm <= hi; bpm += 0.02) {
    const P = (a.fps * 60) / bpm;
    for (let ph = 0; ph < P; ph += 1) {
      let s = 0;
      let c = 0;
      for (let p = ph; p < n - 1; p += P) {
        s += interp(a.env, p) + interp(a.low, p) * 0.15;
        c++;
      }
      s /= c || 1;
      if (s > best.s) best = { s, bpm, ph };
    }
  }
  // sub-frame phase refine
  const P = (a.fps * 60) / best.bpm;
  let ph = best.ph;
  let bs = -1;
  for (let d = -1; d <= 1; d += 0.125) {
    const q = best.ph + d;
    let s = 0;
    for (let p = q; p < n - 1; p += P) if (p >= 0) s += interp(a.env, p) + interp(a.low, p) * 0.15;
    if (s > bs) {
      bs = s;
      ph = q;
    }
  }
  if (ph < 0) ph += P;
  // bar: the beat (of four) with the most going on (downbeats are usually the loudest)
  const barS = [0, 0, 0, 0];
  let k = 0;
  for (let p = ph; p < n - 1; p += P, k++) barS[k % 4] += interp(a.env, p) + interp(a.low, p);
  const bar = barS.indexOf(Math.max(...barS));
  const bpm = Math.abs(best.bpm - Math.round(best.bpm)) < 0.05 ? Math.round(best.bpm) : Math.round(best.bpm * 100) / 100;
  return { bpm, phase: a.frameT0 + ph / a.fps, bar };
}

const CFG: Record<Difficulty, { sub: number; rate: number; speed: number; jacks: boolean; chords: boolean; hold: number }> = {
  easy: { sub: 1, rate: 1.5, speed: 2.2, jacks: false, chords: false, hold: 0 },
  normal: { sub: 2, rate: 2.7, speed: 2.7, jacks: false, chords: false, hold: 2 },
  hard: { sub: 4, rate: 4.6, speed: 3.1, jacks: true, chords: true, hold: 1.5 },
};

const hash = (n: number) => {
  let h = (n * 2654435761) >>> 0;
  h ^= h >>> 15;
  return h >>> 0;
};

/** Build a Psych-format chart. Opponent and player trade every two bars, like a real battle. */
export function buildChart(a: Analysis, diff: Difficulty, title: string) {
  const c = CFG[diff];
  const beat = 60 / a.bpm;
  const stepS = beat / c.sub;
  // look at every grid slot: how hard is the hit there? (off-beat slots count a bit less so straight rhythms win)
  const slots = new Map<number, { s: number; tone: number }>();
  const r = Math.max(1, Math.round(Math.min(stepS * 0.3, 0.035) * a.fps));
  const g0 = Math.ceil((0.25 - a.phase) / stepS);
  const g1 = Math.floor((a.duration - 0.3 - a.phase) / stepS);
  for (let g = g0; g <= g1; g++) {
    const fc = Math.round((a.phase + g * stepS - a.frameT0) * a.fps);
    let best = 0,
      bf = fc;
    for (let f = Math.max(0, fc - r); f <= Math.min(a.hit.length - 1, fc + r); f++)
      if (a.hit[f] > best) {
        best = a.hit[f];
        bf = f;
      }
    const pos = ((g % c.sub) + c.sub) % c.sub;
    const s = best * (pos === 0 ? 1 : pos % 2 === 0 ? 0.9 : 0.78);
    if (s > 0) slots.set(g, { s, tone: a.tone[bf] ?? 0.5 });
  }
  const want = Math.round(c.rate * a.duration);
  const kept = [...slots.entries()]
    .filter(([, v]) => v.s >= 0.1)
    .sort((x, y) => y[1].s - x[1].s)
    .slice(0, want)
    .sort((x, y) => x[0] - y[0]);
  if (kept.length < 8) throw new Error("Couldn't find enough beats to chart");
  const strong = [...kept].map(([, v]) => v.s).sort((x, y) => y - x)[Math.floor(kept.length * 0.08)] ?? 1;

  type N = { t: number; lane: number; sus: number; chord: boolean };
  const notes: N[] = [];
  let prev = -1;
  let prev2 = -1;
  let prevT = -1;
  for (let i = 0; i < kept.length; i++) {
    const [g, v] = kept[i];
    const t = a.phase + g * stepS;
    let lane = Math.min(3, Math.floor(v.tone * 4));
    const h = hash(g + 7);
    if (h % 5 === 0) lane = (lane + (h % 2 ? 1 : 3)) % 4; // a little variety
    const gap = prevT < 0 ? 99 : t - prevT;
    const tooClose = gap < beat * 0.99;
    if (lane === prev && (!c.jacks || prev2 === prev || tooClose)) lane = (lane + 1 + (h % 3)) % 4;
    if (lane === prev) lane = (lane + 1) % 4;
    const chord = c.chords && v.s >= strong && ((g % c.sub) + c.sub) % c.sub === 0 && h % 2 === 0;
    notes.push({ t, lane, sus: 0, chord });
    prev2 = prev;
    prev = lane;
    prevT = t;
  }
  // holds where the sound rings out until the next note
  if (c.hold) {
    const at = (t: number) => Math.round((t - a.frameT0) * a.fps);
    for (let i = 0; i < notes.length - 1; i++) {
      const n = notes[i];
      const gap = notes[i + 1].t - n.t;
      if (gap < beat * c.hold) continue;
      const f0 = at(n.t);
      const f1 = at(n.t + beat * 0.25);
      const f2 = at(n.t + gap - beat * 0.5);
      let base = 0;
      for (let f = f0; f < f0 + 4 && f < a.rms.length; f++) base = Math.max(base, a.rms[f] ?? 0);
      let s = 0,
        cnt = 0;
      for (let f = Math.max(0, f1); f < Math.min(a.rms.length, f2); f++, cnt++) s += a.rms[f];
      if (cnt && base > 0 && s / cnt >= base * 0.55) n.sus = Math.min(gap - beat * 0.75, beat * 4) * 1000;
    }
  }

  // sections = bars, aligned so beat 0 of every section is a downbeat
  const secS = 4 * beat;
  let offset = a.phase + a.bar * beat;
  offset -= secS * Math.ceil(offset / secS - 1e-9);
  const count = Math.ceil((a.duration - offset) / secS) + 1;
  const sections = Array.from({ length: count }, (_, i) => ({
    sectionNotes: [] as number[][],
    mustHitSection: Math.floor(i / 2) % 2 === 1,
    sectionBeats: 4,
    bpm: a.bpm,
    changeBPM: false,
    altAnim: false,
  }));
  let playerNotes = 0;
  for (const n of notes) {
    const si = Math.max(0, Math.min(count - 1, Math.floor((n.t - offset) / secS)));
    const sec = sections[si];
    const ms = Math.round(n.t * 10000) / 10;
    sec.sectionNotes.push([ms, n.lane, Math.round(n.sus)]);
    if (n.chord) sec.sectionNotes.push([ms, (n.lane + 2) % 4, Math.round(n.sus)]);
    if (sec.mustHitSection) playerNotes += n.chord ? 2 : 1;
  }
  return {
    json: { song: { song: title, bpm: a.bpm, speed: c.speed, offset: Math.round(offset * 10000) / 10, needsVoices: false, notes: sections } },
    playerNotes,
  };
}
