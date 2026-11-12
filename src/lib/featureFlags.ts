"use client";

import { supabase } from "./supabase";

export type FeatureFlags = {
  phone_link: boolean;
  locator: boolean;
  live_stage: boolean;
  vault_uploads: boolean;
};

const ON: FeatureFlags = { phone_link: true, locator: true, live_stage: true, vault_uploads: true };

let cache: FeatureFlags = ON;
let loaded = 0;

export function featureFlags() {
  return cache;
}

export async function loadFeatureFlags() {
  if (Date.now() - loaded < 15_000) return cache;
  const { data, error } = await supabase.from("site_settings").select("phone_link, locator, live_stage, vault_uploads").eq("id", 1).maybeSingle();
  loaded = Date.now();
  if (error || !data) return cache;
  const row = data as Partial<FeatureFlags>;
  cache = {
    phone_link: row.phone_link !== false,
    locator: row.locator !== false,
    live_stage: row.live_stage !== false,
    vault_uploads: row.vault_uploads !== false,
  };
  return cache;
}
