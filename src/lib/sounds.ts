// Tiny synthesized UI sounds — no audio assets needed.
import { prefs, type MessageSoundId } from "./prefs";

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

type Note = { f: number; at?: number; d?: number; type?: OscillatorType; vol?: number };

function playNotes(notes: Note[], baseVol: number) {
  const p = prefs();
  if (!p.uiSounds) return;
  const volMul = Math.max(0, (p.uiVolume ?? 1) * baseVol);
  if (volMul <= 0) return;
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime;
  for (const n of notes) {
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = n.type ?? "sine";
    o.frequency.value = n.f;
    const t = t0 + (n.at ?? 0);
    const d = n.d ?? 0.1;
    const v = volMul * (n.vol ?? 1);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(a.destination);
    o.start(t);
    o.stop(t + d + 0.04);
  }
}

/** Soft noise burst for pop / wood styles */
function noiseBurst(dur: number, vol: number, filterFreq: number) {
  const p = prefs();
  if (!p.uiSounds) return;
  const v = Math.max(0, (p.uiVolume ?? 1) * vol);
  if (v <= 0) return;
  const a = audio();
  if (!a) return;
  const n = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, n, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = filterFreq;
  f.Q.value = 1.2;
  const g = a.createGain();
  const t = a.currentTime;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(v, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(a.destination);
  src.start(t);
  src.stop(t + dur + 0.02);
}

export const MESSAGE_SOUNDS: { id: MessageSoundId; label: string; hint: string }[] = [
  { id: "ping", label: "Ping", hint: "Classic short triangle blip" },
  { id: "pop", label: "Pop", hint: "Soft bubble pop" },
  { id: "chime", label: "Chime", hint: "Two-note soft chime" },
  { id: "crystal", label: "Crystal", hint: "Bright glassy sparkle" },
  { id: "soft", label: "Soft", hint: "Quiet sine tick" },
  { id: "wood", label: "Wood", hint: "Warm wooden tap" },
  { id: "glass", label: "Glass", hint: "Light glass tip" },
  { id: "arcade", label: "Arcade", hint: "8-bit coin blip" },
  { id: "buzz", label: "Buzz", hint: "Soft square pulse" },
  { id: "wave", label: "Wave", hint: "Rising whoosh note" },
  { id: "knock", label: "Knock", hint: "Double soft knock" },
  { id: "none", label: "None", hint: "Silent for this event" },
];

function playMessageSound(id: MessageSoundId, kind: "send" | "recv", opts?: { preview?: boolean }) {
  if (id === "none") return;
  const p = prefs();
  if (!p.uiSounds) return;
  if (!opts?.preview) {
    if (kind === "send" && p.sendSounds === false) return;
    if (kind === "recv" && p.messageSounds === false) return;
  }

  switch (id) {
    case "ping":
      playNotes([{ f: kind === "send" ? 740 : 880, d: 0.07, type: "triangle" }], 0.07);
      break;
    case "pop":
      noiseBurst(0.045, 0.1, kind === "send" ? 900 : 1200);
      playNotes([{ f: kind === "send" ? 420 : 520, d: 0.05, type: "sine", vol: 0.6 }], 0.08);
      break;
    case "chime":
      playNotes(
        kind === "send"
          ? [
              { f: 659.25, d: 0.1, type: "sine" },
              { f: 523.25, at: 0.06, d: 0.14, type: "sine" },
            ]
          : [
              { f: 523.25, d: 0.1, type: "sine" },
              { f: 783.99, at: 0.07, d: 0.16, type: "sine" },
            ],
        0.09,
      );
      break;
    case "crystal":
      playNotes(
        [
          { f: kind === "send" ? 1046 : 1174, d: 0.08, type: "sine" },
          { f: kind === "send" ? 1568 : 1760, at: 0.03, d: 0.12, type: "triangle", vol: 0.55 },
        ],
        0.07,
      );
      break;
    case "soft":
      playNotes([{ f: kind === "send" ? 560 : 640, d: 0.09, type: "sine" }], 0.045);
      break;
    case "wood":
      noiseBurst(0.03, 0.12, 380);
      playNotes([{ f: kind === "send" ? 180 : 210, d: 0.06, type: "triangle" }], 0.1);
      break;
    case "glass":
      playNotes(
        [
          { f: kind === "send" ? 1480 : 1760, d: 0.05, type: "sine" },
          { f: kind === "send" ? 2220 : 2480, at: 0.02, d: 0.1, type: "sine", vol: 0.45 },
        ],
        0.055,
      );
      break;
    case "arcade":
      playNotes(
        kind === "send"
          ? [
              { f: 880, d: 0.05, type: "square" },
              { f: 1175, at: 0.05, d: 0.07, type: "square" },
            ]
          : [
              { f: 988, d: 0.045, type: "square" },
              { f: 1319, at: 0.045, d: 0.08, type: "square" },
            ],
        0.04,
      );
      break;
    case "buzz":
      playNotes([{ f: kind === "send" ? 260 : 300, d: 0.08, type: "square" }], 0.035);
      break;
    case "wave":
      playNotes(
        [
          { f: kind === "send" ? 320 : 360, d: 0.14, type: "sine" },
          { f: kind === "send" ? 480 : 540, at: 0.05, d: 0.16, type: "sine", vol: 0.7 },
        ],
        0.06,
      );
      break;
    case "knock":
      playNotes(
        [
          { f: 140, d: 0.05, type: "triangle" },
          { f: 160, at: 0.09, d: 0.05, type: "triangle" },
        ],
        0.1,
      );
      break;
    default:
      playNotes([{ f: 880, d: 0.07, type: "triangle" }], 0.06);
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
  /** Incoming message — uses prefs.messageSound */
  message: () => playMessageSound(prefs().messageSound ?? "ping", "recv"),
  /** Outgoing send — uses prefs.sendSound */
  send: () => playMessageSound(prefs().sendSound ?? "pop", "send"),
  /** Preview a pack from settings (still respects App sounds + volume) */
  previewMessage: (id: MessageSoundId, kind: "send" | "recv" = "recv") => playMessageSound(id, kind, { preview: true }),
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
