"use client";

/**
 * Client-side Space event reminders.
 * Schedules a toast ~1h before starts_at (or immediately if sooner),
 * persists via localStorage, and surfaces fired items in NotificationPanel.
 */

import { create } from "zustand";
import { toast } from "@/store/app";
import { pushLocalNotification } from "./notifications";

const STORAGE_KEY = "nexus.spaceEventReminders.v1";
const HOUR_MS = 3600_000;
const CHECK_MS = 30_000;

export type ScheduledEventReminder = {
  eventId: string;
  title: string;
  spaceName: string;
  startsAt: string;
  /** When to fire the reminder (ms epoch). */
  remindAt: number;
  /** Fired (toasted + shown in panel). */
  fired: boolean;
};

type ReminderState = {
  reminders: ScheduledEventReminder[];
  loaded: boolean;
};

export const useEventReminders = create<ReminderState>(() => ({
  reminders: [],
  loaded: false,
}));

function readStorage(): ScheduledEventReminder[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]") as ScheduledEventReminder[];
    return Array.isArray(raw) ? raw.filter((r) => r && typeof r.eventId === "string") : [];
  } catch {
    return [];
  }
}

function writeStorage(list: ScheduledEventReminder[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* ignore quota */
  }
  useEventReminders.setState({ reminders: list, loaded: true });
}

export function loadEventReminders() {
  writeStorage(readStorage());
}

export function hasEventReminder(eventId: string): boolean {
  return useEventReminders.getState().reminders.some((r) => r.eventId === eventId);
}

function fireReminder(r: ScheduledEventReminder, immediate: boolean) {
  const start = new Date(r.startsAt);
  const mins = Math.max(0, Math.round((start.getTime() - Date.now()) / 60_000));
  const when =
    immediate && mins < 60
      ? mins <= 0
        ? "is starting now"
        : `starts in ${mins} min`
      : "starts in about an hour";
  const body = `${r.title} (${r.spaceName}) ${when}`;
  toast(`⏰ ${body}`, "info");
  pushLocalNotification({
    id: `event-reminder:${r.eventId}`,
    kind: "event_reminder",
    title: "Event reminder",
    body,
    created_at: new Date().toISOString(),
  });
}

/**
 * Schedule a reminder ~1h before the event, or toast immediately if <1h away.
 * Returns false if a reminder already exists for this event id.
 */
export function scheduleEventReminder(opts: {
  eventId: string;
  title: string;
  spaceName: string;
  startsAt: string;
}): boolean {
  loadEventReminders();
  const list = [...useEventReminders.getState().reminders];
  if (list.some((r) => r.eventId === opts.eventId)) return false;

  const startsMs = new Date(opts.startsAt).getTime();
  const remindAt = startsMs - HOUR_MS;
  const soon = remindAt <= Date.now();

  const row: ScheduledEventReminder = {
    eventId: opts.eventId,
    title: opts.title,
    spaceName: opts.spaceName,
    startsAt: opts.startsAt,
    remindAt: soon ? Date.now() : remindAt,
    fired: soon,
  };
  list.push(row);
  writeStorage(list);

  if (soon) {
    fireReminder(row, true);
  } else {
    toast("Reminder set — we'll nudge you ~1 hour before", "success");
  }
  return true;
}

/** Fire any due reminders; safe to call on an interval or app load. */
export function checkEventReminders() {
  loadEventReminders();
  const list = useEventReminders.getState().reminders;
  let changed = false;
  const next = list.map((r) => {
    if (r.fired || r.remindAt > Date.now()) return r;
    fireReminder(r, false);
    changed = true;
    return { ...r, fired: true };
  });
  if (changed) writeStorage(next);
}

/** Start load + interval checker. Returns cleanup. */
export function startEventReminderWatcher(): () => void {
  loadEventReminders();
  checkEventReminders();
  const id = window.setInterval(checkEventReminders, CHECK_MS);
  const onVis = () => {
    if (document.visibilityState === "visible") checkEventReminders();
  };
  document.addEventListener("visibilitychange", onVis);
  return () => {
    window.clearInterval(id);
    document.removeEventListener("visibilitychange", onVis);
  };
}
