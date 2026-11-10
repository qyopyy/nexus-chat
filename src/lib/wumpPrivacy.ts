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
  /** Opt-in 48h trail of the already-fuzzed Live pin. Off until the user turns it on. */
  wump_record_trail: boolean;
  /** Friends who can see the Live pin may read the recent trail. */
  wump_share_trail: boolean;
  wump_onboarded_at: string | null;
};

export const WUMP_PRIVACY_DEF: WumpPrivacy = {
  wump_default_visible: "friends",
  wump_precision: "approx",
  wump_allow_background: true,
  wump_allow_nearby_alerts: true,
  wump_who_can_invite: "friends",
  wump_share_enabled: true,
  wump_record_trail: false,
  wump_share_trail: false,
  wump_onboarded_at: null,
};

const PRIVACY_CORE =
  "wump_default_visible,wump_precision,wump_allow_background,wump_allow_nearby_alerts,wump_who_can_invite,wump_share_enabled";
const PRIVACY_EXTRA = `${PRIVACY_CORE},wump_record_trail,wump_share_trail,wump_onboarded_at`;

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
  const full = await supabase.from("user_privacy").select(PRIVACY_EXTRA).eq("user_id", userId).maybeSingle();
  const data = full.error
    ? (await supabase.from("user_privacy").select(PRIVACY_CORE).eq("user_id", userId).maybeSingle()).data
    : full.data;
  const next = { ...WUMP_PRIVACY_DEF, ...(data as Partial<WumpPrivacy> | null) };
  saveWumpPrivacyLocal(next);
  return next;
}

export async function saveWumpPrivacy(userId: string, patch: Partial<WumpPrivacy>, current: WumpPrivacy) {
  const next = { ...current, ...patch };
  if (next.wump_share_trail) next.wump_record_trail = true;
  if (!next.wump_record_trail) next.wump_share_trail = false;
  saveWumpPrivacyLocal(next);
  const row = {
    user_id: userId,
    ...next,
    updated_at: new Date().toISOString(),
  };
  let { error } = await supabase.from("user_privacy").upsert(row, { onConflict: "user_id" });
  if (error && /wump_record_trail|wump_share_trail|wump_onboarded_at/i.test(error.message)) {
    const { wump_record_trail: _a, wump_share_trail: _b, wump_onboarded_at: _c, ...rest } = next;
    ({ error } = await supabase.from("user_privacy").upsert(
      { user_id: userId, ...rest, updated_at: row.updated_at },
      { onConflict: "user_id" },
    ));
  }
  if (error) throw error;
  return next;
}
