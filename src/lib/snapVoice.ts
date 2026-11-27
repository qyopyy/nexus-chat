// Nexus Snap · voice messages (iPhone Voice Memos style): pure helpers for recording, waveform and timers.

/** one waveform bar = 50 ms of audio, both while recording and when playing back */
export const SLICE_MS = 50;
export const VOICE_MAX_MS = 5 * 60 * 1000;

/** Best audio format this browser can record: mp4/aac first (plays on every iPhone), then opus in webm/ogg. */
export function pickAudioMime(isSupported: (mime: string) => boolean): { mime: string; ext: string } | null {
  const list = [
    { mime: "audio/mp4;codecs=mp4a.40.2", ext: "m4a" },
    { mime: "audio/mp4", ext: "m4a" },
    { mime: "audio/webm;codecs=opus", ext: "webm" },
    { mime: "audio/webm", ext: "webm" },
    { mime: "audio/ogg;codecs=opus", ext: "ogg" },
  ];
  for (const c of list) {
    try {
      if (isSupported(c.mime)) return c;
    } catch {
      /* ignore */
    }
  }
  return null;
}

/** Chat recognises voice notes by this name + an audio/* type, so replies show up as normal voice messages in Nexus chat. */
export const voiceFileName = (d: Date, ext: string) => `voice-${d.getTime()}.${ext.replace(/^\./, "")}`;
export const isVoiceName = (name: string | null | undefined) => !!name && name.startsWith("voice-");

const p2 = (n: number) => String(n).padStart(2, "0");
/** 0:07.43 (minutes, seconds, hundredths) like the Voice Memos timer; 1:02:03.40 from an hour */
export function formatTimer(ms: number): string {
  const t = Math.max(0, Math.floor((ms || 0) / 10));
  const cs = t % 100;
  const s = Math.floor(t / 100) % 60;
  const m = Math.floor(t / 6000) % 60;
  const h = Math.floor(t / 360000);
  return `${h ? `${h}:${p2(m)}` : m}:${p2(s)}.${p2(cs)}`;
}
/** 0:07 for lists and bubbles */
export function formatClock(sec: number): string {
  const t = Math.max(0, Math.floor(sec || 0));
  return `${Math.floor(t / 60)}:${p2(t % 60)}`;
}

/** loudness 0..1 of one analyser frame (getByteTimeDomainData: silence = 128) */
export function rmsLevel(bytes: ArrayLike<number>): number {
  const n = bytes.length;
  if (!n) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const v = (bytes[i] - 128) / 128;
    sum += v * v;
  }
  return Math.min(1, Math.sqrt(sum / n));
}

/** loudness → bar height 0.04..1 (speech sits around the middle, silence stays a thin line) */
export function levelToBar(rms: number): number {
  const v = Math.pow(Math.max(0, rms) * 4.2, 0.62);
  return Math.max(0.04, Math.min(1, v));
}

/** Stretches or squeezes `peaks` to exactly n bars (max of each bucket, so spikes survive). */
export function resamplePeaks(peaks: ArrayLike<number>, n: number): number[] {
  const len = peaks.length;
  if (n <= 0) return [];
  if (!len) return new Array(n).fill(0.04);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = Math.floor((i * len) / n);
    const b = Math.max(a + 1, Math.floor(((i + 1) * len) / n));
    let m = 0;
    for (let j = a; j < b && j < len; j++) m = Math.max(m, peaks[j]);
    out.push(m);
  }
  return out;
}

/** Decoded samples → n bars 0.04..1 (normalised to the loudest bar, so quiet recordings still look alive). */
export function peaksFromChannel(data: ArrayLike<number>, n: number): number[] {
  if (n <= 0) return [];
  if (!data.length) return new Array(n).fill(0.04);
  const step = Math.max(1, Math.floor(data.length / n));
  const raw: number[] = [];
  for (let b = 0; b < n; b++) {
    let sum = 0;
    let cnt = 0;
    for (let i = b * step; i < (b + 1) * step && i < data.length; i += 8) {
      sum += data[i] * data[i];
      cnt++;
    }
    raw.push(cnt ? Math.sqrt(sum / cnt) : 0);
  }
  const max = Math.max(...raw, 1e-6);
  return raw.map((r) => Math.max(0.04, Math.min(1, Math.pow(r / max, 0.7))));
}

/** number of 50 ms bars for a clip */
export const barsForDuration = (sec: number) => Math.max(1, Math.round((sec * 1000) / SLICE_MS));

/** seek position (seconds) after dragging the scrolling waveform by dx pixels (dragging left moves forward in time) */
export function seekFromDrag(startSec: number, dxPx: number, stepPx: number, durationSec: number): number {
  const sec = startSec - (dxPx / Math.max(1, stepPx)) * (SLICE_MS / 1000);
  return Math.max(0, Math.min(durationSec, sec));
}
