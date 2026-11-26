import { supabase, errorText } from "@/lib/supabase";
import { toast } from "@/store/app";
import { updateMyProfile } from "@/lib/data";
import { parseInstagramProfile, parseInstagramSong } from "@/lib/shieldPro";
import type { ProfileLink } from "@/lib/types";

export type IgLink = { id: string; release_id: string | null; work_id: string | null; instagram_song_url: string | null; instagram_artist_url: string | null; updated_at: string };

export async function listIgLinks(): Promise<IgLink[]> {
  const { data, error } = await supabase.from("release_social_links").select("id,release_id,work_id,instagram_song_url,instagram_artist_url,updated_at").limit(1000);
  if (error) {
    toast(errorText(error), "error");
    return [];
  }
  return (data ?? []) as IgLink[];
}

/** insert-or-update the link row for one release or protected song; empty strings clear a field */
export async function saveIgLink(target: { release_id?: string; work_id?: string }, song: string, artist: string): Promise<IgLink | null> {
  const s = song.trim() ? parseInstagramSong(song) : null;
  const a = artist.trim() ? parseInstagramProfile(artist) : null;
  if (s && !s.ok) return void toast(s.error, "error"), null;
  if (a && !a.ok) return void toast(a.error, "error"), null;
  const row = { ...target, instagram_song_url: s && s.ok ? s.url : null, instagram_artist_url: a && a.ok ? a.url : null, updated_at: new Date().toISOString() };
  const col = target.release_id ? "release_id" : "work_id";
  const { data, error } = await supabase.from("release_social_links").upsert(row, { onConflict: col }).select("id,release_id,work_id,instagram_song_url,instagram_artist_url,updated_at").single();
  if (error) return void toast(errorText(error), "error"), null;
  return data as IgLink;
}

/** put the Instagram profile on your Nexus profile (replaces an existing Instagram link) */
export async function linkInstagramToProfile(links: ProfileLink[] | undefined, input: string) {
  const p = parseInstagramProfile(input);
  if (!p.ok) return void toast(p.error, "error"), null;
  const rest = (links ?? []).filter((l) => l.type !== "instagram" && !/instagram\.com/i.test(l.url));
  await updateMyProfile({ links: [...rest, { type: "instagram", url: p.url, label: `@${p.value}` }] });
  return p;
}
