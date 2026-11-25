// TikTok Sound Studio — pure helpers: clip rendering (fades, loudness), hook finder, WAV encoding and the
// copy-paste details for TikTok / SoundOn / distributor hand-off. No imports so it can be unit-tested with node.

export type ClipOpts = { fadeIn: number; fadeOut: number; normalize: boolean };

export function peaksOf(ch: Float32Array, bins: number): number[] {
  const out: number[] = new Array(bins).fill(0);
  if (!ch.length) return out;
  const step = ch.length / bins;
  for (let b = 0; b < bins; b++) {
    let m = 0;
    const from = Math.floor(b * step);
    const to = Math.min(ch.length, Math.floor((b + 1) * step));
    const hop = Math.max(1, Math.floor((to - from) / 64));
    for (let i = from; i < to; i += hop) m = Math.max(m, Math.abs(ch[i]));
    out[b] = m;
  }
  return out;
}

/** loudest `len`-second window (by short-term energy) — a decent guess for the hook / chorus */
export function findHook(ch: Float32Array, rate: number, len: number): number {
  const total = ch.length / rate;
  if (total <= len) return 0;
  const slice = 0.5;
  const n = Math.max(1, Math.floor(total / slice));
  const e: number[] = [];
  for (let k = 0; k < n; k++) {
    let s = 0;
    const from = Math.floor(k * slice * rate);
    const to = Math.min(ch.length, Math.floor((k + 1) * slice * rate));
    const hop = Math.max(1, Math.floor((to - from) / 400));
    let c = 0;
    for (let i = from; i < to; i += hop) {
      s += ch[i] * ch[i];
      c++;
    }
    e.push(c ? s / c : 0);
  }
  const w = Math.max(1, Math.round(len / slice));
  const minStart = Math.floor(n * 0.05); // skip silent intros
  let best = 0;
  let bestV = -1;
  let run = 0;
  for (let i = 0; i < Math.min(w, n); i++) run += e[i];
  for (let k = 0; k + w <= n; k++) {
    if (k > 0) run += e[k + w - 1] - e[k - 1];
    if (k >= minStart && run > bestV) {
      bestV = run;
      best = k;
    }
  }
  return Math.min(total - len, best * slice);
}

/** cut [start, start+len) with fades and optional peak-normalise to −1 dBFS */
export function renderClip(channels: Float32Array[], rate: number, start: number, len: number, o: ClipOpts): Float32Array[] {
  const chs = channels.slice(0, 2);
  const from = Math.max(0, Math.floor(start * rate));
  const n = Math.max(0, Math.min((chs[0]?.length ?? 0) - from, Math.floor(len * rate)));
  const fi = Math.min(n / 2, Math.max(0.015, o.fadeIn) * rate);
  const fo = Math.min(n / 2, Math.max(0.015, o.fadeOut) * rate);
  let peak = 0;
  const out = chs.map((c) => {
    const x = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const f = Math.min(1, i / fi, (n - 1 - i) / fo);
      const v = c[from + i] * f;
      x[i] = v;
      if (Math.abs(v) > peak) peak = Math.abs(v);
    }
    return x;
  });
  if (o.normalize && peak > 0.001) {
    const g = 0.891 / peak; // −1 dBFS
    for (const x of out) for (let i = 0; i < n; i++) x[i] = Math.max(-1, Math.min(1, x[i] * g));
  }
  return out;
}

export function wavBytes(chs: Float32Array[], rate: number): Uint8Array {
  const c = chs.length;
  const n = chs[0]?.length ?? 0;
  const data = new DataView(new ArrayBuffer(44 + n * c * 2));
  const str = (o: number, s: string) => [...s].forEach((ch, i) => data.setUint8(o + i, ch.charCodeAt(0)));
  str(0, "RIFF");
  data.setUint32(4, 36 + n * c * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  data.setUint32(16, 16, true);
  data.setUint16(20, 1, true);
  data.setUint16(22, c, true);
  data.setUint32(24, rate, true);
  data.setUint32(28, rate * c * 2, true);
  data.setUint16(32, c * 2, true);
  data.setUint16(34, 16, true);
  str(36, "data");
  data.setUint32(40, n * c * 2, true);
  let o = 44;
  for (let i = 0; i < n; i++)
    for (let k = 0; k < c; k++) {
      const v = Math.max(-1, Math.min(1, chs[k][i]));
      data.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      o += 2;
    }
  return new Uint8Array(data.buffer);
}

export const safeFile = (s: string) => (s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "").trim().slice(0, 80) || "sound");

export type SoundMeta = { name: string; artist: string; isrc?: string | null; seconds: number };

/** details to paste into TikTok / SoundOn / a distributor */
export function handoffText(m: SoundMeta): string {
  const name = m.name.trim().slice(0, 100) || "Untitled sound";
  const artist = m.artist.trim().slice(0, 100);
  const dur = `${Math.floor(m.seconds / 60)}:${String(Math.round(m.seconds % 60)).padStart(2, "0")}`;
  return [`Sound name: ${name}`, artist && `Artist: ${artist}`, `Length: ${dur}`, m.isrc ? `ISRC: ${m.isrc}` : "", `Suggested caption: ${name}${artist ? ` — ${artist}` : ""} #newmusic #sound`]
    .filter(Boolean)
    .join("\n");
}
