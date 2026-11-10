"use client";

import { supabase, errorText } from "./supabase";
import { loadProfiles } from "./data";
import { toast, useApp } from "@/store/app";

export type WumpActivity = "still" | "walk" | "bike" | "drive";
export type WumpPlaceRole = "home" | "work" | "school";
export type WumpNudgeKind = "wave" | "poke" | "heart" | "hurry" | "coffee" | "here";

export type WumpTrailPoint = {
  lat: number;
  lng: number;
  activity: WumpActivity | null;
  recorded_at: string;
};

export type WumpPlaceEvent = {
  id: number;
  place_id: string | null;
  place_name: string;
  kind: "arrive" | "leave";
  created_at: string;
};

export type WumpMeetupMember = {
  user_id: string;
  status: "invited" | "going" | "maybe" | "no";
  eta_min: number | null;
};

export type WumpMeetup = {
  id: string;
  host_id: string;
  title: string;
  note: string | null;
  place_name: string | null;
  lat: number;
  lng: number;
  starts_at: string;
  expires_at: string;
  my_status: WumpMeetupMember["status"];
  my_eta_min: number | null;
  members: WumpMeetupMember[];
};

export type WumpNudge = {
  id: number;
  from_id: string;
  kind: WumpNudgeKind;
  created_at: string;
};

export const NUDGE_EMOJI: Record<WumpNudgeKind, string> = {
  wave: "👋",
  poke: "👉",
  heart: "❤️",
  hurry: "⚡",
  coffee: "☕",
  here: "📍",
};

export const NUDGE_LABEL: Record<WumpNudgeKind, string> = {
  wave: "Wave",
  poke: "Poke",
  heart: "Heart",
  hurry: "Hurry",
  coffee: "Coffee",
  here: "I'm here",
};

const NUDGE_KINDS: WumpNudgeKind[] = ["wave", "poke", "heart", "hurry", "coffee", "here"];

export function wumpActivityWord(activity?: string | null) {
  if (activity === "walk") return "Walking";
  if (activity === "bike") return "Cycling";
  if (activity === "drive") return "Driving";
  if (activity === "still") return "Still";
  return null;
}

export function wumpRoleWord(role?: string | null) {
  if (role === "home") return "At home";
  if (role === "work") return "At work";
  if (role === "school") return "At school";
  return null;
}

export function wumpRoleEmoji(role?: string | null) {
  if (role === "home") return "🏠";
  if (role === "work") return "💼";
  if (role === "school") return "🎓";
  return null;
}

/** One line for a friend row: status, motion, battery. */
export function wumpPresenceBits(n: {
  place_status?: string | null;
  activity?: string | null;
  battery_pct?: number | null;
  speed_mps?: number | null;
  label?: string | null;
  place_name?: string | null;
  place_locality?: string | null;
} | null | undefined) {
  if (!n) return [] as string[];
  const bits: string[] = [];
  const role = wumpRoleWord(n.place_status);
  const moving = wumpActivityWord(n.activity);
  if (role) bits.push(role);
  if (moving && moving !== "Still") bits.push(moving);
  else if (moving === "Still" && !role) bits.push("Still");
  if (n.battery_pct != null && Number.isFinite(Number(n.battery_pct))) bits.push(`🔋 ${Math.round(Number(n.battery_pct))}%`);
  if (n.speed_mps != null && n.speed_mps > 0.6) bits.push(`${Math.round(n.speed_mps * 3.6)} km/h`);
  const where = n.label || n.place_name || n.place_locality;
  if (where && where !== role) bits.push(where);
  return bits;
}

function missingRpc(error: { message?: string; code?: string } | null) {
  const msg = `${error?.message ?? ""} ${error?.code ?? ""}`;
  return /could not find|schema cache|does not exist|PGRST202|42883/i.test(msg);
}

function asArray<T>(data: unknown): T[] {
  if (typeof data === "string") {
    try {
      data = JSON.parse(data) as unknown;
    } catch {
      return [];
    }
  }
  if (Array.isArray(data)) return data as T[];
  return [];
}

export async function wumpMyTrail(hours = 24) {
  const { data, error } = await supabase.rpc("wump_my_trail", { p_hours: hours });
  if (error) return [] as WumpTrailPoint[];
  return asArray<WumpTrailPoint>(data);
}

export async function wumpFriendTrail(userId: string, hours = 6) {
  const { data, error } = await supabase.rpc("wump_friend_trail", { p_user: userId, p_hours: hours });
  if (error) return [] as WumpTrailPoint[];
  return asArray<WumpTrailPoint>(data);
}

export async function wumpClearTrail() {
  const { data, error } = await supabase.rpc("wump_clear_trail");
  if (error) {
    toast(errorText(error) || "Couldn't clear the trail", "error");
    return false;
  }
  toast(typeof data === "number" && data > 0 ? "Trail cleared" : "No trail to clear", "success");
  if (typeof window !== "undefined") window.dispatchEvent(new Event("wump-trail"));
  return true;
}

export async function wumpSetPlaceWatch(input: {
  placeId: string;
  role: WumpPlaceRole | null;
  arrive: boolean;
  leave: boolean;
  share: boolean;
  radiusM?: number | null;
}) {
  const { data, error } = await supabase.rpc("wump_set_place_watch", {
    p_place: input.placeId,
    p_role: input.role,
    p_arrive: input.arrive,
    p_leave: input.leave,
    p_share: input.share,
    p_radius: input.radiusM ?? null,
  });
  if (error) {
    toast(errorText(error) || "Couldn't update this place", "error");
    return null;
  }
  return data as {
    id: string;
    role: WumpPlaceRole | null;
    alert_arrive: boolean;
    alert_leave: boolean;
    share_moves: boolean;
    alert_radius_m: number;
  };
}

export async function wumpPlaceEvents() {
  const { data, error } = await supabase.rpc("wump_place_events", { p_limit: 20 });
  if (error) return [] as WumpPlaceEvent[];
  return asArray<WumpPlaceEvent>(data);
}

export function pingMeetups() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("wump-meetups"));
}

export async function wumpListMeetups() {
  const { data, error } = await supabase.rpc("wump_list_meetups");
  if (error) return [] as WumpMeetup[];
  const rows = asArray<WumpMeetup>(data).map((m) => ({
    ...m,
    members: Array.isArray(m.members) ? m.members : [],
  }));
  const ids = rows.flatMap((m) => [m.host_id, ...m.members.map((x) => x.user_id)]);
  if (ids.length) await loadProfiles([...new Set(ids)]);
  return rows;
}

export async function wumpCreateMeetup(input: {
  title: string;
  lat: number;
  lng: number;
  placeName?: string | null;
  note?: string | null;
  invite: string[];
}) {
  const { data, error } = await supabase.rpc("wump_create_meetup", {
    p_title: input.title.trim().slice(0, 80),
    p_lat: input.lat,
    p_lng: input.lng,
    p_place_name: input.placeName ?? null,
    p_note: input.note?.trim().slice(0, 280) || null,
    p_starts_at: new Date().toISOString(),
    p_invite: input.invite.slice(0, 30),
  });
  if (error || !data) {
    toast(errorText(error) || "Couldn't create the meetup", "error");
    return null;
  }
  const row = data as { id: string; invited: number };
  toast(row.invited ? `Meetup sent to ${row.invited}` : "Meetup saved", "success");
  pingMeetups();
  return row;
}

export async function wumpRsvp(meetupId: string, status: "going" | "maybe" | "no") {
  const { error } = await supabase.rpc("wump_rsvp_meetup", { p_meetup: meetupId, p_status: status, p_eta: null });
  if (error) {
    toast(errorText(error) || "Couldn't update RSVP", "error");
    return false;
  }
  pingMeetups();
  return true;
}

export async function wumpShareEta(meetupId: string) {
  const { data, error } = await supabase.rpc("wump_share_meetup_eta", { p_meetup: meetupId });
  if (error || data == null) {
    toast(errorText(error) || "Couldn't share an ETA", "error");
    return null;
  }
  const mins = Number(data);
  toast(Number.isFinite(mins) ? `ETA shared · about ${mins} min` : "ETA shared", "success");
  pingMeetups();
  return mins;
}

export async function wumpCancelMeetup(meetupId: string) {
  const { data, error } = await supabase.rpc("wump_cancel_meetup", { p_meetup: meetupId });
  if (error || !data) {
    toast(errorText(error) || "Couldn't cancel", "error");
    return false;
  }
  toast("Meetup ended", "info");
  pingMeetups();
  return true;
}

export type WumpNudgeResult = "ok" | "missing" | "error";

export async function wumpNudge(to: string, kind: WumpNudgeKind): Promise<WumpNudgeResult> {
  if (!NUDGE_KINDS.includes(kind)) return "error";
  const { error } = await supabase.rpc("wump_nudge", { p_to: to, p_kind: kind });
  if (!error) {
    toast(`${NUDGE_EMOJI[kind]} ${NUDGE_LABEL[kind]} sent`, "success");
    return "ok";
  }
  if (missingRpc(error)) return "missing";
  toast(errorText(error) || "Couldn't send that nudge", "error");
  return "error";
}

export async function wumpUnseenNudges() {
  const { data, error } = await supabase.rpc("wump_unseen_nudges");
  if (error) return [] as WumpNudge[];
  return asArray<WumpNudge>(data);
}

export async function wumpNudgesSeen(ids?: number[]) {
  await supabase.rpc("wump_nudges_seen", { p_ids: ids ?? null });
}

export function subscribeWumpNudges(onNudge: (nudge: WumpNudge) => void) {
  const me = useApp.getState().userId;
  if (!me) return () => {};
  const key = `wump-nudges:${me}:${Math.random().toString(36).slice(2, 7)}`;
  const ch = supabase
    .channel(key)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "wump_nudges", filter: `to_id=eq.${me}` }, (payload) => {
      const row = payload.new as WumpNudge;
      if (!row?.id || row.from_id === me) return;
      onNudge(row);
    });
  void ch.subscribe();
  return () => {
    void supabase.removeChannel(ch);
  };
}

export function subscribeWumpMeetups(onChange: () => void) {
  const me = useApp.getState().userId;
  if (!me) return () => {};
  const key = `wump-meetups:${me}:${Math.random().toString(36).slice(2, 7)}`;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const kick = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(onChange, 300);
  };
  const ch = supabase
    .channel(key)
    .on("postgres_changes", { event: "*", schema: "public", table: "wump_meetups" }, kick)
    .on("postgres_changes", { event: "*", schema: "public", table: "wump_meetup_rsvps" }, kick);
  void ch.subscribe();
  return () => {
    if (timer) clearTimeout(timer);
    void supabase.removeChannel(ch);
  };
}
