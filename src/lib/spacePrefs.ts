"use client";

import { create } from "zustand";
import { loadJSON, saveJSON } from "@/lib/utils";

/** Per-device server (space) + chat list preferences — favorites, mute, custom order. */
type SpacePrefs = {
  favorites: string[];
  muted: string[];
  collapsed: Record<string, string[]>; // spaceId → category labels
  /** Full custom rail order for servers (left-click ↑↓). Missing ids append at end. */
  order: string[];
  /** Custom home sidebar order for DMs / groups. */
  chatOrder: string[];
};

const KEY = "nexus.spaceprefs";
const EMPTY: SpacePrefs = { favorites: [], muted: [], collapsed: {}, order: [], chatOrder: [] };
/** Shared empty list for selectors — never return a fresh `[]` from a Zustand selector. */
export const EMPTY_SPACE_LIST: string[] = [];

export const useSpacePrefs = create<SpacePrefs>(() => {
  if (typeof window === "undefined") return EMPTY;
  const loaded = loadJSON<Partial<SpacePrefs>>(KEY, EMPTY);
  return {
    favorites: Array.isArray(loaded.favorites) ? loaded.favorites : [],
    muted: Array.isArray(loaded.muted) ? loaded.muted : [],
    collapsed: loaded.collapsed && typeof loaded.collapsed === "object" ? loaded.collapsed : {},
    order: Array.isArray(loaded.order) ? loaded.order : Array.isArray(loaded.favorites) ? [...loaded.favorites] : [],
    chatOrder: Array.isArray(loaded.chatOrder) ? loaded.chatOrder : [],
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

function ensureOrder(ids: string[], existing: string[]) {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const id of existing) {
    if (ids.includes(id) && !seen.has(id)) {
      seen.add(id);
      next.push(id);
    }
  }
  for (const id of ids) {
    if (!seen.has(id)) next.push(id);
  }
  return next;
}

/** Sort by custom `order`, falling back to favorites-first for legacy prefs. */
export function sortSpaces<T extends { id: string }>(list: T[]): T[] {
  const { order, favorites } = useSpacePrefs.getState();
  const rankList = order.length ? order : favorites;
  if (!rankList.length) return list;
  const rank = new Map(ensureOrder(list.map((x) => x.id), rankList).map((id, i) => [id, i]));
  return [...list].sort((a, b) => (rank.get(a.id) ?? 9999) - (rank.get(b.id) ?? 9999));
}

/** Reorder using the visible server list (so ↑↓ matches what you see). Left-click friendly. */
export function moveSpaceInList(ids: string[], id: string, dir: -1 | 1) {
  const list = ensureOrder(ids, useSpacePrefs.getState().order.length ? useSpacePrefs.getState().order : ids);
  const i = list.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return false;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  useSpacePrefs.setState({ order: next });
  persist();
  return true;
}

export function sortChats<T extends { id: string }>(list: T[]): T[] {
  const order = useSpacePrefs.getState().chatOrder;
  if (!order.length) return list;
  const rank = new Map(ensureOrder(list.map((x) => x.id), order).map((id, i) => [id, i]));
  return [...list].sort((a, b) => (rank.get(a.id) ?? 9999) - (rank.get(b.id) ?? 9999));
}

export function moveChatInList(ids: string[], id: string, dir: -1 | 1) {
  const list = ensureOrder(ids, useSpacePrefs.getState().chatOrder.length ? useSpacePrefs.getState().chatOrder : ids);
  const i = list.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return false;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  useSpacePrefs.setState({ chatOrder: next });
  persist();
  return true;
}
