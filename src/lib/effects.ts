"use client";

import { prefs } from "./prefs";
import { create } from "zustand";

export type EffectKind = "confetti" | "hearts" | "fireworks" | "lasers" | "snow" | "balloons";

export const EFFECTS: { id: EffectKind; label: string; icon: string }[] = [
  { id: "confetti", label: "Confetti", icon: "🎉" },
  { id: "hearts", label: "Love", icon: "💖" },
  { id: "fireworks", label: "Fireworks", icon: "🎆" },
  { id: "lasers", label: "Lasers", icon: "⚡" },
  { id: "balloons", label: "Balloons", icon: "🎈" },
  { id: "snow", label: "Snow", icon: "❄️" },
];

export const useEffectsStore = create<{ playing: { kind: EffectKind; id: number } | null }>(() => ({ playing: null }));

let seq = 0;
export function playEffect(kind: EffectKind) {
  if (!prefs().chatEffects) return;
  useEffectsStore.setState({ playing: { kind, id: ++seq } });
}

/** iMessage-style keyword triggers when no effect was picked explicitly */
export function effectForText(text: string): EffectKind | null {
  const t = text.toLowerCase();
  if (/happy birthday|boldog sz[uü]linap|szülinap/.test(t)) return "balloons";
  if (/congrat|gratul|🎉|🥳/.test(t)) return "confetti";
  if (/happy new year|bu[eé]k|🎆/.test(t)) return "fireworks";
  if (/i love you|szeretlek|💖|😍/.test(t)) return "hearts";
  return null;
}

export function isEffect(v: unknown): v is EffectKind {
  return typeof v === "string" && EFFECTS.some((e) => e.id === v);
}
