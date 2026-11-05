"use client";

import { supabase, errorText } from "./supabase";
import { useApp, toast } from "@/store/app";
import { loadProfiles } from "./data";
import { getDeviceLocation, requestLocationPermission } from "./location";

export type BumpVisible = "friends" | "family" | "everyone";

export type BumpNearby = {
  user_id: string;
  lat: number;
  lng: number;
  accuracy_m: number | null;
  visible: BumpVisible;
  label: string | null;
  updated_at: string;
  meters: number;
};

export function openBump() {
  const mobile = typeof window !== "undefined" && window.innerWidth < 768;
  useApp.setState(mobile ? { mobileTab: "apps", hub: "bump" } : { hub: "bump" });
}

export function bumpInviteLink(code: string) {
  const clean = code.trim();
  if (typeof window === "undefined") return `https://nexusproject.cc/b/${encodeURIComponent(clean)}`;
  return `${window.location.origin}/b/${encodeURIComponent(clean)}`;
}

export async function bumpPublish(visible: BumpVisible = "friends", label?: string) {
  const perm = await requestLocationPermission();
  if (perm === "denied") {
    toast("Location is off — enable it in iPhone Settings → Nexus → Location", "error");
    return null;
  }
  try {
    const loc = await getDeviceLocation({ highAccuracy: true });
    const { data, error } = await supabase.rpc("bump_publish", {
      p_lat: loc.lat,
      p_lng: loc.lng,
      p_accuracy: loc.accuracy,
      p_visible: visible,
      p_label: label ?? null,
    });
    if (error) {
      toast(errorText(error) || "Couldn't share location", "error");
      return null;
    }
    toast(loc.source === "capacitor" ? "Bump live — finding people nearby" : "Bump live", "success");
    return data as { user_id: string; lat: number; lng: number; updated_at: string };
  } catch (e) {
    toast(e instanceof Error ? e.message : "Location failed", "error");
    return null;
  }
}

export async function bumpClear() {
  const { error } = await supabase.rpc("bump_clear");
  if (error) toast(errorText(error) || "Couldn't clear", "error");
  else toast("Location sharing stopped", "info");
  return !error;
}

export async function bumpNearby(radiusM = 500) {
  const { data, error } = await supabase.rpc("bump_nearby", { p_radius_m: radiusM });
  if (error) {
    toast(errorText(error) || "Nearby lookup failed", "error");
    return [] as BumpNearby[];
  }
  const rows = (data ?? []) as BumpNearby[];
  if (rows.length) await loadProfiles(rows.map((r) => r.user_id));
  return rows;
}

export async function bumpListFamily() {
  const me = useApp.getState().userId;
  if (!me) return [];
  const { data, error } = await supabase.from("bump_family").select("member_id").eq("user_id", me);
  if (error || !data) return [];
  const ids = data.map((r) => r.member_id as string);
  if (ids.length) await loadProfiles(ids);
  return ids;
}

export async function bumpRemoveFamily(memberId: string) {
  const me = useApp.getState().userId;
  if (!me) return false;
  await supabase.from("bump_family").delete().eq("user_id", me).eq("member_id", memberId);
  await supabase.from("bump_family").delete().eq("user_id", memberId).eq("member_id", me);
  return true;
}

export async function bumpCreateInvite(kind: "family" | "friend" | "nearby" = "family") {
  const { data, error } = await supabase.rpc("bump_create_invite", { p_kind: kind });
  if (error || !data) {
    toast(errorText(error) || "Couldn't create invite", "error");
    return null;
  }
  return String(data);
}

export async function bumpRedeemInvite(code: string) {
  const { data, error } = await supabase.rpc("bump_redeem_invite", { p_code: code.trim() });
  if (error) {
    toast(errorText(error) || "Invite failed", "error");
    return null;
  }
  const out = data as { ok?: boolean; creator_id?: string; kind?: string };
  if (out.creator_id) await loadProfiles([out.creator_id]);
  toast(out.kind === "family" ? "Added to family circle" : "Invite accepted", "success");
  return out;
}
