"use client";

import { supabase, errorText } from "./supabase";
import { useApp } from "@/store/app";

export type LiveShare = {
  id: string;
  token: string;
  label: string | null;
  lat: number;
  lng: number;
  accuracy_m: number | null;
  expires_at: string;
  revoked: boolean;
  created_at: string;
};

export type HeadingMember = {
  user_id: string;
  username: string | null;
  display_name: string | null;
  lat: number | null;
  lng: number | null;
  accuracy_m: number | null;
  eta_min: number | null;
  updated_at: string;
};

export type HeadingState = {
  ok: boolean;
  id?: string;
  token?: string;
  title?: string;
  host_id?: string;
  dest_lat?: number;
  dest_lng?: number;
  dest_name?: string | null;
  expires_at?: string;
  members?: HeadingMember[];
};

export type CheckIn = {
  id: string;
  user_id: string;
  place_id: string | null;
  name: string;
  lat: number;
  lng: number;
  note: string | null;
  created_at: string;
};

export async function startLiveShare(input: { label?: string; minutes: number; lat: number; lng: number; accuracy?: number | null }) {
  const { data, error } = await supabase.rpc("wump_live_share_start", {
    p_label: input.label ?? null,
    p_minutes: input.minutes,
    p_lat: input.lat,
    p_lng: input.lng,
    p_accuracy: input.accuracy ?? null,
  });
  if (error) throw new Error(errorText(error));
  return data as { id: string; token: string; expires_at: string };
}

export async function pingLiveShare(id: string, lat: number, lng: number, accuracy?: number | null) {
  await supabase.rpc("wump_live_share_ping", { p_id: id, p_lat: lat, p_lng: lng, p_accuracy: accuracy ?? null });
}

export async function revokeLiveShare(id: string) {
  const { error } = await supabase.rpc("wump_live_share_revoke", { p_id: id });
  if (error) throw new Error(errorText(error));
}

export async function myLiveShares() {
  const me = useApp.getState().userId;
  if (!me) return [] as LiveShare[];
  const { data } = await supabase
    .from("wump_live_shares")
    .select("id, token, label, lat, lng, accuracy_m, expires_at, revoked, created_at")
    .eq("owner_id", me)
    .eq("revoked", false)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  return (data ?? []) as LiveShare[];
}

export async function openLiveShare(token: string) {
  const { data, error } = await supabase.rpc("wump_live_share_open", { p_token: token });
  if (error) throw new Error(errorText(error));
  return data as { ok: boolean; label?: string | null; name?: string | null; lat?: number; lng?: number; accuracy_m?: number | null; expires_at?: string };
}

export async function startHeading(input: { title: string; lat: number; lng: number; name?: string | null; minutes?: number }) {
  const { data, error } = await supabase.rpc("wump_heading_start", {
    p_title: input.title,
    p_lat: input.lat,
    p_lng: input.lng,
    p_name: input.name ?? null,
    p_minutes: input.minutes ?? 120,
  });
  if (error) throw new Error(errorText(error));
  return data as { id: string; token: string; expires_at: string };
}

export async function joinHeading(token: string) {
  const { data, error } = await supabase.rpc("wump_heading_join", { p_token: token });
  if (error) throw new Error(errorText(error));
  return data as HeadingState;
}

export async function pingHeading(id: string, lat: number, lng: number, accuracy: number | null, eta: number) {
  const { error } = await supabase.rpc("wump_heading_ping", { p_id: id, p_lat: lat, p_lng: lng, p_accuracy: accuracy, p_eta: eta });
  if (error) throw new Error(errorText(error));
}

export async function endHeading(id: string) {
  const { error } = await supabase.rpc("wump_heading_end", { p_id: id });
  if (error) throw new Error(errorText(error));
}

export async function headingState(id: string) {
  const { data, error } = await supabase.rpc("wump_heading_state", { p_id: id });
  if (error) throw new Error(errorText(error));
  const row = data as HeadingState;
  return { ...row, members: Array.isArray(row.members) ? row.members : [] };
}

export function subscribeHeading(id: string, onChange: () => void) {
  const channel = supabase
    .channel(`wump-heading:${id}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "wump_heading_members", filter: `heading_id=eq.${id}` }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "wump_headings", filter: `id=eq.${id}` }, onChange)
    .subscribe();
  return () => void supabase.removeChannel(channel);
}

export async function myCheckins() {
  const me = useApp.getState().userId;
  if (!me) return [] as CheckIn[];
  const { data, error } = await supabase.from("wump_checkins").select("*").eq("user_id", me).order("created_at", { ascending: false }).limit(40);
  if (error) return [] as CheckIn[];
  return (data ?? []) as CheckIn[];
}

export async function addCheckin(input: { placeId?: string | null; name: string; lat: number; lng: number; note?: string | null }) {
  const me = useApp.getState().userId;
  if (!me) throw new Error("Sign in required");
  const { error } = await supabase.from("wump_checkins").insert({
    user_id: me,
    place_id: input.placeId ?? null,
    name: input.name.slice(0, 160),
    lat: input.lat,
    lng: input.lng,
    note: input.note?.trim().slice(0, 280) || null,
  });
  if (error) throw new Error(errorText(error));
}

export async function deleteCheckin(id: string) {
  const me = useApp.getState().userId;
  if (!me) return;
  await supabase.from("wump_checkins").delete().eq("id", id).eq("user_id", me);
}
