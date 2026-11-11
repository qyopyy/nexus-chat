"use client";

import { supabase, errorText } from "./supabase";
import { useApp } from "@/store/app";

export type RoutePoint = { lat: number; lng: number };

export type SavedRoute = {
  id: string;
  title: string;
  source: "trail" | "heading";
  points: RoutePoint[];
  created_at: string;
};

export type RouteLink = {
  id: string;
  route_id: string;
  token: string;
  expires_at: string;
  revoked: boolean;
  created_at: string;
};

function pointsOf(value: unknown): RoutePoint[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    const lat = Number((row as { lat?: unknown }).lat);
    const lng = Number((row as { lng?: unknown }).lng);
    return Number.isFinite(lat) && Number.isFinite(lng) ? [{ lat, lng }] : [];
  });
}

export async function myRoutes() {
  const me = useApp.getState().userId;
  if (!me) return [] as SavedRoute[];
  const { data, error } = await supabase
    .from("wump_routes")
    .select("id, title, source, points, created_at")
    .eq("user_id", me)
    .order("created_at", { ascending: false });
  if (error) return [] as SavedRoute[];
  return (data ?? []).map((row) => ({
    id: row.id as string,
    title: row.title as string,
    source: row.source as "trail" | "heading",
    points: pointsOf(row.points),
    created_at: row.created_at as string,
  }));
}

export async function myRouteLinks() {
  const me = useApp.getState().userId;
  if (!me) return [] as RouteLink[];
  const { data, error } = await supabase
    .from("wump_route_links")
    .select("id, route_id, token, expires_at, revoked, created_at")
    .eq("user_id", me)
    .eq("revoked", false)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  if (error) return [] as RouteLink[];
  return (data ?? []) as RouteLink[];
}

export async function saveRoute(input: { title: string; source: "trail" | "heading"; points: RoutePoint[] }) {
  const { data, error } = await supabase.rpc("wump_route_save", {
    p_title: input.title,
    p_source: input.source,
    p_points: input.points.slice(0, 300),
  });
  if (error) throw new Error(errorText(error));
  return data as string;
}

export async function shareRoute(routeId: string, minutes: 60 | 1440 | 10080) {
  const { data, error } = await supabase.rpc("wump_route_share", { p_route: routeId, p_minutes: minutes });
  if (error) throw new Error(errorText(error));
  return data as { id: string; token: string; expires_at: string };
}

export async function revokeRouteLink(id: string) {
  const { error } = await supabase.rpc("wump_route_revoke", { p_link: id });
  if (error) throw new Error(errorText(error));
}

export async function deleteRoute(id: string) {
  const me = useApp.getState().userId;
  if (!me) return;
  const { error } = await supabase.from("wump_routes").delete().eq("id", id).eq("user_id", me);
  if (error) throw new Error(errorText(error));
}

export async function openRoute(token: string) {
  const { data, error } = await supabase.rpc("wump_route_open", { p_token: token });
  if (error) throw new Error(errorText(error));
  const row = (data ?? { ok: false }) as { ok: boolean; title?: string; source?: string; points?: unknown; expires_at?: string };
  return { ...row, points: pointsOf(row.points) };
}
