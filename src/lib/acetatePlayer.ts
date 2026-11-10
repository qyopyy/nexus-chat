"use client";

import { create } from "zustand";

export type AcetateQueueItem = {
  key: string;
  trackId: string;
  versionId: string;
  title: string;
  versionLabel: string;
  artist: string;
  album: string | null;
  artUrl: string | null;
  peaks: number[];
  duration: number;
  url: string;
  shareUrl: string | null;
};

export type AcetateRepeat = "off" | "all" | "one";

type PlayerState = {
  queue: AcetateQueueItem[];
  index: number;
  playing: boolean;
  current: number;
  seekTo: number | null;
  repeat: AcetateRepeat;
  shuffle: boolean;
  volume: number;
  rate: number;
  queueOpen: boolean;
  crossfade: number;
  loopA: number | null;
  loopB: number | null;
  loopOn: boolean;
  sleepUntil: number | null;
  eq: number[];
  eqOn: boolean;
  setQueue: (queue: AcetateQueueItem[], index?: number) => void;
  playAt: (index: number) => void;
  toggle: () => void;
  next: () => void;
  prev: () => void;
  seek: (seconds: number) => void;
  setCurrent: (seconds: number) => void;
  setPlaying: (playing: boolean) => void;
  clearSeek: () => void;
  cycleRepeat: () => void;
  toggleShuffle: () => void;
  setVolume: (volume: number) => void;
  cycleRate: () => void;
  toggleQueue: () => void;
  setCrossfade: (ms: number) => void;
  setLoop: (which: "a" | "b" | "off") => void;
  setSleep: (minutes: number) => void;
  setEqBand: (index: number, gain: number) => void;
  toggleEq: () => void;
  removeAt: (index: number) => void;
  clearQueue: () => void;
};

const RATES = [0.75, 1, 1.25, 1.5];

function loadPlayerPrefs() {
  if (typeof window === "undefined") return {} as Record<string, unknown>;
  try {
    return JSON.parse(localStorage.getItem("acetate:player") || "{}") as Record<string, unknown>;
  } catch {
    return {};
  }
}

function savePlayerPrefs(partial: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  const prev = loadPlayerPrefs();
  localStorage.setItem("acetate:player", JSON.stringify({ ...prev, ...partial }));
}

export const useAcetatePlayer = create<PlayerState>((set, get) => {
  const prefs = loadPlayerPrefs();
  const eq = Array.isArray(prefs.eq) && prefs.eq.length === 5 ? (prefs.eq as number[]) : [0, 0, 0, 0, 0];
  return ({
  queue: [],
  index: 0,
  playing: false,
  current: 0,
  seekTo: null,
  repeat: prefs.repeat === "all" || prefs.repeat === "one" ? prefs.repeat : "off",
  shuffle: prefs.shuffle === true,
  volume: typeof prefs.volume === "number" ? prefs.volume : 1,
  rate: typeof prefs.rate === "number" ? prefs.rate : 1,
  queueOpen: false,
  crossfade: typeof prefs.crossfade === "number" ? prefs.crossfade : 0,
  loopA: null,
  loopB: null,
  loopOn: false,
  sleepUntil: null,
  eq,
  eqOn: prefs.eqOn === true,
  setQueue: (queue, index = 0) => set({ queue, index, current: 0, playing: queue.length > 0, seekTo: 0 }),
  playAt: (index) => {
    const { queue } = get();
    if (!queue[index]) return;
    set({ index, current: 0, playing: true, seekTo: 0 });
  },
  toggle: () => set((s) => ({ playing: s.queue.length > 0 ? !s.playing : false })),
  next: () => {
    const { queue, index, repeat, shuffle } = get();
    if (!queue.length) return;
    if (repeat === "one") {
      set({ current: 0, seekTo: 0, playing: true });
      return;
    }
    if (shuffle && queue.length > 1) {
      let pick = index;
      while (pick === index) pick = Math.floor(Math.random() * queue.length);
      set({ index: pick, current: 0, seekTo: 0, playing: true });
      return;
    }
    const next = index + 1;
    if (next < queue.length) {
      set({ index: next, current: 0, seekTo: 0, playing: true });
      return;
    }
    if (repeat === "all") {
      set({ index: 0, current: 0, seekTo: 0, playing: true });
      return;
    }
    set({ playing: false, current: 0, seekTo: 0 });
  },
  prev: () => {
    const { queue, index, current } = get();
    if (!queue.length) return;
    if (current > 2) {
      set({ current: 0, seekTo: 0, playing: true });
      return;
    }
    const prev = Math.max(0, index - 1);
    set({ index: prev, current: 0, playing: true, seekTo: 0 });
  },
  seek: (seconds) => set({ seekTo: Math.max(0, seconds), current: Math.max(0, seconds) }),
  setCurrent: (seconds) => set({ current: seconds }),
  setPlaying: (playing) => set({ playing }),
  clearSeek: () => set({ seekTo: null }),
  cycleRepeat: () => set((s) => {
    const repeat = s.repeat === "off" ? "all" : s.repeat === "all" ? "one" : "off";
    savePlayerPrefs({ repeat });
    return { repeat };
  }),
  toggleShuffle: () => set((s) => {
    savePlayerPrefs({ shuffle: !s.shuffle });
    return { shuffle: !s.shuffle };
  }),
  setVolume: (volume) => {
    const next = Math.min(1, Math.max(0, volume));
    savePlayerPrefs({ volume: next });
    set({ volume: next });
  },
  cycleRate: () => set((s) => {
    const i = RATES.indexOf(s.rate as 0.75);
    const rate = RATES[(Math.max(0, i) + 1) % RATES.length];
    savePlayerPrefs({ rate });
    return { rate };
  }),
  toggleQueue: () => set((s) => ({ queueOpen: !s.queueOpen })),
  setCrossfade: (ms) => {
    const crossfade = ms > 0 ? Math.min(4000, ms) : 0;
    savePlayerPrefs({ crossfade });
    set({ crossfade });
  },
  setLoop: (which) => set((s) => {
    if (which === "off") return { loopOn: false, loopA: null, loopB: null };
    if (which === "a") return { loopA: s.current, loopOn: s.loopB != null };
    return { loopB: s.current, loopOn: true };
  }),
  setSleep: (minutes) => set({ sleepUntil: minutes > 0 ? Date.now() + minutes * 60_000 : null }),
  setEqBand: (index, gain) => set((s) => {
    const eq = s.eq.slice();
    eq[index] = Math.max(-12, Math.min(12, gain));
    savePlayerPrefs({ eq });
    return { eq, eqOn: true };
  }),
  toggleEq: () => set((s) => {
    savePlayerPrefs({ eqOn: !s.eqOn });
    return { eqOn: !s.eqOn };
  }),
  removeAt: (index) => set((s) => {
    const queue = s.queue.filter((_, i) => i !== index);
    let next = s.index;
    if (index < s.index) next -= 1;
    if (next >= queue.length) next = Math.max(0, queue.length - 1);
    return { queue, index: next, playing: queue.length > 0 && s.playing };
  }),
  clearQueue: () => set({ queue: [], index: 0, playing: false, current: 0 }),
});
});
