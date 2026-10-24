"use client";

// Watch later + watch history, kept on this device.

const LATER = "nexus:watchLater";
const HIST = "nexus:watchHistory";
const read = <T,>(k: string, d: T): T => {
  try {
    return JSON.parse(localStorage.getItem(k) ?? "null") ?? d;
  } catch {
    return d;
  }
};
const write = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* private mode */
  }
};

export const watchLater = () => read<string[]>(LATER, []);
export const isLater = (id: string) => watchLater().includes(id);
export function toggleLater(id: string) {
  const l = watchLater();
  const on = !l.includes(id);
  write(LATER, on ? [id, ...l].slice(0, 200) : l.filter((x) => x !== id));
  return on;
}

export const history = () => read<{ id: string; at: number; t: number }[]>(HIST, []);
export function addHistory(id: string, t = 0) {
  write(HIST, [{ id, at: Date.now(), t }, ...history().filter((h) => h.id !== id)].slice(0, 200));
}
export function clearHistory() {
  write(HIST, []);
}
