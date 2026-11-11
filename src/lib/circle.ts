"use client";

import { supabase, errorText } from "./supabase";
import { useApp } from "@/store/app";
import { loadProfiles } from "./data";

const SHARE_KEY = "nexus:circle-self";

export type CircleGrant = {
  id: string;
  owner_id: string;
  viewer_id: string;
  subject: "self" | "device";
  device_id: string | null;
  status: "pending" | "active" | "declined";
  expires_at: string;
  revoked: boolean;
  created_at: string;
};

export type CirclePin = {
  grant_id: string;
  owner_id: string;
  name: string;
  subject: "self" | "device";
  device_id: string | null;
  label: string | null;
  lat: number | null;
  lng: number | null;
  accuracy_m: number | null;
  fresh: boolean;
  expires_at: string;
};

export function circleSharingOn() {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(SHARE_KEY) === "1";
}

export async function setCircleSharing(on: boolean) {
  const { error } = await supabase.rpc("nexus_circle_set_sharing", { p_on: on });
  if (error) throw new Error(errorText(error));
  localStorage.setItem(SHARE_KEY, on ? "1" : "0");
}

export async function pingCircle(lat: number, lng: number, accuracy: number | null) {
  if (!circleSharingOn()) return;
  await supabase.rpc("nexus_circle_ping", { p_lat: lat, p_lng: lng, p_accuracy: accuracy });
}

export async function myCircleGrants() {
  const me = useApp.getState().userId;
  if (!me) return [] as CircleGrant[];
  const { data, error } = await supabase
    .from("nexus_circle_grants")
    .select("id, owner_id, viewer_id, subject, device_id, status, expires_at, revoked, created_at")
    .or(`owner_id.eq.${me},viewer_id.eq.${me}`)
    .order("created_at", { ascending: false });
  if (error) return [] as CircleGrant[];
  const rows = (data ?? []) as CircleGrant[];
  await loadProfiles(rows.flatMap((row) => [row.owner_id, row.viewer_id]));
  return rows;
}

export async function circleFriends() {
  const me = useApp.getState().userId;
  if (!me) return [] as string[];
  const { data } = await supabase.from("friendships").select("requester_id, addressee_id, status").eq("status", "accepted");
  const ids = (data ?? []).map((row) => (row.requester_id === me ? row.addressee_id : row.requester_id) as string);
  await loadProfiles(ids);
  return ids;
}

export async function inviteCircle(viewerId: string, subject: "self" | "device", deviceId: string | null, hours: number) {
  const { error } = await supabase.rpc("nexus_circle_invite", {
    p_viewer: viewerId,
    p_subject: subject,
    p_device: deviceId,
    p_hours: hours,
  });
  if (error) throw new Error(errorText(error));
}

export async function respondCircle(id: string, accept: boolean) {
  const { error } = await supabase.rpc("nexus_circle_respond", { p_id: id, p_accept: accept });
  if (error) throw new Error(errorText(error));
}

export async function revokeCircle(id: string) {
  const { error } = await supabase.rpc("nexus_circle_revoke", { p_id: id });
  if (error) throw new Error(errorText(error));
}

export async function circlePins() {
  const { data, error } = await supabase.rpc("nexus_circle_visible");
  if (error) return [] as CirclePin[];
  const rows = Array.isArray(data) ? data : [];
  return rows as CirclePin[];
}

export async function myCircleSharing() {
  const me = useApp.getState().userId;
  if (!me) return false;
  const { data } = await supabase.from("nexus_circle_self").select("sharing").eq("user_id", me).maybeSingle();
  const on = !!data?.sharing;
  if (typeof localStorage !== "undefined") localStorage.setItem(SHARE_KEY, on ? "1" : "0");
  return on;
}
