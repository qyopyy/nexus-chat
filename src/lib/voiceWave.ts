// A voice message carries its own waveform and length inside its file name, e.g.
//   voice-1764300000000-d63-p9ab43...(36 chars).m4a
// so the bubble draws the exact waveform the instant it's sent, on every device, with no decoding or waiting.

export const VOICE_BARS = 36;
const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";
const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/** Squeezes a level history (0..1) into `bars` bars, normalised so the loudest bar is full height. */
export function downsamplePeaks(levels: number[], bars = VOICE_BARS): number[] {
  if (!levels.length) return Array(bars).fill(0.12);
  const out: number[] = [];
  for (let b = 0; b < bars; b++) {
    const from = Math.floor((b * levels.length) / bars);
    const to = Math.max(from + 1, Math.floor(((b + 1) * levels.length) / bars));
    let peak = 0;
    let sum = 0;
    for (let i = from; i < to && i < levels.length; i++) {
      peak = Math.max(peak, clamp01(levels[i]));
      sum += clamp01(levels[i]);
    }
    const avg = sum / (to - from);
    out.push(peak * 0.6 + avg * 0.4);
  }
  const max = Math.max(...out, 0.0001);
  return out.map((v) => Math.max(0.12, Math.min(1, v / max)));
}

export function encodePeaks(peaks: number[]): string {
  return peaks
    .slice(0, VOICE_BARS)
    .map((p) => ALPHABET[Math.round(clamp01(p) * 35)])
    .join("")
    .padEnd(VOICE_BARS, "0");
}

export function decodePeaks(s: string): number[] | null {
  if (!new RegExp(`^[0-9a-z]{${VOICE_BARS}}$`).test(s)) return null;
  return [...s].map((c) => Math.max(0.12, ALPHABET.indexOf(c) / 35));
}

/** The file name a voice message is sent under. */
export function voiceName(ts: number, seconds: number, peaks: number[], ext: string): string {
  return `voice-${Math.round(ts)}-d${Math.max(0, Math.round(seconds))}-p${encodePeaks(peaks)}.${ext.replace(/[^a-z0-9]/gi, "")}`;
}

/** Reads the waveform and length back out of a voice file name (null for older voice messages). */
export function parseVoiceName(name: string | null | undefined): { duration: number; peaks: number[] } | null {
  const m = /^voice-\d+-d(\d{1,5})-p([0-9a-z]{36})\./i.exec(name ?? "");
  if (!m) return null;
  const peaks = decodePeaks(m[2].toLowerCase());
  return peaks ? { duration: Number(m[1]), peaks } : null;
}

/** A decode that came back as silence or a flat line is a failed decode, never a real waveform. */
export function isFlat(peaks: number[]): boolean {
  if (!peaks.length || peaks.some((p) => !Number.isFinite(p))) return true;
  return Math.max(...peaks) - Math.min(...peaks) < 0.02;
}

/** Loudness 0.08..1 of one slice of microphone samples (Web Audio byte samples, 128 = silence). */
export function levelFromBytes(buf: ArrayLike<number>): number {
  if (!buf.length) return 0.08;
  let sum = 0;
  let peak = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = (buf[i] - 128) / 128;
    sum += v * v;
    peak = Math.max(peak, Math.abs(v));
  }
  const rms = Math.sqrt(sum / buf.length);
  const x = Math.pow(Math.min(1, rms * 3.4 + peak * 0.5), 0.8);
  return Math.max(0.08, Math.min(1, x));
}

/** Recorded time in ms, not counting pauses. `pauseAt` is when the current pause began (null = running). */
export function elapsedMs(started: number, pausedTotal: number, pauseAt: number | null, now: number): number {
  const end = pauseAt ?? now;
  return Math.max(0, end - started - pausedTotal);
}

export const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
