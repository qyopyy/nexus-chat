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

type PlayerState = {
  queue: AcetateQueueItem[];
  index: number;
  playing: boolean;
  current: number;
  seekTo: number | null;
  setQueue: (queue: AcetateQueueItem[], index?: number) => void;
  playAt: (index: number) => void;
  toggle: () => void;
  next: () => void;
  prev: () => void;
  seek: (seconds: number) => void;
  setCurrent: (seconds: number) => void;
  setPlaying: (playing: boolean) => void;
  clearSeek: () => void;
};

export const useAcetatePlayer = create<PlayerState>((set, get) => ({
  queue: [],
  index: 0,
  playing: false,
  current: 0,
  seekTo: null,
  setQueue: (queue, index = 0) => set({ queue, index, current: 0, playing: queue.length > 0, seekTo: 0 }),
  playAt: (index) => {
    const { queue } = get();
    if (!queue[index]) return;
    set({ index, current: 0, playing: true, seekTo: 0 });
  },
  toggle: () => set((s) => ({ playing: s.queue.length > 0 ? !s.playing : false })),
  next: () => {
    const { queue, index } = get();
    if (!queue.length) return;
    const next = index + 1;
    if (next >= queue.length) {
      set({ playing: false, current: 0, seekTo: 0 });
      return;
    }
    set({ index: next, current: 0, playing: true, seekTo: 0 });
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
}));
