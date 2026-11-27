"use client";

// Network side of profile sounds and people search (the rules are in snapSounds.ts, the 24/48 hour limit is in the database).

import { supabase, errorText } from "@/lib/supabase";
import { isMissingRpc } from "@/lib/snap";
import { cleanPeopleQuery, cleanQuery, isActive, pickFromSpotify, type Sound, type SoundPick } from "@/lib/snapSounds";

export type Person = { id: string; username: string; display_name: string | null; avatar_color: string | null; avatar_url: string | null };

const SETUP_HINT = "Sounds aren't switched on yet. Run SNAP-SETUP.sql in Supabase.";

/** Spotify's song library, through the Nexus Spotify proxy (the Spotify secret stays on the server). */
export async function searchTracks(q: string): Promise<SoundPick[]> {
  const query = cleanQuery(q);
  if (!query) return [];
  const { data, error } = await supabase.functions.invoke("spotify", { body: { action: "search", type: "track", q: query } });
  if (error) {
    let msg = errorText(error);
    try {
      const j = await (error as { context?: Response }).context?.json();
      if (j?.error) msg = j.error;
    } catch {
      /* not json */
    }
    throw new Error(msg || "Couldn't reach Spotify.");
  }
  const items = Array.isArray((data as { items?: unknown[] } | null)?.items) ? ((data as { items: unknown[] }).items) : [];
  return items.map(pickFromSpotify).filter((x): x is SoundPick => !!x);
}

/** Sounds that are still running, by person. Expired ones never come back (the database hides them, and we check again). */
export async function getSounds(userIds: string[]): Promise<Record<string, Sound>> {
  const ids = [...new Set(userIds)].filter(Boolean).slice(0, 50);
  if (!ids.length) return {};
  const { data, error } = await supabase.from("profile_sounds").select("*").in("user_id", ids);
  if (error || !Array.isArray(data)) return {}; // not set up yet: no sounds, no errors on screen
  const now = Date.now();
  const out: Record<string, Sound> = {};
  for (const r of data as Sound[]) if (isActive(r, now)) out[r.user_id] = r;
  return out;
}

export async function setMySound(p: SoundPick): Promise<Sound> {
  const { data, error } = await supabase.rpc("set_profile_sound", {
    p_track_id: p.track_id,
    p_title: p.title,
    p_artist: p.artist,
    p_cover_url: p.cover_url,
    p_preview_url: p.preview_url,
    p_spotify_url: p.spotify_url,
  });
  if (error) {
    if (isMissingRpc(error)) throw new Error(SETUP_HINT);
    throw new Error(errorText(error) || "Couldn't set the sound.");
  }
  return (Array.isArray(data) ? data[0] : data) as Sound;
}

export async function clearMySound(): Promise<void> {
  const { error } = await supabase.rpc("clear_profile_sound");
  if (error && !isMissingRpc(error)) throw new Error(errorText(error) || "Couldn't remove the sound.");
}

/** Find Nexus people by the start of their username. */
export async function searchPeople(q: string): Promise<Person[]> {
  const s = cleanPeopleQuery(q);
  if (!s) return [];
  const { data, error } = await supabase.from("profiles").select("id,username,display_name,avatar_color,avatar_url").ilike("username", `${s}%`).order("username").limit(12);
  if (error || !Array.isArray(data)) return [];
  return data as Person[];
}
