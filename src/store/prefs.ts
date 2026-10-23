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
  const on = !usePrefs.getState().muted.includes(id);
  usePrefs.setState((s) => ({ muted: on ? [...s.muted, id] : s.muted.filter((x) => x !== id) }));
  persist();
  // muted chats also stop phone/browser push notifications
  void import("@/lib/push").then((m) => m.syncMute(id, on)).catch(() => {});
}

export function isMuted(id: string) {
  return usePrefs.getState().muted.includes(id);
}
