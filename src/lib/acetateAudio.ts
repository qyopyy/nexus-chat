/** Browser-side audio helpers for Acetate. Waveform peaks are stored with the version. */

const AUDIO_EXT = new Set(["mp3", "wav", "flac", "aiff", "aif", "aac", "m4a", "ogg", "webm", "opus"]);
const ART_EXT = new Set(["jpg", "jpeg", "png", "webp"]);

export function fileExt(name: string) {
  return (name.split(".").pop() || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function audioExt(name: string) {
  const ext = fileExt(name);
  if (ext === "aif") return "aiff";
  return AUDIO_EXT.has(ext) ? ext : null;
}

export function artExt(name: string) {
  const ext = fileExt(name);
  if (ext === "jpeg") return "jpg";
  return ART_EXT.has(ext) ? ext : null;
}

export function mimeForExt(ext: string) {
  const map: Record<string, string> = {
    mp3: "audio/mpeg",
    wav: "audio/wav",
    flac: "audio/flac",
    aiff: "audio/aiff",
    aif: "audio/aiff",
    aac: "audio/aac",
    m4a: "audio/mp4",
    ogg: "audio/ogg",
    webm: "audio/webm",
    opus: "audio/opus",
    jpg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
  };
  return map[ext] || "application/octet-stream";
}

export function asPeaks(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const out: number[] = [];
  for (const n of value) {
    const v = typeof n === "number" ? n : Number(n);
    if (!Number.isFinite(v)) continue;
    out.push(Math.max(0, Math.min(1, v)));
    if (out.length >= 240) break;
  }
  return out;
}

export function fmtTime(sec: number | null | undefined) {
  if (sec == null || !Number.isFinite(sec)) return "0:00";
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export function fmtBytes(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n) || n < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  const digits = i === 0 ? 0 : 1;
  return `${v.toFixed(digits)} ${units[i]}`;
}

function durationFallback(file: Blob) {
  return new Promise<number | null>((resolve) => {
    try {
      const audio = new Audio();
      const url = URL.createObjectURL(file);
      const done = (value: number | null) => {
        URL.revokeObjectURL(url);
        resolve(value);
      };
      audio.preload = "metadata";
      audio.onloadedmetadata = () => done(Number.isFinite(audio.duration) ? audio.duration : null);
      audio.onerror = () => done(null);
      audio.src = url;
      setTimeout(() => done(null), 5000);
    } catch {
      resolve(null);
    }
  });
}

/** Decode a local file into a duration and a compact peak envelope. Large masters skip the full decode. */
export async function describeAudio(file: Blob): Promise<{ duration: number | null; peaks: number[] }> {
  if (file.size > 32 * 1024 * 1024) {
    return { duration: await durationFallback(file), peaks: [] };
  }
  try {
    const ctx = new AudioContext();
    const raw = await file.arrayBuffer();
    const buf = await ctx.decodeAudioData(raw.slice(0));
    const channel = buf.getChannelData(0);
    const bars = 160;
    const step = Math.max(1, Math.floor(channel.length / bars));
    const peaks: number[] = [];
    for (let i = 0; i < bars; i += 1) {
      let max = 0;
      const start = i * step;
      const end = Math.min(channel.length, start + step);
      for (let j = start; j < end; j += 16) {
        const sample = Math.abs(channel[j] || 0);
        if (sample > max) max = sample;
      }
      peaks.push(Math.round(Math.min(1, max) * 1000) / 1000);
    }
    const duration = Number.isFinite(buf.duration) ? buf.duration : null;
    await ctx.close().catch(() => undefined);
    return { duration, peaks };
  } catch {
    return { duration: await durationFallback(file), peaks: [] };
  }
}
