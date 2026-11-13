"use client";

import { useEffect, useState } from "react";

/** Local quiet hours. While the window is on, Wump stops publishing your Live pin. */

export type QuietHours = {
  enabled: boolean;
  /** Minutes from midnight, 0–1439. */
  start: number;
  end: number;
};

const KEY = "wump.quietHours";
const EVENT = "wump-quiet-hours";

export const QUIET_HOURS_OFF: QuietHours = { enabled: false, start: 22 * 60, end: 7 * 60 };

export function clampMinute(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1439, Math.round(n)));
}

/** True when `nowMin` falls inside [start, end). Overnight windows wrap past midnight. */
export function inQuietWindow(nowMin: number, start: number, end: number) {
  const now = clampMinute(nowMin);
  const from = clampMinute(start);
  const to = clampMinute(end);
  if (from === to) return false;
  if (from < to) return now >= from && now < to;
  return now >= from || now < to;
}

export function minutesNow(date = new Date()) {
  return date.getHours() * 60 + date.getMinutes();
}

export function formatQuietTime(minutes: number) {
  const m = clampMinute(minutes);
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export function parseQuietTime(value: string) {
  const [h, m] = value.split(":").map((part) => Number(part));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return clampMinute(h * 60 + m);
}

export function loadQuietHours(): QuietHours {
  if (typeof window === "undefined") return QUIET_HOURS_OFF;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return QUIET_HOURS_OFF;
    const parsed = JSON.parse(raw) as Partial<QuietHours>;
    return {
      enabled: parsed.enabled === true,
      start: clampMinute(parsed.start ?? QUIET_HOURS_OFF.start),
      end: clampMinute(parsed.end ?? QUIET_HOURS_OFF.end),
    };
  } catch {
    return QUIET_HOURS_OFF;
  }
}

export function saveQuietHours(next: QuietHours) {
  const stored: QuietHours = {
    enabled: next.enabled,
    start: clampMinute(next.start),
    end: clampMinute(next.end),
  };
  localStorage.setItem(KEY, JSON.stringify(stored));
  window.dispatchEvent(new Event(EVENT));
  return stored;
}

export function quietHoursActive(date = new Date(), hours = loadQuietHours()) {
  if (!hours.enabled) return false;
  return inQuietWindow(minutesNow(date), hours.start, hours.end);
}

export function useQuietHoursActive() {
  const [active, setActive] = useState(false);
  useEffect(() => {
    const tick = () => setActive(quietHoursActive());
    tick();
    const id = window.setInterval(tick, 20_000);
    window.addEventListener(EVENT, tick);
    return () => {
      window.clearInterval(id);
      window.removeEventListener(EVENT, tick);
    };
  }, []);
  return active;
}
