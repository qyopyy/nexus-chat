import { fmtClock, fmtDateShort } from "./prefs";
import clsx, { type ClassValue } from "clsx";

export const cn = (...v: ClassValue[]) => clsx(v);

export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function formatTime(iso: string) {
  return fmtClock(new Date(iso));
}

/** Telegram-style list timestamp: time today, weekday this week, date otherwise */
export function formatListTime(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  if (sameDay(d, now)) return formatTime(iso);
  const diff = (now.getTime() - d.getTime()) / 86400000;
  if (diff < 7) return d.toLocaleDateString([], { weekday: "short" });
  return fmtDateShort(d);
}

export function formatDay(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (sameDay(d, now)) return "Today";
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (sameDay(d, y)) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: d.getFullYear() === now.getFullYear() ? undefined : "numeric" });
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

export function saveJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

export const QUICK_REACTIONS = ["👍", "❤️", "😂", "🔥", "😮", "😢", "🎉", "👀"];

export const EMOJI_GRID = [
  "😀", "😁", "😂", "🤣", "😊", "😍", "😘", "😎", "🤔", "😏", "😴", "😭", "😡", "🥳", "🤯", "😱",
  "👍", "👎", "👏", "🙏", "💪", "👀", "🤝", "✌️", "❤️", "💔", "🔥", "✨", "🎉", "💯", "✅", "❌",
  "🎵", "🎧", "🎤", "🎹", "🥁", "🎸", "🎮", "🏆", "🍕", "🍺", "☕", "🚀", "💸", "📈", "🌙", "☀️",
];
