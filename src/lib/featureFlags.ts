"use client";

import { supabase } from "./supabase";

export type FeatureFlags = {
  phone_link: boolean;
  locator: boolean;
  live_stage: boolean;
  vault_uploads: boolean;
  format_convert: boolean;
  soundcloud_import: boolean;
  link_import: boolean;
};

const ON: FeatureFlags = {
  phone_link: true,
  locator: true,
  live_stage: true,
  vault_uploads: true,
  format_convert: true,
  soundcloud_import: true,
  link_import: true,
};

const FULL = "phone_link, locator, live_stage, vault_uploads, format_convert, soundcloud_import, link_import";
const LEGACY = "phone_link, locator, live_stage, vault_uploads";

let cache: FeatureFlags = ON;
let loaded = 0;

export function featureFlags() {
  return cache;
}

function read(row: Partial<FeatureFlags> | null): FeatureFlags {
  if (!row) return cache;
  return {
    phone_link: row.phone_link !== false,
    locator: row.locator !== false,
    live_stage: row.live_stage !== false,
    vault_uploads: row.vault_uploads !== false,
    format_convert: row.format_convert !== false,
    soundcloud_import: row.soundcloud_import !== false,
    link_import: row.link_import !== false,
  };
}

export async function loadFeatureFlags() {
  if (Date.now() - loaded < 15_000) return cache;
  const first = await supabase.from("site_settings").select(FULL).eq("id", 1).maybeSingle();
  loaded = Date.now();
  if (!first.error) {
    cache = read(first.data as Partial<FeatureFlags> | null);
    return cache;
  }
  const legacy = await supabase.from("site_settings").select(LEGACY).eq("id", 1).maybeSingle();
  if (legacy.error || !legacy.data) return cache;
  cache = read(legacy.data as Partial<FeatureFlags>);
  return cache;
}
