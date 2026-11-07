"use client";

import { supabase, errorText } from "./supabase";
import { toast } from "@/store/app";
import { refreshSpaces } from "./data";

export type DiscoverServer = {
  id: string;
  name: string;
  description: string | null;
  icon_url: string | null;
  icon_color: string;
  banner_url: string | null;
  verified: boolean;
  tags: string[];
  code: string;
  members: number;
  joined: boolean;
};

export const DISCOVER_TAGS = ["music", "hip-hop", "beats", "producers", "gaming", "art", "community", "tech", "anime", "study", "memes", "label"];

export async function discoverServers(query = "", tag = ""): Promise<DiscoverServer[]> {
  const { data, error } = await supabase.rpc("discover_servers", { p_query: query || null, p_tag: tag || null, p_limit: 60 });
  if (error) {
    toast(errorText(error), "error");
    return [];
  }
  return (data as DiscoverServer[] | null) ?? [];
}

export async function setDiscoverable(spaceId: string, on: boolean, tags?: string[]) {
  const { error } = await supabase.rpc("space_set_discoverable", { p_space: spaceId, p_on: on, p_tags: tags ?? null });
  if (error) {
    toast(errorText(error), "error");
    return false;
  }
  await refreshSpaces();
  toast(on ? "Listed in Discover" : "Hidden from Discover", "success");
  return true;
}
