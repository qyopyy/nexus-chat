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
};

export const useAcetatePlayer = create<PlayerState>((set, get) => ({
  queue: [],
  index: 0,
  playing: false,
  current: 0,
  seekTo: null,
  repeat: "off",
  shuffle: false,
  volume: 1,
  rate: 1,
  queueOpen: false,
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
  cycleRepeat: () => set((s) => ({ repeat: s.repeat === "off" ? "all" : s.repeat === "all" ? "one" : "off" })),
  toggleShuffle: () => set((s) => ({ shuffle: !s.shuffle })),
  setVolume: (volume) => set({ volume: Math.min(1, Math.max(0, volume)) }),
  cycleRate: () => set((s) => ({ rate: s.rate === 1 ? 1.25 : s.rate === 1.25 ? 1.5 : s.rate === 1.5 ? 0.75 : 1 })),
  toggleQueue: () => set((s) => ({ queueOpen: !s.queueOpen })),
}));
