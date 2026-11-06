"use client";

// Soundboard: built-in synthesized sounds + your own uploaded clips (≤ 30 s, ≤ 100 MB) in the public "sounds" bucket.
// Playback/broadcast lives in call.ts (playSound) so everybody in the call hears it.

import { create } from "zustand";
import { supabase, errorText } from "./supabase";
import { useApp, toast } from "@/store/app";

export type Sound = { id: string; name: string; emoji: string; volume: number; duration: number; builtin?: string; url?: string; path?: string; size?: number };

export const MAX_SECONDS = 30;
export const MAX_BYTES = 100 * 1024 * 1024;
const BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/sounds/`;
export const soundUrl = (path: string) => BASE + path.split("/").map(encodeURIComponent).join("/");
export const isSoundUrl = (u: unknown): u is string => typeof u === "string" && u.startsWith(BASE) && u.length < 400 && !u.includes("..");

// ------------------------------------------------------------------ built-ins (synthesized, nothing to download)
type Synth = (c: OfflineAudioContext) => void;
const env = (g: GainNode, t: number, a: number, peak: number, d: number) => {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
};
const noise = (c: BaseAudioContext, secs: number) => {
  const b = c.createBuffer(1, Math.ceil(secs * c.sampleRate), c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const s = c.createBufferSource();
  s.buffer = b;
  return s;
};

const SYNTH: Record<string, { name: string; emoji: string; secs: number; make: Synth }> = {
  airhorn: {
    name: "Airhorn",
    emoji: "📯",
    secs: 1.9,
    make: (c) => {
      const out = c.createDynamicsCompressor();
      out.connect(c.destination);
      const shaper = c.createWaveShaper();
      const curve = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) {
        const x = (i / 1023) * 2 - 1;
        curve[i] = Math.tanh(x * 3);
      }
      shaper.curve = curve;
      const bp = c.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 1400;
      bp.Q.value = 0.6;
      shaper.connect(bp).connect(out);
      [
        [0, 0.16],
        [0.22, 0.16],
        [0.44, 1.3],
      ].forEach(([t, len]) => {
        const g = c.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.5, t + 0.02);
        g.gain.setValueAtTime(0.5, t + len - 0.05);
        g.gain.linearRampToValueAtTime(0, t + len);
        g.connect(shaper);
        for (const f of [466, 470, 233.5, 699]) {
          const o = c.createOscillator();
          o.type = "sawtooth";
          o.frequency.setValueAtTime(f * 0.97, t);
          o.frequency.linearRampToValueAtTime(f, t + 0.05);
          o.connect(g);
          o.start(t);
          o.stop(t + len);
        }
      });
    },
  },
  badumtss: {
    name: "Ba Dum Tss",
    emoji: "🥁",
    secs: 2.2,
    make: (c) => {
      const tom = (t: number, f0: number) => {
        const o = c.createOscillator();
        const g = c.createGain();
        o.frequency.setValueAtTime(f0, t);
        o.frequency.exponentialRampToValueAtTime(f0 * 0.45, t + 0.25);
        env(g, t, 0.004, 0.9, 0.3);
        o.connect(g).connect(c.destination);
        o.start(t);
        o.stop(t + 0.4);
      };
      tom(0, 200);
      tom(0.22, 140);
      const n = noise(c, 1.9);
      const hp = c.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 6500;
      const g = c.createGain();
      env(g, 0.5, 0.005, 0.5, 1.5);
      n.connect(hp).connect(g).connect(c.destination);
      n.start(0.5);
    },
  },
  ding: {
    name: "Ding",
    emoji: "🔔",
    secs: 2.2,
    make: (c) => {
      [
        [1320, 0.5],
        [2640, 0.15],
        [3960, 0.07],
        [1324, 0.3],
      ].forEach(([f, a]) => {
        const o = c.createOscillator();
        const g = c.createGain();
        o.frequency.value = f;
        env(g, 0, 0.003, a, 2);
        o.connect(g).connect(c.destination);
        o.start(0);
        o.stop(2.2);
      });
    },
  },
  sadtrombone: {
    name: "Sad Trombone",
    emoji: "🎺",
    secs: 3.4,
    make: (c) => {
      const lp = c.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 1500;
      lp.connect(c.destination);
      const notes = [233.08, 220, 207.65, 196];
      notes.forEach((f, k) => {
        const t = k * 0.55;
        const len = k === 3 ? 1.6 : 0.5;
        const o = c.createOscillator();
        o.type = "sawtooth";
        o.frequency.setValueAtTime(f, t);
        if (k === 3) {
          const lfo = c.createOscillator();
          const lg = c.createGain();
          lfo.frequency.value = 5.5;
          lg.gain.value = 6;
          lfo.connect(lg).connect(o.frequency);
          lfo.start(t);
          lfo.stop(t + len);
        }
        const g = c.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.35, t + 0.06);
        g.gain.setValueAtTime(0.35, t + len - 0.12);
        g.gain.linearRampToValueAtTime(0, t + len);
        o.connect(g).connect(lp);
        o.start(t);
        o.stop(t + len);
      });
    },
  },
  applause: {
    name: "Applause",
    emoji: "👏",
    secs: 3.2,
    make: (c) => {
      const bp = c.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 2200;
      bp.Q.value = 0.5;
      bp.connect(c.destination);
      for (let k = 0; k < 260; k++) {
        const t = Math.random() * 2.8;
        const n = noise(c, 0.05);
        const g = c.createGain();
        const loud = 0.15 + Math.random() * 0.25 * Math.min(1, (3 - t) / 1.2);
        env(g, t, 0.002, loud, 0.035);
        n.connect(g).connect(bp);
        n.start(t);
      }
    },
  },
  crickets: {
    name: "Crickets",
    emoji: "🦗",
    secs: 3,
    make: (c) => {
      for (let k = 0; k < 9; k++) {
        const t = k * 0.33;
        for (let j = 0; j < 4; j++) {
          const o = c.createOscillator();
          const g = c.createGain();
          o.frequency.value = 4400 + (k % 2) * 180;
          env(g, t + j * 0.035, 0.003, 0.12, 0.025);
          o.connect(g).connect(c.destination);
          o.start(t + j * 0.035);
          o.stop(t + j * 0.035 + 0.04);
        }
      }
    },
  },
  boom: {
    name: "Boom",
    emoji: "💥",
    secs: 2.5,
    make: (c) => {
      const o = c.createOscillator();
      const g = c.createGain();
      o.frequency.setValueAtTime(110, 0);
      o.frequency.exponentialRampToValueAtTime(32, 1.2);
      env(g, 0, 0.005, 1, 1.8);
      o.connect(g).connect(c.destination);
      o.start(0);
      o.stop(2.2);
      const n = noise(c, 2.4);
      const lp = c.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(3000, 0);
      lp.frequency.exponentialRampToValueAtTime(120, 1.5);
      const ng = c.createGain();
      env(ng, 0, 0.003, 0.7, 2.2);
      n.connect(lp).connect(ng).connect(c.destination);
      n.start(0);
    },
  },
  tada: {
    name: "Ta-da!",
    emoji: "🎉",
    secs: 2.2,
    make: (c) => {
      const lp = c.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 3200;
      lp.connect(c.destination);
      const chord = (t: number, fs: number[], len: number) =>
        fs.forEach((f) => {
          const o = c.createOscillator();
          o.type = "sawtooth";
          o.frequency.value = f;
          const g = c.createGain();
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(0.12, t + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, t + len);
          o.connect(g).connect(lp);
          o.start(t);
          o.stop(t + len);
        });
      chord(0, [523.25, 659.25, 783.99], 0.18);
      chord(0.2, [698.46, 880, 1046.5, 523.25], 1.9);
    },
  },
  boing: {
    name: "Boing",
    emoji: "🪀",
    secs: 1.2,
    make: (c) => {
      const o = c.createOscillator();
      o.type = "triangle";
      o.frequency.setValueAtTime(120, 0);
      o.frequency.exponentialRampToValueAtTime(520, 0.12);
      const lfo = c.createOscillator();
      const lg = c.createGain();
      lfo.frequency.setValueAtTime(14, 0);
      lfo.frequency.linearRampToValueAtTime(4, 1);
      lg.gain.setValueAtTime(140, 0);
      lg.gain.linearRampToValueAtTime(10, 1.1);
      lfo.connect(lg).connect(o.frequency);
      const g = c.createGain();
      env(g, 0, 0.005, 0.6, 1.1);
      o.connect(g).connect(c.destination);
      o.start(0);
      lfo.start(0);
      o.stop(1.2);
      lfo.stop(1.2);
    },
  },
};

export const BUILTINS: Sound[] = Object.entries(SYNTH).map(([id, s]) => ({ id: `b:${id}`, builtin: id, name: s.name, emoji: s.emoji, volume: 1, duration: s.secs }));
export const builtinMeta = (id: string) => SYNTH[id];

const PIN_KEY = "nexus.soundboard.pins";
const DEFAULT_PINS = BUILTINS.slice(0, 3).map((s) => s.id);

/** Up to 3 quick-fire sound IDs for the call bar. */
export function loadPinnedSounds(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(PIN_KEY) || "null") as string[] | null;
    if (Array.isArray(raw) && raw.length) return raw.filter(Boolean).slice(0, 3);
  } catch {
    /* ignore */
  }
  return [...DEFAULT_PINS];
}

export function savePinnedSounds(ids: string[]) {
  try {
    localStorage.setItem(PIN_KEY, JSON.stringify(ids.filter(Boolean).slice(0, 3)));
  } catch {
    /* ignore */
  }
}

export function togglePinnedSound(id: string): string[] {
  const cur = loadPinnedSounds();
  const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur.filter((x) => x !== id), id].slice(-3);
  savePinnedSounds(next);
  return next;
}

export function resolveSoundById(id: string, mine: Sound[] | null | undefined): Sound | null {
  return BUILTINS.find((s) => s.id === id) || mine?.find((s) => s.id === id) || null;
}

export async function renderBuiltin(id: string): Promise<AudioBuffer | null> {
  const s = SYNTH[id];
  if (!s) return null;
  const c = new OfflineAudioContext(2, Math.ceil(s.secs * 48000), 48000);
  s.make(c);
  return c.startRendering();
}

// ------------------------------------------------------------------ your uploaded sounds
export const useSounds = create<{ mine: Sound[] | null }>(() => ({ mine: null }));

type Row = { id: string; name: string; emoji: string; path: string; duration: number; size: number; volume: number };
const fromRow = (r: Row): Sound => ({ id: r.id, name: r.name, emoji: r.emoji, volume: r.volume, duration: r.duration, path: r.path, size: r.size, url: soundUrl(r.path) });

export async function loadMySounds(force = false) {
  if (useSounds.getState().mine && !force) return;
  const { data, error } = await supabase.from("soundboard_sounds").select("id,name,emoji,path,duration,size,volume").order("created_at", { ascending: false });
  if (error) return toast(errorText(error), "error");
  useSounds.setState({ mine: ((data ?? []) as Row[]).map(fromRow) });
}

/** decode a file to check its length (and to trim it) */
export async function decodeFile(file: File): Promise<AudioBuffer> {
  const c = new OfflineAudioContext(2, 48000, 48000);
  try {
    return await c.decodeAudioData(await file.arrayBuffer());
  } catch {
    throw new Error("That file isn't a playable audio file (try MP3, WAV, OGG or M4A)");
  }
}

/** cut [start, start+len) out of a decoded clip and encode it as a 16-bit WAV */
export function trimToWav(buf: AudioBuffer, start: number, len: number): Blob {
  const rate = buf.sampleRate;
  const from = Math.max(0, Math.floor(start * rate));
  const n = Math.min(buf.length - from, Math.floor(len * rate));
  const chs = Math.min(2, buf.numberOfChannels);
  const data = new DataView(new ArrayBuffer(44 + n * chs * 2));
  const str = (o: number, s: string) => [...s].forEach((ch, i) => data.setUint8(o + i, ch.charCodeAt(0)));
  str(0, "RIFF");
  data.setUint32(4, 36 + n * chs * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  data.setUint32(16, 16, true);
  data.setUint16(20, 1, true);
  data.setUint16(22, chs, true);
  data.setUint32(24, rate, true);
  data.setUint32(28, rate * chs * 2, true);
  data.setUint16(32, chs * 2, true);
  data.setUint16(34, 16, true);
  str(36, "data");
  data.setUint32(40, n * chs * 2, true);
  const ch = Array.from({ length: chs }, (_, k) => buf.getChannelData(k));
  const fade = Math.min(n / 4, rate * 0.015); // 15 ms fades: no clicks at the cut points
  let o = 44;
  for (let i = 0; i < n; i++) {
    const f = Math.min(1, i / fade, (n - 1 - i) / fade);
    for (let k = 0; k < chs; k++) {
      const v = Math.max(-1, Math.min(1, ch[k][from + i] * f));
      data.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      o += 2;
    }
  }
  return new Blob([data.buffer], { type: "audio/wav" });
}

const EXT: Record<string, string> = { "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/wav": "wav", "audio/x-wav": "wav", "audio/wave": "wav", "audio/ogg": "ogg", "audio/webm": "webm", "audio/aac": "aac", "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/m4a": "m4a", "audio/flac": "flac", "audio/x-flac": "flac", "audio/opus": "opus" };

/** upload a clip; `trim` = [start, length] seconds when the original is longer than 30 s */
export async function uploadSound(file: File, meta: { name: string; emoji: string; volume: number }, decoded: AudioBuffer, trim?: [number, number]) {
  const me = useApp.getState().userId;
  if (!me) throw new Error("Sign in first");
  if (file.size > MAX_BYTES) throw new Error("Max file size is 100 MB");
  let body: Blob = file;
  let type = file.type || "audio/mpeg";
  let duration = decoded.duration;
  if (trim || decoded.duration > MAX_SECONDS + 0.4) {
    const [start, len] = trim ?? [0, MAX_SECONDS];
    body = trimToWav(decoded, start, Math.min(MAX_SECONDS, len));
    type = "audio/wav";
    duration = Math.min(MAX_SECONDS, len, decoded.duration - start);
  }
  if (!EXT[type]) type = "audio/mpeg";
  if (body.size > MAX_BYTES) throw new Error("The clip is still over 100 MB");
  const path = `${me}/${crypto.randomUUID()}.${EXT[type]}`;
  const up = await supabase.storage.from("sounds").upload(path, body, { contentType: type, cacheControl: "31536000", upsert: false });
  if (up.error) throw new Error(errorText(up.error));
  const { data, error } = await supabase
    .from("soundboard_sounds")
    .insert({ owner_id: me, name: meta.name.trim().slice(0, 32) || "Sound", emoji: meta.emoji || "🔊", path, duration: Math.max(0.05, Math.min(30.5, duration)), size: body.size, volume: Math.max(0.05, Math.min(1, meta.volume)) })
    .select("id,name,emoji,path,duration,size,volume")
    .single();
  if (error) {
    void supabase.storage.from("sounds").remove([path]);
    throw new Error(errorText(error));
  }
  const s = fromRow(data as Row);
  useSounds.setState((st) => ({ mine: [s, ...(st.mine ?? [])] }));
  return s;
}

export async function updateSound(id: string, patch: Partial<Pick<Sound, "name" | "emoji" | "volume">>) {
  const { error } = await supabase.from("soundboard_sounds").update(patch).eq("id", id);
  if (error) return toast(errorText(error), "error");
  useSounds.setState((st) => ({ mine: (st.mine ?? []).map((s) => (s.id === id ? { ...s, ...patch } : s)) }));
}

export async function deleteSound(s: Sound) {
  const { error } = await supabase.from("soundboard_sounds").delete().eq("id", s.id);
  if (error) return toast(errorText(error), "error");
  if (s.path) void supabase.storage.from("sounds").remove([s.path]);
  useSounds.setState((st) => ({ mine: (st.mine ?? []).filter((x) => x.id !== s.id) }));
}
