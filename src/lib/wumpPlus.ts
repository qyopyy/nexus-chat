"use client";

import { useEffect, useState } from "react";
import { supabase, errorText } from "./supabase";
import { toast } from "@/store/app";
import { setLongStoryPlus } from "./privileges";

export type WumpPlusStatus = {
  active: boolean;
  /** why it's active: own subscription / Nexus Premium+ / staff */
  via: "plus" | "nexus" | "staff" | null;
  until: string | null;
  permanent: boolean;
  pin_emoji: string | null;
  pin_color: string | null;
  banner_color: string | null;
  price: number | null;
};
export type WumpPlusStyle = { pin_emoji: string | null; pin_color: string | null; banner_color: string | null };

const NONE: WumpPlusStatus = { active: false, via: null, until: null, permanent: false, pin_emoji: null, pin_color: null, banner_color: null, price: 2.99 };

let cache: WumpPlusStatus | null = null;
let inflight: Promise<WumpPlusStatus> | null = null;
const subs = new Set<(s: WumpPlusStatus) => void>();
const emit = (s: WumpPlusStatus) => {
  cache = s;
  setLongStoryPlus(!!s.active);
  subs.forEach((f) => f(s));
};

export async function fetchWumpPlus(force = false): Promise<WumpPlusStatus> {
  if (cache && !force) return cache;
  if (inflight && !force) return inflight;
  inflight = (async () => {
    const { data, error } = await supabase.rpc("wump_plus_status");
    const s = error || !data ? NONE : ({ ...NONE, ...(data as Partial<WumpPlusStatus>) } as WumpPlusStatus);
    emit(s);
    inflight = null;
    return s;
  })();
  return inflight;
}

export function useWumpPlus() {
  const [s, setS] = useState<WumpPlusStatus | null>(cache);
  useEffect(() => {
    subs.add(setS);
    void fetchWumpPlus();
    return () => {
      subs.delete(setS);
    };
  }, []);
  return s;
}

export async function saveWumpPlusStyle(patch: Partial<WumpPlusStyle>) {
  const { data, error } = await supabase.rpc("wump_plus_style", { p: patch });
  if (error) {
    toast(errorText(error) || "Couldn't save", "error");
    return null;
  }
  const s = { ...NONE, ...(data as Partial<WumpPlusStatus>) } as WumpPlusStatus;
  emit(s);
  styleCache.clear();
  return s;
}

/** Admin: days > 0 extends, permanent gives the Wump Plus role, 0 days (not permanent) revokes. */
export async function grantWumpPlus(username: string, days: number, permanent = false) {
  const { data, error } = await supabase.rpc("wump_plus_grant", { p_username: username, p_days: days, p_permanent: permanent });
  if (error) {
    toast(errorText(error) || "Couldn't update Wump Plus", "error");
    return null;
  }
  return data as { user_id: string; active: boolean; until: string | null; permanent: boolean };
}

export type WumpPlusMember = { user_id: string; username: string; until: string | null; permanent: boolean; source: string; updated_at: string };
export async function wumpPlusMembers() {
  const { data, error } = await supabase.rpc("wump_plus_members");
  if (error) return [] as WumpPlusMember[];
  return (data ?? []) as WumpPlusMember[];
}

// Cosmetics of other members (map pins / profile banners), cached for a minute.
const styleCache = new Map<string, { at: number; style: WumpPlusStyle | null }>();
export async function wumpPlusStyles(ids: string[]): Promise<Record<string, WumpPlusStyle>> {
  const now = Date.now();
  const need = [...new Set(ids)].filter((id) => {
    const c = styleCache.get(id);
    return !c || now - c.at > 60_000;
  });
  if (need.length) {
    const { data } = await supabase.rpc("wump_plus_for", { p_ids: need.slice(0, 200) });
    const got = new Map(((data ?? []) as (WumpPlusStyle & { user_id: string })[]).map((r) => [r.user_id, r]));
    for (const id of need) {
      const r = got.get(id);
      styleCache.set(id, { at: now, style: r ? { pin_emoji: r.pin_emoji, pin_color: r.pin_color, banner_color: r.banner_color } : null });
    }
  }
  const out: Record<string, WumpPlusStyle> = {};
  for (const id of ids) {
    const s = styleCache.get(id)?.style;
    if (s) out[id] = s;
  }
  return out;
}

export const PLUS_PIN_EMOJI = ["📍", "⭐", "🔥", "💎", "👑", "🚀", "🎧", "🌙", "🌸", "⚡", "🦋", "🍀", "👻", "🛹", "🎮", "🐉"];
export const PLUS_COLORS = ["#facc15", "#f97316", "#ef4444", "#ec4899", "#a855f7", "#6366f1", "#0ea5e9", "#14b8a6", "#22c55e", "#84cc16", "#f5f5f4", "#0f172a"];
export const PLUS_GOLD = "#facc15";
