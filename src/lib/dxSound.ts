"use client";

/**
 * Distro workspace sound effects — tiny synthesized UI sounds (no audio files).
 * On/off + volume are a per-browser preference (localStorage), toggled in Distro → Settings → Preferences.
 */
import { create } from "zustand";

type SoundPrefs = { on: boolean; volume: number };
const KEY = "nexus-distro-sfx";

function read(): SoundPrefs {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "null");
    if (v && typeof v.on === "boolean") return { on: v.on, volume: Math.min(1, Math.max(0, Number(v.volume) || 0.6)) };
  } catch {
    /* private mode */
  }
  return { on: true, volume: 0.6 };
}

export const useDxSound = create<SoundPrefs & { loaded: boolean }>(() => ({ on: true, volume: 0.6, loaded: false }));

export function loadDxSound() {
  if (typeof window === "undefined") return;
  useDxSound.setState({ ...read(), loaded: true });
}
export function setDxSound(p: Partial<SoundPrefs>) {
  const next = { on: useDxSound.getState().on, volume: useDxSound.getState().volume, ...p };
  useDxSound.setState(next);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private mode */
  }
}

let ctx: AudioContext | null = null;
function ac() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const C = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

type Note = { f: number; to?: number; at?: number; d: number; type?: OscillatorType; g?: number };
function play(notes: Note[], force = false) {
  const { on, volume } = useDxSound.getState();
  if ((!on && !force) || volume <= 0) return;
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + 0.005;
  const master = a.createGain();
  master.gain.value = volume * 0.5;
  master.connect(a.destination);
  for (const n of notes) {
    const o = a.createOscillator();
    const g = a.createGain();
    const t = t0 + (n.at ?? 0);
    o.type = n.type ?? "sine";
    o.frequency.setValueAtTime(n.f, t);
    if (n.to) o.frequency.exponentialRampToValueAtTime(n.to, t + n.d);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(n.g ?? 0.18, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + n.d);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + n.d + 0.03);
  }
}

export const dxSfx = {
  /** soft tick for buttons */
  click: () => play([{ f: 1800, to: 900, d: 0.035, type: "triangle", g: 0.09 }]),
  /** moving between pages */
  nav: () => play([{ f: 620, to: 760, d: 0.07, type: "sine", g: 0.08 }]),
  /** switches, tabs, segmented controls */
  toggle: () => play([{ f: 980, d: 0.03, type: "square", g: 0.035 }, { f: 1320, at: 0.035, d: 0.04, type: "square", g: 0.03 }]),
  success: () => play([{ f: 660, d: 0.12, g: 0.12 }, { f: 990, at: 0.08, d: 0.2, g: 0.12 }]),
  error: () => play([{ f: 300, to: 220, d: 0.18, type: "triangle", g: 0.14 }, { f: 240, at: 0.1, to: 180, d: 0.2, type: "triangle", g: 0.12 }]),
  /** preview from settings even if muted */
  preview: () => play([{ f: 660, d: 0.12, g: 0.12 }, { f: 990, at: 0.08, d: 0.2, g: 0.12 }], true),
};
