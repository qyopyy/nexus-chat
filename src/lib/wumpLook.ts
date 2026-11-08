"use client";

import { useEffect, useState } from "react";

/** Wump-only look: colour theme, background, your location arrow and a map tint. Stored per device. */
export type WumpThemeId = "classic" | "999" | "purple999" | "midnight" | "neon" | "sunset" | "ocean" | "forest" | "candy" | "mono" | "gold";
export type WumpBgId = "none" | "aurora" | "grid" | "stars" | "dots" | "waves" | "999" | "999purple" | "sunset" | "ocean" | "noise";
export type WumpArrowId = "classic" | "arrow" | "beam" | "orb" | "ghost" | "comet";

export type WumpTheme = {
  id: WumpThemeId;
  name: string;
  /** css vars set on the Wump wrapper (Tailwind v4 colour tokens) */
  vars: Record<string, string>;
  /** my pin colour */
  pin: string;
  /** map overlay tint (mix-blend) */
  tint?: string;
  swatch: [string, string];
  plus?: boolean;
};

const dark = (side: string, chat: string, panel: string, hover: string, line: string) => ({
  "--color-side": side,
  "--color-chat": chat,
  "--color-panel": panel,
  "--color-hover": hover,
  "--color-active": hover,
  "--color-input": hover,
  "--color-line": line,
});

export const WUMP_THEMES: WumpTheme[] = [
  { id: "classic", name: "Classic", vars: {}, pin: "#0ea5e9", swatch: ["#2b2d31", "#22c55e"] },
  {
    id: "999",
    name: "999 Red",
    vars: { ...dark("#140606", "#0b0303", "#1a0707", "#2a0b0b", "#3a1010"), "--color-accent": "#e10600", "--color-accent-2": "#b30000", "--color-ok": "#ff3b30", "--color-txt": "#f5e9e9", "--color-sub": "#b88a8a" },
    pin: "#e10600",
    tint: "rgba(160,0,0,.16)",
    swatch: ["#0b0303", "#e10600"],
  },
  {
    id: "purple999",
    name: "999 Purple",
    vars: { ...dark("#100818", "#08040f", "#170b22", "#241236", "#341a4d"), "--color-accent": "#a855f7", "--color-accent-2": "#7e22ce", "--color-ok": "#c084fc", "--color-txt": "#efe7fb", "--color-sub": "#a48bc4" },
    pin: "#a855f7",
    tint: "rgba(110,30,180,.16)",
    swatch: ["#08040f", "#a855f7"],
  },
  {
    id: "midnight",
    name: "Midnight",
    vars: { ...dark("#0f172a", "#0a0f1e", "#111a30", "#1e293b", "#253048"), "--color-accent": "#38bdf8", "--color-ok": "#34d399" },
    pin: "#38bdf8",
    tint: "rgba(15,23,60,.18)",
    swatch: ["#0a0f1e", "#38bdf8"],
  },
  {
    id: "neon",
    name: "Neon",
    vars: { ...dark("#0d0d14", "#07070c", "#12121c", "#1c1c2b", "#2a2a40"), "--color-accent": "#22d3ee", "--color-ok": "#a3e635", "--color-txt": "#f0faff" },
    pin: "#22d3ee",
    tint: "rgba(20,0,60,.14)",
    swatch: ["#07070c", "#a3e635"],
    plus: true,
  },
  {
    id: "sunset",
    name: "Sunset",
    vars: { ...dark("#1f1016", "#170b10", "#26131b", "#331a25", "#46222f"), "--color-accent": "#fb7185", "--color-ok": "#fb923c" },
    pin: "#fb7185",
    tint: "rgba(255,90,60,.10)",
    swatch: ["#170b10", "#fb923c"],
  },
  {
    id: "ocean",
    name: "Ocean",
    vars: { ...dark("#062028", "#04161c", "#08262f", "#0d3440", "#134452"), "--color-accent": "#06b6d4", "--color-ok": "#2dd4bf" },
    pin: "#06b6d4",
    tint: "rgba(0,90,120,.12)",
    swatch: ["#04161c", "#2dd4bf"],
  },
  {
    id: "forest",
    name: "Forest",
    vars: { ...dark("#0d1a12", "#08120c", "#102016", "#172c1f", "#1f3a29"), "--color-accent": "#4ade80", "--color-ok": "#a3e635" },
    pin: "#22c55e",
    tint: "rgba(20,80,30,.10)",
    swatch: ["#08120c", "#4ade80"],
  },
  {
    id: "candy",
    name: "Candy",
    vars: { ...dark("#1d1222", "#150c19", "#24162a", "#321e3a", "#43284d"), "--color-accent": "#f472b6", "--color-ok": "#60a5fa" },
    pin: "#f472b6",
    tint: "rgba(255,100,200,.08)",
    swatch: ["#150c19", "#f472b6"],
    plus: true,
  },
  {
    id: "mono",
    name: "Mono",
    vars: { ...dark("#141414", "#0c0c0c", "#181818", "#232323", "#2e2e2e"), "--color-accent": "#e5e5e5", "--color-accent-2": "#a3a3a3", "--color-ok": "#d4d4d4" },
    pin: "#fafafa",
    tint: "rgba(0,0,0,.08)",
    swatch: ["#0c0c0c", "#e5e5e5"],
  },
  {
    id: "gold",
    name: "Gold",
    vars: { ...dark("#16120a", "#0e0b05", "#1c170c", "#2a2210", "#3a2f16"), "--color-accent": "#facc15", "--color-accent-2": "#ca8a04", "--color-ok": "#fde047" },
    pin: "#facc15",
    tint: "rgba(120,90,0,.10)",
    swatch: ["#0e0b05", "#facc15"],
    plus: true,
  },
];

export const WUMP_BGS: { id: WumpBgId; name: string; plus?: boolean }[] = [
  { id: "none", name: "Plain" },
  { id: "aurora", name: "Aurora", plus: true },
  { id: "grid", name: "Grid" },
  { id: "stars", name: "Stars", plus: true },
  { id: "dots", name: "Dots" },
  { id: "waves", name: "Waves" },
  { id: "999", name: "999 Red" },
  { id: "999purple", name: "999 Purple" },
  { id: "sunset", name: "Sunset glow" },
  { id: "ocean", name: "Deep sea" },
  { id: "noise", name: "Film grain", plus: true },
];

export const WUMP_ARROWS: { id: WumpArrowId; name: string; hint: string; plus?: boolean }[] = [
  { id: "classic", name: "Classic", hint: "Avatar + heading cone" },
  { id: "arrow", name: "Arrow", hint: "Navigation arrow that turns with you" },
  { id: "beam", name: "Beam", hint: "Wide flashlight beam" },
  { id: "orb", name: "Orb", hint: "Glowing dot, no avatar" },
  { id: "ghost", name: "Ghost", hint: "See-through, low-key", plus: true },
  { id: "comet", name: "Comet", hint: "Arrow with a glowing tail", plus: true },
];

export type WumpLook = { theme: WumpThemeId; bg: WumpBgId; arrow: WumpArrowId; tintMap: boolean };
const KEY = "wump-look";
const DEF: WumpLook = { theme: "classic", bg: "none", arrow: "classic", tintMap: true };

function read(): WumpLook {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "null") as Partial<WumpLook> | null;
    if (!v) return DEF;
    return {
      theme: WUMP_THEMES.some((t) => t.id === v.theme) ? (v.theme as WumpThemeId) : DEF.theme,
      bg: WUMP_BGS.some((b) => b.id === v.bg) ? (v.bg as WumpBgId) : DEF.bg,
      arrow: WUMP_ARROWS.some((a) => a.id === v.arrow) ? (v.arrow as WumpArrowId) : DEF.arrow,
      tintMap: v.tintMap !== false,
    };
  } catch {
    return DEF;
  }
}

let current: WumpLook | null = null;
const subs = new Set<(l: WumpLook) => void>();

export function getWumpLook() {
  if (!current) current = typeof window === "undefined" ? DEF : read();
  return current;
}
export function setWumpLook(patch: Partial<WumpLook>) {
  current = { ...getWumpLook(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* private mode */
  }
  subs.forEach((f) => f(current!));
}
export function useWumpLook() {
  const [l, setL] = useState<WumpLook>(DEF);
  useEffect(() => {
    setL(getWumpLook());
    subs.add(setL);
    return () => {
      subs.delete(setL);
    };
  }, []);
  return l;
}
export const wumpTheme = (id: WumpThemeId) => WUMP_THEMES.find((t) => t.id === id) ?? WUMP_THEMES[0];

/** Plus-only choices fall back to free ones when Plus isn't active. */
export function effectiveLook(l: WumpLook, plus: boolean): WumpLook {
  if (plus) return l;
  return {
    ...l,
    theme: wumpTheme(l.theme).plus ? "classic" : l.theme,
    bg: WUMP_BGS.find((b) => b.id === l.bg)?.plus ? "none" : l.bg,
    arrow: WUMP_ARROWS.find((a) => a.id === l.arrow)?.plus ? "classic" : l.arrow,
  };
}
