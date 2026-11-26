/** Tiny WebAudio synth for the sim games — no audio files, works offline. */

export type Sfx = "pickup" | "throw" | "clink" | "beep" | "error" | "coin" | "horn" | "quest" | "buy" | "ouch" | "pet";

let ctx: AudioContext | null = null;
let muted = false;

type AC = typeof AudioContext;

function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const C: AC | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: AC }).webkitAudioContext;
    if (!C) return null;
    try {
      ctx = new C();
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
  return ctx;
}

export function setMuted(m: boolean) {
  muted = m;
}
export function isMuted() {
  return muted;
}
/** Call from a click/touch handler so mobile browsers allow audio. */
export function unlockAudio() {
  ac();
}

function tone(c: AudioContext, t0: number, freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noise(c: AudioContext, t0: number, dur: number, vol: number, f0: number, f1: number, q = 1) {
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = "bandpass";
  f.Q.value = q;
  f.frequency.setValueAtTime(f0, t0);
  f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t0 + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(c.destination);
  src.start(t0);
}

export function play(name: Sfx) {
  if (muted) return;
  const c = ac();
  if (!c) return;
  const t = c.currentTime;
  switch (name) {
    case "pickup":
      tone(c, t, 520, 0.07, "triangle", 0.12, 780);
      break;
    case "throw": // whoosh
      noise(c, t, 0.22, 0.35, 400, 2600, 0.8);
      break;
    case "clink": // glass / can landing in the drum
      tone(c, t, 2100, 0.12, "triangle", 0.12);
      tone(c, t + 0.015, 3150, 0.09, "sine", 0.08);
      noise(c, t, 0.05, 0.12, 4000, 6000, 3);
      break;
    case "beep": // machine accepted
      tone(c, t, 1320, 0.11, "sine", 0.22);
      break;
    case "error": // machine rejected
      tone(c, t, 220, 0.14, "square", 0.14);
      tone(c, t + 0.19, 196, 0.2, "square", 0.14);
      break;
    case "coin":
      tone(c, t, 988, 0.07, "square", 0.08);
      tone(c, t + 0.07, 1319, 0.18, "square", 0.08);
      break;
    case "horn":
      tone(c, t, 392, 0.28, "sawtooth", 0.1);
      tone(c, t, 494, 0.28, "sawtooth", 0.08);
      break;
    case "ouch":
      tone(c, t, 300, 0.2, "sawtooth", 0.12, 90);
      break;
    case "quest":
      [523, 659, 784, 1047].forEach((f, i) => tone(c, t + i * 0.09, f, 0.18, "triangle", 0.16));
      break;
    case "buy":
      tone(c, t, 660, 0.08, "triangle", 0.15);
      tone(c, t + 0.08, 880, 0.14, "triangle", 0.15);
      break;
    case "pet":
      tone(c, t, 700, 0.06, "sine", 0.1, 1100);
      tone(c, t + 0.08, 900, 0.1, "sine", 0.1, 1300);
      break;
  }
}
