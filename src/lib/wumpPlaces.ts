"use client";

import { supabase, errorText } from "./supabase";
import { toast } from "@/store/app";

export type WumpPlaceSource = "map" | "live" | "tap" | "profile";

export type WumpPlaceRole = "home" | "work" | "school";

export type WumpSavedPlace = {
  id: string;
  user_id: string;
  name: string;
  locality: string | null;
  lat: number;
  lng: number;
  note: string | null;
  source: WumpPlaceSource;
  created_at: string;
  folder_id?: string | null;
  role?: WumpPlaceRole | null;
  alert_arrive?: boolean;
  alert_leave?: boolean;
  share_moves?: boolean;
  alert_radius_m?: number;
  favorite?: boolean;
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

export type WumpExploreMarkResult = {
  cell_x: number;
  cell_y: number;
  new: boolean;
  percent?: number;
  explored_local?: number;
  total_local?: number;
  explored_all?: number;
};

export const WUMP_EXPLORE_EMPTY: WumpExploreStats = {
  percent: 0,
  explored_local: 0,
  total_local: 0,
  explored_all: 0,
  radius_m: 5000,
  has_location: false,
};

const SOURCE_LABEL: Record<WumpPlaceSource, string> = {
  map: "Map",
  live: "While live",
  tap: "Map pin",
  profile: "Profile",
};

function clampCoord(n: number, kind: "lat" | "lng") {
  if (!Number.isFinite(n)) return null;
  if (kind === "lat" && (n < -90 || n > 90)) return null;
  if (kind === "lng" && (n < -180 || n > 180)) return null;
  return n;
}

function normalizePlaceName(name: string) {
  return name.trim().replace(/\s+/g, " ").slice(0, 160);
}

export function wumpPlaceSourceLabel(source: WumpPlaceSource | string | null | undefined) {
  if (!source) return "Saved";
  return SOURCE_LABEL[source as WumpPlaceSource] || "Saved";
}

export function wumpExploreRadiusLabel(radiusM: number) {
  if (!Number.isFinite(radiusM) || radiusM <= 0) return "nearby";
  if (radiusM >= 1000) {
    const km = radiusM / 1000;
    return `${km % 1 === 0 ? km.toFixed(0) : km.toFixed(1)} km`;
  }
  return `${Math.round(radiusM)} m`;
}

export function wumpExploreSummary(stats: WumpExploreStats) {
  if (!stats.has_location) {
    return {
      headline: "Start exploring",
      detail: "Go Live to map the area around you",
      percentLabel: "0%",
    };
  }
  const pct = Math.max(0, Math.min(100, Number(stats.percent) || 0));
  return {
    headline: `${pct % 1 === 0 ? pct.toFixed(0) : pct.toFixed(1)}% explored`,
    detail: `${stats.explored_local.toLocaleString()} of ~${stats.total_local.toLocaleString()} areas within ${wumpExploreRadiusLabel(stats.radius_m)} · ${stats.explored_all.toLocaleString()} total`,
    percentLabel: `${pct % 1 === 0 ? pct.toFixed(0) : pct.toFixed(1)}%`,
  };
}

export function wumpPlaceSubtitle(place: Pick<WumpSavedPlace, "locality" | "lat" | "lng" | "source">) {
  const bits = [
    place.locality?.trim() || null,
    !place.locality ? `${place.lat.toFixed(4)}, ${place.lng.toFixed(4)}` : null,
    wumpPlaceSourceLabel(place.source),
  ].filter(Boolean);
  return bits.join(" · ");
}

export async function wumpSavePlace(input: {
  name: string;
  lat: number;
  lng: number;
  locality?: string | null;
  note?: string | null;
  source?: WumpPlaceSource;
}) {
  const name = normalizePlaceName(input.name);
  const lat = clampCoord(input.lat, "lat");
  const lng = clampCoord(input.lng, "lng");
  if (!name) {
    toast("Give this place a name", "error");
    return null;
  }
  if (lat == null || lng == null) {
    toast("Invalid map coordinates", "error");
    return null;
  }

  const { data, error } = await supabase.rpc("wump_save_place", {
    p_name: name,
    p_lat: lat,
    p_lng: lng,
    p_locality: input.locality?.trim()?.slice(0, 120) || null,
    p_note: input.note?.trim()?.slice(0, 280) || null,
    p_source: input.source ?? "map",
  });
  if (error) {
    toast(errorText(error) || "Couldn't save place", "error");
    return null;
  }
  toast(`Saved “${name}”`, "success");
  return data as WumpSavedPlace;
}

export async function wumpListSavedPlaces() {
  const { data, error } = await supabase.rpc("wump_list_saved_places");
  if (error) return [] as WumpSavedPlace[];
  return (data ?? []) as WumpSavedPlace[];
}

export async function wumpDeleteSavedPlace(id: string) {
  if (!id) return false;
  const { data, error } = await supabase.rpc("wump_delete_saved_place", { p_id: id });
  if (error) {
    toast(errorText(error) || "Couldn't remove place", "error");
    return false;
  }
  return !!data;
}

export async function wumpExploreMark(lat: number, lng: number) {
  const la = clampCoord(lat, "lat");
  const ln = clampCoord(lng, "lng");
  if (la == null || ln == null) return null;
  const { data, error } = await supabase.rpc("wump_explore_mark", { p_lat: la, p_lng: ln });
  if (error) return null;
  return data as WumpExploreMarkResult;
}

export async function wumpExploreStats(lat?: number | null, lng?: number | null, radiusM = 5000) {
  const { data, error } = await supabase.rpc("wump_explore_stats", {
    p_lat: lat ?? null,
    p_lng: lng ?? null,
    p_radius_m: radiusM,
  });
  if (error || !data) return { ...WUMP_EXPLORE_EMPTY, radius_m: radiusM };
  const row = data as WumpExploreStats;
  return {
    ...WUMP_EXPLORE_EMPTY,
    ...row,
    percent: Math.max(0, Math.min(100, Number(row.percent) || 0)),
    explored_local: Math.max(0, Number(row.explored_local) || 0),
    total_local: Math.max(0, Number(row.total_local) || 0),
    explored_all: Math.max(0, Number(row.explored_all) || 0),
    radius_m: Number(row.radius_m) || radiusM,
    has_location: !!row.has_location,
  };
}

export function wumpProfileUrl(username: string | null | undefined) {
  if (!username) return null;
  const clean = username.trim().replace(/^@/, "");
  if (!clean) return null;
  if (typeof window === "undefined") return `https://nexusproject.cc/u/${encodeURIComponent(clean)}`;
  return `${window.location.origin}/u/${encodeURIComponent(clean)}`;
}

const FAV_KEY = "wump-local-favorites";

export function localFavoriteIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(localStorage.getItem(FAV_KEY) || "[]") as unknown;
    return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

/** Star a saved place. Writes locally immediately and to Supabase when the migration is applied. */
export async function wumpSetFavorite(id: string, on: boolean) {
  if (!id) return false;
  const ids = new Set(localFavoriteIds());
  if (on) ids.add(id);
  else ids.delete(id);
  try {
    localStorage.setItem(FAV_KEY, JSON.stringify([...ids].slice(0, 200)));
  } catch {
    /* private mode */
  }
  const { error } = await supabase.rpc("wump_set_place_favorite", { p_place: id, p_on: on });
  if (error && !/could not find|schema cache|does not exist|PGRST202|42883/i.test(`${error.message} ${error.code ?? ""}`)) {
    toast(errorText(error) || "Couldn't update favorite", "error");
    return false;
  }
  return true;
}

export function wumpUsernameHandle(username: string | null | undefined) {
  if (!username?.trim()) return null;
  const clean = username.trim().replace(/^@/, "");
  return clean ? `@${clean}` : null;
}
