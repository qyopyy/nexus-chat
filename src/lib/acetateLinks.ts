"use client";

import { supabase, errorText } from "./supabase";
import { httpsUrl, normTitle, type ImportSource } from "./acetateImportParse";
import type { LinkResolution } from "./linkResolve";
import type { AcetateTrack } from "./acetate";

export type LinkList = {
  id: string;
  owner_id: string;
  title: string;
  source: ImportSource;
  source_url: string;
  artwork_url: string | null;
  partial: boolean;
  created_at: string;
};

export type LinkRow = {
  id: string;
  list_id: string;
  owner_id: string;
  position: number;
  source: ImportSource;
  kind: "track" | "album" | "playlist" | "video" | "episode";
  title: string;
  artist: string | null;
  duration_ms: number | null;
  artwork_url: string | null;
  source_url: string;
  external_id: string | null;
  vault_track_id: string | null;
  created_at: string;
};

export async function resolvePublicLink(url: string) {
  const res = await fetch("/api/acetate/links", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  const data = (await res.json().catch(() => ({}))) as LinkResolution & { error?: string };
  if (!res.ok) throw new Error(data.error || "Couldn't read that link");
  return data;
}

export async function saveLinkList(resolved: LinkResolution) {
  const { data, error } = await supabase
    .from("acetate_link_lists")
    .insert({
      owner_id: (await owner()),
      title: resolved.title.slice(0, 200),
      source: resolved.source,
      source_url: resolved.sourceUrl,
      artwork_url: httpsUrl(resolved.artwork),
      partial: resolved.partial,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(migrationHint(errorText(error)));
  const list = data as LinkList;
  const rows = resolved.items.slice(0, 50).map((item, index) => ({
    list_id: list.id,
    owner_id: list.owner_id,
    position: index + 1,
    source: item.source,
    kind: item.kind,
    title: item.title.slice(0, 200),
    artist: item.artist,
    duration_ms: item.durationMs,
    artwork_url: httpsUrl(item.artwork),
    source_url: item.sourceUrl,
    external_id: item.externalId,
  }));
  if (rows.length) {
    const inserted = await supabase.from("acetate_link_items").insert(rows).select("*");
    if (inserted.error) {
      await supabase.from("acetate_link_lists").delete().eq("id", list.id);
      throw new Error(migrationHint(errorText(inserted.error)));
    }
    return { list, items: (inserted.data ?? []) as LinkRow[] };
  }
  return { list, items: [] as LinkRow[] };
}

export async function loadLinkLibrary() {
  const id = await owner();
  const [lists, items] = await Promise.all([
    supabase.from("acetate_link_lists").select("*").eq("owner_id", id).order("created_at", { ascending: false }),
    supabase.from("acetate_link_items").select("*").eq("owner_id", id).order("position", { ascending: true }),
  ]);
  if (lists.error) throw new Error(migrationHint(errorText(lists.error)));
  if (items.error) throw new Error(migrationHint(errorText(items.error)));
  return { lists: (lists.data ?? []) as LinkList[], items: (items.data ?? []) as LinkRow[] };
}

export async function deleteLinkList(id: string) {
  const { error } = await supabase.from("acetate_link_lists").delete().eq("id", id);
  if (error) throw new Error(errorText(error));
}

export async function matchLinkToVault(itemId: string, trackId: string | null) {
  const { error } = await supabase.from("acetate_link_items").update({ vault_track_id: trackId }).eq("id", itemId);
  if (error) throw new Error(errorText(error));
}

export function vaultTitleMatches(title: string, tracks: AcetateTrack[]) {
  const wanted = normTitle(title);
  if (!wanted) return [];
  return tracks.filter((track) => track.library === "vault" && normTitle(track.title) === wanted);
}

async function owner() {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error("Sign in required");
  return id;
}

function migrationHint(message: string) {
  if (/acetate_link_|schema cache|column/i.test(message)) {
    return "Apply the Acetate import migration, then try again.";
  }
  return message;
}
