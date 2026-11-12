"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { supabase, errorText } from "./supabase";

/** Color and font tokens only. Imported themes cannot carry CSS or scripts. */
export type AcetateFont = "system" | "serif" | "mono" | "condensed";
export type AcetateMode = "dark" | "light";

export type AcetateTokens = {
  name: string;
  mode: AcetateMode;
  bg: string;
  card: string;
  text: string;
  muted: string;
  accent: string;
  accentText: string;
  line: string;
  font: AcetateFont;
};

export type AcetateTheme = AcetateTokens & { id: string; mark?: "999" };

const FONT_STACK: Record<AcetateFont, string> = {
  system: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
  serif: 'ui-serif, Georgia, "Times New Roman", serif',
  mono: 'ui-monospace, "SFMono-Regular", ui-monospace, monospace',
  condensed: '"Arial Narrow", "Roboto Condensed", "Helvetica Neue", sans-serif',
};

const HEX = /^#[0-9A-Fa-f]{6}$/;
const FONTS = new Set<AcetateFont>(["system", "serif", "mono", "condensed"]);
const COLOR_KEYS = ["bg", "card", "text", "muted", "accent", "accentText", "line"] as const;

/** Same red/black and pink tokens as Nexus Juice WRLD 999 and Ksubi Pink. No logos. */
const NINE99: AcetateTokens = {
  name: "999 / Ksubi",
  mode: "dark",
  bg: "#0a0a0a",
  card: "#121212",
  text: "#f5f5f5",
  muted: "#c4a0b0",
  accent: "#e10600",
  accentText: "#ffffff",
  line: "#2a1518",
  font: "condensed",
};

export const ACETATE_THEMES: AcetateTheme[] = [
  { id: "ink", name: "Ink", mode: "dark", bg: "#000000", card: "#141414", text: "#ffffff", muted: "#8e8e93", accent: "#7c5cff", accentText: "#ffffff", line: "#242424", font: "system" },
  { id: "lacquer", name: "Lacquer", mode: "dark", bg: "#100e0c", card: "#1a1612", text: "#f3eadf", muted: "#a3988c", accent: "#e4a15a", accentText: "#100e0c", line: "#3c342c", font: "serif" },
  { id: "midnight", name: "Midnight", mode: "dark", bg: "#070b14", card: "#121826", text: "#e8eefc", muted: "#8ea0c0", accent: "#7eb6ff", accentText: "#071018", line: "#243044", font: "system" },
  { id: "grove", name: "Grove", mode: "dark", bg: "#07110c", card: "#122018", text: "#e7f6ec", muted: "#8eae98", accent: "#3dd68c", accentText: "#062014", line: "#1e3328", font: "system" },
  { ...NINE99, id: "nine99", mark: "999" },
  { id: "daylight", name: "Daylight", mode: "light", bg: "#f4f4f5", card: "#ffffff", text: "#111113", muted: "#6b6b73", accent: "#5b4dff", accentText: "#ffffff", line: "#e4e4e7", font: "system" },
  { id: "paper", name: "Paper", mode: "light", bg: "#f6f1e8", card: "#fffaf3", text: "#1c1612", muted: "#7a6d62", accent: "#c46a2d", accentText: "#fffaf3", line: "#e6dccf", font: "serif" },
  { id: "blush", name: "Blush", mode: "light", bg: "#fff5f8", card: "#ffffff", text: "#241018", muted: "#8d6674", accent: "#ff4da6", accentText: "#ffffff", line: "#f0d5e0", font: "system" },
];

const CACHE = "acetate:theme";

export function themeById(id: string) {
  return ACETATE_THEMES.find((theme) => theme.id === id) ?? ACETATE_THEMES[0];
}

export function themeStyle(theme: AcetateTokens): CSSProperties {
  return {
    background: theme.bg,
    color: theme.text,
    fontFamily: FONT_STACK[theme.font] || FONT_STACK.system,
    ["--ac-bg" as string]: theme.bg,
    ["--ac-card" as string]: theme.card,
    ["--ac-text" as string]: theme.text,
    ["--ac-muted" as string]: theme.muted,
    ["--ac-accent" as string]: theme.accent,
    ["--ac-accent-text" as string]: theme.accentText,
    ["--ac-line" as string]: theme.line,
    ["--ac-font" as string]: FONT_STACK[theme.font] || FONT_STACK.system,
  };
}

function badToken(value: string) {
  const lower = value.toLowerCase();
  return lower.includes("url(") || lower.includes("expression(") || /[<>;{}\\]/.test(value);
}

export function parseThemeImport(raw: string): AcetateTokens {
  const text = raw.trim();
  if (!text) throw new Error("Paste a theme or choose a file");
  if (text.length > 4000) throw new Error("That theme is too large");
  let parsed: unknown;
  const json = text.startsWith("{") ? text : decodeCode(text);
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("That theme is not valid JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Theme must be a JSON object");
  const src = parsed as Record<string, unknown>;
  const allowed = new Set(["acetateTheme", "name", "mode", "bg", "card", "text", "muted", "accent", "accentText", "line", "font"]);
  for (const key of Object.keys(src)) {
    if (!allowed.has(key)) throw new Error("Theme has a field that is not a color or font");
  }
  const base = themeById("ink");
  const next: AcetateTokens = { ...base, name: "Imported" };
  if (src.name != null) {
    if (typeof src.name !== "string" || badToken(src.name) || src.name.trim().length < 1 || src.name.trim().length > 40) {
      throw new Error("Theme name must be plain text under 40 characters");
    }
    next.name = src.name.trim();
  }
  if (src.mode != null) {
    if (src.mode !== "dark" && src.mode !== "light") throw new Error("Mode must be dark or light");
    next.mode = src.mode;
  }
  if (src.font != null) {
    if (typeof src.font !== "string" || !FONTS.has(src.font as AcetateFont)) throw new Error("Font must be system, serif, mono, or condensed");
    next.font = src.font as AcetateFont;
  }
  for (const key of COLOR_KEYS) {
    if (src[key] == null) continue;
    if (typeof src[key] !== "string" || !HEX.test(src[key] as string)) throw new Error(`${key} must be a #RRGGBB color`);
    next[key] = (src[key] as string).toLowerCase();
  }
  return next;
}

function decodeCode(code: string) {
  try {
    const pad = code.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(pad);
    return bin;
  } catch {
    throw new Error("That theme code could not be read");
  }
}

export function exportTheme(theme: AcetateTokens) {
  const body = {
    acetateTheme: 1,
    name: theme.name,
    mode: theme.mode,
    bg: theme.bg,
    card: theme.card,
    text: theme.text,
    muted: theme.muted,
    accent: theme.accent,
    accentText: theme.accentText,
    line: theme.line,
    font: theme.font,
  };
  const json = JSON.stringify(body, null, 2);
  const code = btoa(JSON.stringify(body)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return { json, code };
}

export type AppliedTheme = { id: string; tokens: AcetateTokens; mark?: "999"; custom: boolean };

function applyBuiltIn(id: string): AppliedTheme {
  const theme = themeById(id);
  return { id: theme.id, tokens: theme, mark: theme.mark, custom: false };
}

function readCache(): AppliedTheme {
  if (typeof window === "undefined") return applyBuiltIn("ink");
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE) || "") as { id?: string; tokens?: AcetateTokens; custom?: boolean };
    if (raw.custom && raw.tokens) return { id: "custom", tokens: parseThemeImport(JSON.stringify(raw.tokens)), custom: true };
    if (raw.id) return applyBuiltIn(raw.id);
  } catch {
    /* cache is optional */
  }
  return applyBuiltIn("ink");
}

export async function saveAcetateTheme(userId: string, applied: AppliedTheme) {
  localStorage.setItem(CACHE, JSON.stringify({ id: applied.id, tokens: applied.tokens, custom: applied.custom }));
  const { error } = await supabase.from("acetate_appearance").upsert({
    user_id: userId,
    theme_id: applied.custom ? "custom" : applied.id,
    custom: applied.custom ? applied.tokens : null,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(errorText(error));
}

export function useAcetateTheme(userId: string | null) {
  const [applied, setApplied] = useState<AppliedTheme>(() => applyBuiltIn("ink"));
  useEffect(() => {
    setApplied(readCache());
  }, []);
  useEffect(() => {
    if (!userId) return;
    let live = true;
    void supabase.from("acetate_appearance").select("theme_id, custom").eq("user_id", userId).maybeSingle().then(({ data }) => {
      if (!live || !data) return;
      const row = data as { theme_id: string; custom: AcetateTokens | null };
      if (row.custom) {
        try {
          const tokens = parseThemeImport(JSON.stringify(row.custom));
          const next = { id: "custom", tokens, custom: true as const };
          setApplied(next);
          localStorage.setItem(CACHE, JSON.stringify(next));
        } catch {
          /* keep the built-in theme if the row is bad */
        }
        return;
      }
      const next = applyBuiltIn(row.theme_id);
      setApplied(next);
      localStorage.setItem(CACHE, JSON.stringify({ id: next.id, custom: false }));
    });
    return () => {
      live = false;
    };
  }, [userId]);

  async function choose(id: string) {
    if (!userId) throw new Error("Sign in required");
    const next = applyBuiltIn(id);
    setApplied(next);
    await saveAcetateTheme(userId, next);
  }

  async function importRaw(raw: string) {
    if (!userId) throw new Error("Sign in required");
    const tokens = parseThemeImport(raw);
    const next: AppliedTheme = { id: "custom", tokens, custom: true };
    setApplied(next);
    await saveAcetateTheme(userId, next);
  }

  return { ...applied, style: themeStyle(applied.tokens), choose, importRaw };
}
