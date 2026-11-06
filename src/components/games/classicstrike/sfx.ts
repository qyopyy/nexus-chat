/** Procedural Strike SFX — no asset packs; soft volume for mobile. */

let ctx: AudioContext | null = null;
let unlocked = false;

function ac() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new Ctx();
  }
  if (ctx.state === "suspended") void ctx.resume();
  unlocked = true;
  return ctx;
}

export function unlockStrikeAudio() {
  ac();
}

function beep(freq: number, dur: number, type: OscillatorType, gain = 0.08, slide = 0) {
  const c = ac();
  if (!c || !unlocked) return;
  const t0 = c.currentTime;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g);
  g.connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noise(dur: number, gain = 0.05) {
  const c = ac();
  if (!c || !unlocked) return;
  const n = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, n, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  g.gain.value = gain;
  const f = c.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = 1800;
  src.connect(f);
  f.connect(g);
  g.connect(c.destination);
  src.start();
}

export const strikeSfx = {
  fire: (heavy?: boolean) => {
    noise(heavy ? 0.12 : 0.06, heavy ? 0.09 : 0.055);
    beep(heavy ? 120 : 220, 0.05, "square", 0.04, heavy ? -60 : -100);
  },
  hit: () => beep(880, 0.04, "triangle", 0.06),
  kill: () => {
    beep(660, 0.06, "sawtooth", 0.05, -200);
    beep(990, 0.08, "triangle", 0.04);
  },
  plant: () => {
    beep(440, 0.08, "square", 0.05);
    setTimeout(() => beep(660, 0.1, "square", 0.05), 100);
  },
  tick: () => beep(520, 0.03, "square", 0.035),
  defuse: () => beep(320, 0.15, "sine", 0.06, 200),
  buy: () => beep(520, 0.05, "triangle", 0.045),
  death: () => {
    noise(0.2, 0.07);
    beep(180, 0.25, "sawtooth", 0.05, -120);
  },
  round: () => {
    beep(300, 0.1, "square", 0.05);
    setTimeout(() => beep(450, 0.12, "square", 0.05), 120);
  },
};
