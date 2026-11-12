"use client";

import { supabase } from "./supabase";
import { useApp } from "@/store/app";

export type RecentSearch = {
  query: string;
  name: string | null;
  lat: number | null;
  lng: number | null;
  at: number;
};

const KEY = "wump-recent-searches";

export function localRecents(): RecentSearch[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "[]") as RecentSearch[];
    return Array.isArray(raw) ? raw.filter((r) => r && typeof r.query === "string").slice(0, 12) : [];
  } catch {
    return [];
  }
}

function writeLocal(rows: RecentSearch[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(rows.slice(0, 12)));
  } catch {
    /* private mode */
  }
}

export async function loadRecents(): Promise<RecentSearch[]> {
  const local = localRecents();
  const me = useApp.getState().userId;
  if (!me) return local;
  const { data, error } = await supabase.from("wump_recent_searches").select("query, name, lat, lng, created_at").order("created_at", { ascending: false }).limit(12);
  if (error || !data?.length) return local;
  return (data as { query: string; name: string | null; lat: number | null; lng: number | null; created_at: string }[]).map((r) => ({
    query: r.query,
    name: r.name,
    lat: r.lat,
    lng: r.lng,
    at: Date.parse(r.created_at) || Date.now(),
  }));
}

/** Remember a place search on this device, and in Supabase once the migration is applied. */
export async function rememberSearch(row: Omit<RecentSearch, "at">) {
  const q = row.query.trim().slice(0, 120);
  if (q.length < 2) return localRecents();
  const next = [{ ...row, query: q, at: Date.now() }, ...localRecents().filter((r) => r.query.toLowerCase() !== q.toLowerCase())].slice(0, 12);
  writeLocal(next);
  if (!useApp.getState().userId) return next;
  await supabase.rpc("wump_remember_search", {
    p_query: q,
    p_name: row.name,
    p_lat: row.lat,
    p_lng: row.lng,
  });
  return next;
}
