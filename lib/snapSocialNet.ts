"use client";

// Nexus Snap Social · the network + device half (rules live in snapSocial.ts).
// Uses the same Nexus social graph as the rest of the platform: follows, blocks, chats and profile pictures are shared,
// so a change made in Snap shows up everywhere else, and the other way round.

import { useSyncExternalStore } from "react";
import { supabase, errorText } from "@/lib/supabase";
import { useApp, toast } from "@/store/app";
import { refreshChatList, sendMessage, updateMyProfile, uploadAvatar } from "@/lib/data";
import { followList, profile as gramProfile, setFollow, type GramProfile } from "@/lib/gram";
import { blockUser, loadBlocks, unblockUser, useBlocks } from "@/lib/blocks";
import { SOCIAL_KEY, DEFAULT_SOCIAL, bumpStreak, cleanMessage, cleanSearch, dayKey, liveStreak, nextFire, parseSocial, reminderLine, timeText, type Reminder, type Social } from "@/lib/snapSocial";
import type { Person } from "@/lib/snapSoundsNet";

// ------------------------------------------------------------------ people
export type SocialPerson = Person & { bio?: string | null };

/** Username or display-name search. People you blocked and yourself are left out. */
export async function searchUsers(q: string): Promise<SocialPerson[]> {
  const s = cleanSearch(q);
  if (!s) return [];
  const me = useApp.getState().userId;
  const like = `${s.replace(/[%_]/g, "")}%`;
  const inside = `%${s.replace(/[%_]/g, "")}%`;
  const { data, error } = await supabase
    .from("profiles")
    .select("id,username,display_name,avatar_color,avatar_url")
    .or(`username.ilike.${like},display_name.ilike.${inside}`)
    .order("username")
    .limit(20);
  if (error || !Array.isArray(data)) return [];
  const blocked = useBlocks.getState().ids;
  return (data as SocialPerson[]).filter((p) => p.id !== me && !blocked[p.id]);
}

export const loadSnapProfile = (username: string): Promise<GramProfile | null> => gramProfile(username);
export const followUser = (id: string, on: boolean) => setFollow(id, on);
export const peopleList = (id: string, which: "followers" | "following") => followList(id, which);
export { blockUser, unblockUser, loadBlocks };

/** Which of these people do I follow? (one query, for the Find list) */
export async function myFollowing(ids: string[]): Promise<Set<string>> {
  const me = useApp.getState().userId;
  if (!me || !ids.length) return new Set();
  const { data } = await supabase.from("gram_follows").select("followee_id").eq("follower_id", me).in("followee_id", ids);
  return new Set((data ?? []).map((r) => (r as { followee_id: string }).followee_id));
}

/** Plain text message to one person: opens your chat with them and sends it. */
export async function messageUser(userId: string, text: string): Promise<boolean> {
  const me = useApp.getState().userId;
  const body = cleanMessage(text);
  if (!me) throw new Error("Sign in first.");
  if (userId === me) throw new Error("That's you.");
  if (!body) return false;
  const { data, error } = await supabase.rpc("get_or_create_dm", { p_user: userId });
  if (error || !data) throw new Error(error ? errorText(error) : "Couldn't open a chat with them.");
  await sendMessage(data as string, body);
  void refreshChatList();
  return true;
}

// ------------------------------------------------------------------ profile picture (changes it on the whole platform)
export async function changePicture(file: File): Promise<boolean> {
  return uploadAvatar(file);
}
export async function removePicture() {
  await updateMyProfile({ avatar_url: null }, true);
  toast("Picture removed everywhere", "success");
}

// ------------------------------------------------------------------ device state: streak, tips seen, reminder
let cur: Social | null = null;
const subs = new Set<() => void>();

function load(): Social {
  try {
    return parseSocial(localStorage.getItem(SOCIAL_KEY));
  } catch {
    return DEFAULT_SOCIAL;
  }
}
export const getSocial = (): Social => (cur ??= typeof window === "undefined" ? DEFAULT_SOCIAL : load());
function commit(next: Social) {
  cur = next;
  try {
    localStorage.setItem(SOCIAL_KEY, JSON.stringify(next));
  } catch {
    /* private mode: lasts until the app closes */
  }
  subs.forEach((f) => f());
}
const subscribe = (f: () => void) => (subs.add(f), () => void subs.delete(f));
export const useSocial = (): Social => useSyncExternalStore(subscribe, getSocial, () => DEFAULT_SOCIAL);

/** Call after every Snap is taken. */
export function recordSnap(now = new Date()) {
  const s = getSocial();
  commit({ ...s, streak: bumpStreak(s.streak, dayKey(now)) });
}
export function markTipSeen(key: string) {
  const s = getSocial();
  if (!s.tipsSeen.includes(key)) commit({ ...s, tipsSeen: [...s.tipsSeen, key] });
}
export const markAsked = () => commit({ ...getSocial(), askedReminder: true });
export const markNudged = (day = dayKey()) => commit({ ...getSocial(), nudgeDay: day });
export const useLiveStreak = () => {
  const s = useSocial();
  return liveStreak(s.streak, dayKey());
};

// ------------------------------------------------------------------ the daily reminder
type Cap = { Capacitor?: { Plugins?: { LocalNotifications?: any } } };
const native = () => (typeof window === "undefined" ? undefined : (window as unknown as Cap).Capacitor?.Plugins?.LocalNotifications);
const BASE_ID = 910_000;

export type ReminderResult = "on" | "off" | "denied" | "unsupported";

async function cancelNative(LN: any) {
  await LN.cancel?.({ notifications: [1, 2, 3, 4, 5, 6, 7].map((i) => ({ id: BASE_ID + i })) }).catch(() => {});
}

/** Switch the daily reminder on (asks permission) or off. The iPhone app schedules it with the system, so it fires even when closed. */
export async function setReminder(r: Reminder): Promise<ReminderResult> {
  const LN = native();
  if (!r.on) {
    if (LN) await cancelNative(LN);
    commit({ ...getSocial(), reminder: { ...r, on: false }, askedReminder: true });
    return "off";
  }
  if (LN) {
    try {
      const perm = await LN.requestPermissions();
      if (perm?.display !== "granted") {
        commit({ ...getSocial(), reminder: { ...r, on: false }, askedReminder: true });
        return "denied";
      }
      await cancelNative(LN);
      // one notification per weekday so every day says something different
      const base = dayKey();
      await LN.schedule({
        notifications: [1, 2, 3, 4, 5, 6, 7].map((weekday, i) => {
          const line = reminderLine(shiftDay(base, i), 0);
          return { id: BASE_ID + weekday, title: line.title, body: line.body, schedule: { on: { weekday, hour: r.hour, minute: r.minute }, allowWhileIdle: true }, extra: { kind: "snap-daily" } };
        }),
      });
    } catch {
      return "unsupported";
    }
    commit({ ...getSocial(), reminder: { ...r, on: true }, askedReminder: true });
    return "on";
  }
  if (typeof Notification === "undefined") return "unsupported";
  const perm = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (perm !== "granted") {
    commit({ ...getSocial(), reminder: { ...r, on: false }, askedReminder: true });
    return "denied";
  }
  commit({ ...getSocial(), reminder: { ...r, on: true }, askedReminder: true });
  startReminders();
  return "on";
}

function shiftDay(day: string, add: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return dayKey(new Date(y, m - 1, d + add));
}

let timer: ReturnType<typeof setInterval> | null = null;
let firedDay = "";

async function show(title: string, body: string) {
  try {
    const reg = await navigator.serviceWorker?.getRegistration?.();
    if (reg?.showNotification) {
      await reg.showNotification(title, { body, tag: "snap-daily", icon: "/icon-192.png" });
      return;
    }
  } catch {
    /* fall through */
  }
  try {
    new Notification(title, { body, tag: "snap-daily" });
  } catch {
    toast(`${title} ${body}`);
  }
}

/** Web: while the app is open (or installed to the home screen) check once a minute. Native: the system does it. */
export function startReminders() {
  if (typeof window === "undefined" || native()) return;
  if (timer) clearInterval(timer);
  timer = setInterval(() => {
    const s = getSocial();
    if (!s.reminder.on || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const now = new Date();
    const today = dayKey(now);
    const due = new Date(now.getFullYear(), now.getMonth(), now.getDate(), s.reminder.hour, s.reminder.minute);
    if (now < due || firedDay === today || s.nudgeDay === today || s.streak.last === today) return;
    firedDay = today;
    const live = liveStreak(s.streak, today);
    const line = reminderLine(today, live.atRisk ? live.count : 0);
    void show(line.title, line.body);
    markNudged(today);
  }, 60_000);
}
export function stopReminders() {
  if (timer) clearInterval(timer);
  timer = null;
}

export const nextReminderText = (r: Reminder, now = new Date()) => {
  const t = nextFire(now, r.hour, r.minute);
  return `${dayKey(t) === dayKey(now) ? "today" : "tomorrow"} at ${timeText(r.hour, r.minute)}`;
};
