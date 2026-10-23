"use client";

import { create } from "zustand";
import { loadJSON, saveJSON } from "@/lib/utils";

// Per-device chat preferences (pinned / muted chats).

type Prefs = { pinned: string[]; muted: string[] };
const KEY = "nexus.chatprefs";

export const usePrefs = create<Prefs>(() => (typeof window === "undefined" ? { pinned: [], muted: [] } : loadJSON<Prefs>(KEY, { pinned: [], muted: [] })));

function persist() {
  saveJSON(KEY, usePrefs.getState());
}

export function togglePin(id: string) {
  usePrefs.setState((s) => ({ pinned: s.pinned.includes(id) ? s.pinned.filter((x) => x !== id) : [id, ...s.pinned].slice(0, 10) }));
  persist();
}

export function toggleMute(id: string) {
  usePrefs.setState((s) => ({ muted: s.muted.includes(id) ? s.muted.filter((x) => x !== id) : [...s.muted, id] }));
  persist();
}

export function isMuted(id: string) {
  return usePrefs.getState().muted.includes(id);
}
