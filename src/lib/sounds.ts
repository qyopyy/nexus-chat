// Tiny synthesized UI sounds — no audio assets needed.

let ctx: AudioContext | null = null;
function audio() {
  if (typeof window === "undefined") return null;
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(freqs: number[], dur = 0.09, gap = 0.02, vol = 0.12, type: OscillatorType = "sine") {
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

export const sfx = {
  join: () => tone([523, 784], 0.1),
  leave: () => tone([784, 523], 0.1),
  mute: () => tone([440, 330], 0.06, 0.01, 0.08),
  unmute: () => tone([330, 440], 0.06, 0.01, 0.08),
  message: () => tone([880], 0.07, 0, 0.06, "triangle"),
  screenOn: () => tone([660, 880, 990], 0.06),
  screenOff: () => tone([990, 880, 660], 0.06),
};

let ringTimer: ReturnType<typeof setInterval> | null = null;
export function startRing(outgoing = false) {
  stopRing();
  const play = () => (outgoing ? tone([440, 440], 0.35, 0.25, 0.06) : tone([659, 784, 659, 784], 0.12, 0.04, 0.1, "triangle"));
  play();
  ringTimer = setInterval(play, outgoing ? 3000 : 1800);
}
export function stopRing() {
  if (ringTimer) clearInterval(ringTimer);
  ringTimer = null;
}
