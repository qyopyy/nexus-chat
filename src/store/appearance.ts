"use client";

import { create } from "zustand";
import { APPEARANCE_KEY, BG_ANIMS, DEFAULT_APPEARANCE, FONTS, THEMES, paint, type Appearance } from "@/lib/theme";

function load(): Appearance {
  if (typeof window === "undefined") return DEFAULT_APPEARANCE;
  try {
    const raw = localStorage.getItem(APPEARANCE_KEY);
    return raw ? { ...DEFAULT_APPEARANCE, ...JSON.parse(raw) } : DEFAULT_APPEARANCE;
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

export const useAppearance = create<Appearance>(() => load());

export function setAppearance(patch: Partial<Appearance>) {
  useAppearance.setState(patch);
  const next = useAppearance.getState();
  try {
    localStorage.setItem(APPEARANCE_KEY, JSON.stringify(next));
  } catch {
    /* quota (e.g. huge background data URL) — still apply for this session */
  }
  paint(next, THEMES, FONTS, BG_ANIMS);
}

export function resetAppearance() {
  setAppearance(DEFAULT_APPEARANCE);
}
