// Tiny synthesized UI sounds — no audio assets needed.
import { prefs } from "./prefs";

let ctx: AudioContext | null = null;
function audio() {
  if (typeof window === "undefined") return null;
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(freqs: number[], dur = 0.09, gap = 0.02, vol = 0.12, type: OscillatorType = "sine", ring = false) {
  const p = prefs();
  if (ring ? !p.ringtone : !p.uiSounds) return;
  vol *= p.uiVolume;
  if (vol <= 0) return;
  const a = audio();
  if (!a) return;
  let t = a.currentTime;
  for (const f of freqs) {
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.value = f;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
    t += dur + gap;
  }
}

function clickTone() {
  const p = prefs();
  if (p.buttonFx === false) return;
  const vol = Math.max(0, (p.uiVolume ?? 1) * 0.07);
  if (vol <= 0) return;
  const a = audio();
  if (!a) return;
  const t = a.currentTime;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = "triangle";
  o.frequency.setValueAtTime(920, t);
  o.frequency.exponentialRampToValueAtTime(420, t + 0.045);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + 0.06);
}

/** Soft Discord-like welcome / login chime (respects welcomeSplash + volume). */
function welcomeTone(egg = false) {
  const p = prefs();
  if (p.welcomeSplash === false) return;
  const vol = Math.max(0, (p.uiVolume ?? 1) * (egg ? 0.16 : 0.14));
  if (vol <= 0) return;
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + 0.02;
  const notes = egg
    ? [
        { f: 392, at: 0, d: 0.18 },
        { f: 523.25, at: 0.12, d: 0.2 },
        { f: 659.25, at: 0.26, d: 0.28 },
        { f: 783.99, at: 0.42, d: 0.45 },
      ]
    : [
        { f: 523.25, at: 0, d: 0.22 },
        { f: 659.25, at: 0.08, d: 0.28 },
        { f: 783.99, at: 0.18, d: 0.42 },
      ];
  for (const n of notes) {
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = "sine";
    o.frequency.value = n.f;
    const t = t0 + n.at;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + n.d);
    o.connect(g).connect(a.destination);
    o.start(t);
    o.stop(t + n.d + 0.05);
  }
}

export const sfx = {
  join: () => tone([523, 784], 0.1),
  leave: () => tone([784, 523], 0.1),
  mute: () => tone([440, 330], 0.06, 0.01, 0.08),
  unmute: () => tone([330, 440], 0.06, 0.01, 0.08),
  message: () => tone([880], 0.07, 0, 0.06, "triangle"),
  screenOn: () => tone([660, 880, 990], 0.06),
  screenOff: () => tone([990, 880, 660], 0.06),
  /** Soft UI button / control click — uses prefs.buttonFx */
  click: () => clickTone(),
  welcome: () => welcomeTone(false),
  discordo: () => welcomeTone(true),
};

let ringTimer: ReturnType<typeof setInterval> | null = null;
export function startRing(outgoing = false) {
  stopRing();
  const play = () => (outgoing ? tone([440, 440], 0.35, 0.25, 0.06, "sine", true) : tone([659, 784, 659, 784], 0.12, 0.04, 0.1, "triangle", true));
  play();
  ringTimer = setInterval(play, outgoing ? 3000 : 1800);
}
export function stopRing() {
  if (ringTimer) clearInterval(ringTimer);
  ringTimer = null;
}
