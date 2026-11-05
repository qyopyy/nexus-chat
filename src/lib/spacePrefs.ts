"use client";

import { create } from "zustand";
import { loadJSON, saveJSON } from "@/lib/utils";

/** Per-device server (space) preferences — favorites, mute, collapsed categories. */
type SpacePrefs = {
  favorites: string[];
  muted: string[];
  collapsed: Record<string, string[]>; // spaceId → category labels
};

const KEY = "nexus.spaceprefs";
const EMPTY: SpacePrefs = { favorites: [], muted: [], collapsed: {} };
/** Shared empty list for selectors — never return a fresh `[]` from a Zustand selector. */
export const EMPTY_SPACE_LIST: string[] = [];

export const useSpacePrefs = create<SpacePrefs>(() => {
  if (typeof window === "undefined") return EMPTY;
  const loaded = loadJSON<SpacePrefs>(KEY, EMPTY);
  return {
    favorites: Array.isArray(loaded.favorites) ? loaded.favorites : [],
    muted: Array.isArray(loaded.muted) ? loaded.muted : [],
    collapsed: loaded.collapsed && typeof loaded.collapsed === "object" ? loaded.collapsed : {},
  };
});

function persist() {
  saveJSON(KEY, useSpacePrefs.getState());
}

export function toggleFavoriteSpace(id: string) {
  useSpacePrefs.setState((s) => ({
    favorites: s.favorites.includes(id) ? s.favorites.filter((x) => x !== id) : [id, ...s.favorites].slice(0, 40),
  }));
  persist();
}

export function isFavoriteSpace(id: string) {
  return useSpacePrefs.getState().favorites.includes(id);
}

export function toggleMuteSpace(id: string) {
  useSpacePrefs.setState((s) => ({
    muted: s.muted.includes(id) ? s.muted.filter((x) => x !== id) : [...s.muted, id],
  }));
  persist();
}

export function isSpaceMuted(id: string) {
  return useSpacePrefs.getState().muted.includes(id);
}

export function toggleCollapsedCategory(spaceId: string, label: string) {
  useSpacePrefs.setState((s) => {
    const cur = s.collapsed[spaceId] ?? EMPTY_SPACE_LIST;
    const next = cur.includes(label) ? cur.filter((x) => x !== label) : [...cur, label];
    return { collapsed: { ...s.collapsed, [spaceId]: next } };
  });
  persist();
}

export function isCategoryCollapsed(spaceId: string, label: string) {
  return (useSpacePrefs.getState().collapsed[spaceId] ?? []).includes(label);
}

/** Sort: favorites first (stable order), then the rest. */
export function sortSpaces<T extends { id: string }>(list: T[]): T[] {
  const fav = useSpacePrefs.getState().favorites;
  if (!fav.length) return list;
  const rank = new Map(fav.map((id, i) => [id, i]));
  return [...list].sort((a, b) => {
    const af = rank.has(a.id);
    const bf = rank.has(b.id);
    if (af && bf) return (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0);
    if (af) return -1;
    if (bf) return 1;
    return 0;
  });
}
