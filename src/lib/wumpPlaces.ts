"use client";

import { supabase, errorText } from "./supabase";
import { toast } from "@/store/app";

export type WumpSavedPlace = {
  id: string;
  user_id: string;
  name: string;
  locality: string | null;
  lat: number;
  lng: number;
  note: string | null;
  source: "map" | "live" | "tap" | "profile";
  created_at: string;
};

export type WumpExploreStats = {
  percent: number;
  explored_local: number;
  total_local: number;
  explored_all: number;
  radius_m: number;
  has_location: boolean;
  lat?: number;
  lng?: number;
};

export async function wumpSavePlace(input: {
  name: string;
  lat: number;
  lng: number;
  locality?: string | null;
  note?: string | null;
  source?: WumpSavedPlace["source"];
}) {
  const { data, error } = await supabase.rpc("wump_save_place", {
    p_name: input.name.trim(),
    p_lat: input.lat,
    p_lng: input.lng,
    p_locality: input.locality ?? null,
    p_note: input.note ?? null,
    p_source: input.source ?? "map",
  });
  if (error) {
    toast(errorText(error) || "Couldn't save place", "error");
    return null;
  }
  toast(`Saved “${input.name.trim()}”`, "success");
  return data as WumpSavedPlace;
}

export async function wumpListSavedPlaces() {
  const { data, error } = await supabase.rpc("wump_list_saved_places");
  if (error) return [] as WumpSavedPlace[];
  return (data ?? []) as WumpSavedPlace[];
}

export async function wumpDeleteSavedPlace(id: string) {
  const { data, error } = await supabase.rpc("wump_delete_saved_place", { p_id: id });
  if (error) {
    toast(errorText(error) || "Couldn't delete", "error");
    return false;
  }
  return !!data;
}

export async function wumpExploreMark(lat: number, lng: number) {
  const { data, error } = await supabase.rpc("wump_explore_mark", { p_lat: lat, p_lng: lng });
  if (error) return null;
  return data as { cell_x: number; cell_y: number; new: boolean };
}

export async function wumpExploreStats(lat?: number | null, lng?: number | null, radiusM = 5000) {
  const { data, error } = await supabase.rpc("wump_explore_stats", {
    p_lat: lat ?? null,
    p_lng: lng ?? null,
    p_radius_m: radiusM,
  });
  if (error || !data) {
    return {
      percent: 0,
      explored_local: 0,
      total_local: 0,
      explored_all: 0,
      radius_m: radiusM,
      has_location: false,
    } satisfies WumpExploreStats;
  }
  return data as WumpExploreStats;
}

export function wumpProfileUrl(username: string | null | undefined) {
  if (!username) return null;
  if (typeof window === "undefined") return `https://nexusproject.cc/u/${encodeURIComponent(username)}`;
  return `${window.location.origin}/u/${encodeURIComponent(username)}`;
}
