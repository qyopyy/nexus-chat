"use client";

// Tiny camera sounds made with Web Audio (no files to load). Browsers only allow sound after a tap, which is when these play.

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    ctx ??= new C();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, ms: number, gain = 0.15, type: OscillatorType = "sine", delayMs = 0) {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + delayMs / 1000;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + ms / 1000);
  o.connect(g).connect(a.destination);
  o.start(t0);
  o.stop(t0 + ms / 1000 + 0.02);
}

export const shutterClick = () => {
  tone(1800, 40, 0.18, "square");
  tone(900, 70, 0.12, "square", 45);
};
export const timerBeep = (last = false) => tone(last ? 1320 : 880, last ? 220 : 90, 0.14);
