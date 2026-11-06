"use client";

/**
 * Wump location privacy + session prefs.
 * Server columns live on user_privacy; local mirrors for instant UI.
 */

import { supabase } from "@/lib/supabase";
import type { BumpVisible } from "@/lib/bump";

export type WumpPrecision = "exact" | "approx" | "city";
export type WumpInvitePolicy = "everyone" | "friends" | "nobody";

export type WumpPrivacy = {
  wump_default_visible: BumpVisible;
  wump_precision: WumpPrecision;
  wump_allow_background: boolean;
  wump_allow_nearby_alerts: boolean;
  wump_who_can_invite: WumpInvitePolicy;
  wump_share_enabled: boolean;
};

export const WUMP_PRIVACY_DEF: WumpPrivacy = {
  wump_default_visible: "friends",
  wump_precision: "approx",
  wump_allow_background: true,
  wump_allow_nearby_alerts: true,
  wump_who_can_invite: "friends",
  wump_share_enabled: true,
};

const LOCAL_KEY = "nexus.wump.privacy.v1";

export function precisionLabel(p: WumpPrecision) {
  if (p === "exact") return "Exact GPS pin (most precise)";
  if (p === "city") return "City area (~1 km radius on the map)";
  return "Neighborhood (~100 m radius on the map)";
}

/** Meters used when fuzzing a Live pin for map publish. */
export function precisionRadiusMeters(p: WumpPrecision) {
  if (p === "city") return 1000;
  if (p === "approx") return 100;
  return 0;
}

export function loadWumpPrivacyLocal(): WumpPrivacy {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return { ...WUMP_PRIVACY_DEF };
    return { ...WUMP_PRIVACY_DEF, ...(JSON.parse(raw) as Partial<WumpPrivacy>) };
  } catch {
    return { ...WUMP_PRIVACY_DEF };
  }
}

export function saveWumpPrivacyLocal(p: WumpPrivacy) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(p));
  } catch {
    /* private mode */
  }
}

export async function fetchWumpPrivacy(userId: string): Promise<WumpPrivacy> {
  const { data } = await supabase
    .from("user_privacy")
    .select(
      "wump_default_visible,wump_precision,wump_allow_background,wump_allow_nearby_alerts,wump_who_can_invite,wump_share_enabled",
    )
    .eq("user_id", userId)
    .maybeSingle();
  const next = { ...WUMP_PRIVACY_DEF, ...(data as Partial<WumpPrivacy> | null) };
  saveWumpPrivacyLocal(next);
  return next;
}

export async function saveWumpPrivacy(userId: string, patch: Partial<WumpPrivacy>, current: WumpPrivacy) {
  const next = { ...current, ...patch };
  saveWumpPrivacyLocal(next);
  const { error } = await supabase.from("user_privacy").upsert(
    {
      user_id: userId,
      ...next,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw error;
  return next;
}
