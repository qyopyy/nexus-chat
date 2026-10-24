"use client";

import { supabase, errorText } from "./supabase";
import { useApp, toast } from "@/store/app";
import { loadProfiles, loadSpace, refreshSpaces } from "./data";

export type SpaceEvent = { id: string; space_id: string; created_by: string; title: string; description: string | null; location: string | null; starts_at: string; ends_at: string | null };
export type Rsvp = { event_id: string; user_id: string; status: "going" | "maybe" };
export type XpRow = { user_id: string; xp: number; messages: number };

/** level curve: L1 at 50 XP, L10 at 5,000 XP */
export const levelOf = (xp: number) => Math.floor(Math.sqrt(xp / 50));
export const xpFor = (level: number) => level * level * 50;

const ok = (error: { message: string } | null) => {
  if (error) toast(errorText(error as never), "error");
  return !error;
};

export async function setInfo(spaceId: string, welcome: string, rules: string) {
  const { error } = await supabase.rpc("space_set_info", { p_space: spaceId, p_welcome: welcome, p_rules: rules });
  if (ok(error)) await refreshSpaces();
  return !error;
}
export async function setSlowmode(convId: string, seconds: number, spaceId: string) {
  const { error } = await supabase.rpc("space_set_slowmode", { p_conv: convId, p_seconds: seconds });
  if (ok(error)) await loadSpace(spaceId);
}
export async function setRole(spaceId: string, userId: string, role: "admin" | "member") {
  const { error } = await supabase.rpc("space_set_role", { p_space: spaceId, p_user: userId, p_role: role });
  if (ok(error)) await loadSpace(spaceId);
}

export async function events(spaceId: string) {
  const since = new Date(Date.now() - 6 * 3600000).toISOString();
  const { data } = await supabase.from("space_events").select("*").eq("space_id", spaceId).gte("starts_at", since).order("starts_at").limit(50);
  const list = (data ?? []) as SpaceEvent[];
  const { data: r } = list.length ? await supabase.from("space_event_rsvps").select("*").in("event_id", list.map((e) => e.id)) : { data: [] };
  const rsvps = (r ?? []) as Rsvp[];
  void loadProfiles([...new Set([...list.map((e) => e.created_by), ...rsvps.map((x) => x.user_id)])]);
  return { list, rsvps };
}
export async function createEvent(spaceId: string, e: { title: string; description: string; location: string; starts_at: string }) {
  const { error } = await supabase.from("space_events").insert({
    space_id: spaceId,
    created_by: useApp.getState().userId,
    title: e.title.trim().slice(0, 100),
    description: e.description.trim().slice(0, 1000) || null,
    location: e.location.trim().slice(0, 200) || null,
    starts_at: new Date(e.starts_at).toISOString(),
  });
  return ok(error);
}
export async function deleteEvent(id: string) {
  return ok((await supabase.from("space_events").delete().eq("id", id)).error);
}
export async function rsvp(eventId: string, status: "going" | "maybe" | null) {
  const me = useApp.getState().userId;
  if (!status) return ok((await supabase.from("space_event_rsvps").delete().eq("event_id", eventId).eq("user_id", me)).error);
  await supabase.from("space_event_rsvps").delete().eq("event_id", eventId).eq("user_id", me);
  const { error } = await supabase.from("space_event_rsvps").insert({ event_id: eventId, user_id: me, status });
  return ok(error);
}

export async function leaderboard(spaceId: string): Promise<XpRow[]> {
  const { data } = await supabase.from("space_xp").select("user_id,xp,messages").eq("space_id", spaceId).order("xp", { ascending: false }).limit(50);
  const rows = (data ?? []) as XpRow[];
  void loadProfiles(rows.map((r) => r.user_id));
  return rows;
}

/** .ics so people can add an event to their calendar */
export function icsFor(e: SpaceEvent, spaceName: string) {
  const f = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const start = new Date(e.starts_at);
  const end = e.ends_at ? new Date(e.ends_at) : new Date(start.getTime() + 3600000);
  const esc = (s: string) => s.replace(/[\\,;]/g, (m) => `\\${m}`).replace(/\n/g, "\\n");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Nexus//Events//EN",
    "BEGIN:VEVENT",
    `UID:${e.id}@nexus`,
    `DTSTAMP:${f(new Date())}`,
    `DTSTART:${f(start)}`,
    `DTEND:${f(end)}`,
    `SUMMARY:${esc(e.title)} (${esc(spaceName)})`,
    e.description ? `DESCRIPTION:${esc(e.description)}` : "",
    e.location ? `LOCATION:${esc(e.location)}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");
}
