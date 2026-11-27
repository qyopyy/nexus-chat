"use client";

// The Snap settings, kept on this device. Components read them with usePrefs(); plain code with getPrefs().

import { useSyncExternalStore } from "react";
import { DEFAULT_PREFS, PREFS_KEY, parsePrefs, serializePrefs, type SnapPrefs } from "@/lib/snapPrefs";

export const PIN_KEY = "snap.pin";

/** Where the Snap under review was taken (only set when location tags are on). Cleared when you go back. */
let lastGeo: { lat: number; lng: number } | null = null;
export const getLastGeo = () => lastGeo;
export const setLastGeo = (g: { lat: number; lng: number } | null) => {
  lastGeo = g;
};

function load(): SnapPrefs {
  try {
    return parsePrefs(localStorage.getItem(PREFS_KEY));
  } catch {
    return DEFAULT_PREFS;
  }
}

let cur: SnapPrefs | null = null;
const subs = new Set<() => void>();

export function getPrefs(): SnapPrefs {
  if (!cur) cur = typeof window === "undefined" ? DEFAULT_PREFS : load();
  return cur;
}

function commit(next: SnapPrefs) {
  cur = next;
  try {
    localStorage.setItem(PREFS_KEY, serializePrefs(next));
  } catch {
    /* private mode: settings last until the app closes */
  }
  subs.forEach((f) => f());
}

export const setPrefs = (patch: Partial<SnapPrefs>) => commit(parsePrefs({ ...getPrefs(), ...patch }));
export const resetPrefs = () => commit(DEFAULT_PREFS);

const subscribe = (f: () => void) => {
  subs.add(f);
  return () => void subs.delete(f);
};

export const usePrefs = (): SnapPrefs => useSyncExternalStore(subscribe, getPrefs, () => DEFAULT_PREFS);

export function getPin(): string | null {
  try {
    return localStorage.getItem(PIN_KEY);
  } catch {
    return null;
  }
}
export function savePin(v: string | null) {
  try {
    if (v) localStorage.setItem(PIN_KEY, v);
    else localStorage.removeItem(PIN_KEY);
  } catch {
    /* ignore */
  }
  subs.forEach((f) => f());
}

/** Everything Snap remembers on this device (settings, PIN, last picks, background picture), not the account. */
export function clearSnapLocalData() {
  try {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("snap.")) doomed.push(k);
    }
    doomed.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
  cur = null;
  subs.forEach((f) => f());
}
