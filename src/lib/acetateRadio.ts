"use client";

import { supabase, errorText } from "./supabase";
import { acetateSigned, openShare } from "./acetate";
import { asPeaks } from "./acetateAudio";
import { useAcetatePlayer, type AcetateQueueItem } from "./acetatePlayer";

export type RadioTrack = {
  id: string;
  title: string;
  owner_id: string;
  owner_name: string | null;
  lyrics: string | null;
  mine: boolean;
  likes: number;
  token: string | null;
};

export type RadioShelf = { likes: RadioTrack[]; following: RadioTrack[] };

function list(value: unknown): RadioTrack[] {
  return Array.isArray(value) ? (value as RadioTrack[]) : [];
}

export async function loadRadio(): Promise<RadioShelf> {
  const { data, error } = await supabase.rpc("acetate_radio");
  if (error) throw new Error(errorText(error));
  const row = (data ?? {}) as { likes?: unknown; following?: unknown };
  return { likes: list(row.likes), following: list(row.following) };
}

async function fromMine(track: RadioTrack): Promise<AcetateQueueItem | null> {
  const { data } = await supabase
    .from("acetate_versions")
    .select("id, path, label, version, peaks, duration")
    .eq("track_id", track.id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const row = data as { id: string; path: string; label: string | null; version: number; peaks: unknown; duration: number | null } | null;
  if (!row?.path) return null;
  const url = await acetateSigned(row.path);
  if (!url) return null;
  return {
    key: `${track.id}:${row.id}`,
    trackId: track.id,
    versionId: row.id,
    title: track.title,
    versionLabel: row.label || `Version ${row.version}`,
    artist: track.owner_name || "Acetate",
    album: "Radio",
    artUrl: null,
    peaks: asPeaks(row.peaks),
    duration: row.duration ?? 0,
    url,
    shareUrl: null,
    lyrics: track.lyrics,
  };
}

async function fromToken(track: RadioTrack): Promise<AcetateQueueItem | null> {
  if (!track.token) return null;
  const opened = await openShare(track.token, null, false);
  const row = opened.tracks.find((item) => item.id === track.id) ?? opened.tracks[0];
  const version = row?.versions.find((item) => item.url) ?? row?.versions[0];
  if (!row || !version?.url) return null;
  return {
    key: `${row.id}:${version.id}`,
    trackId: row.id,
    versionId: version.id,
    title: row.title,
    versionLabel: version.label || `Version ${version.version}`,
    artist: track.owner_name || opened.owner_name || "Acetate",
    album: opened.kind === "project" ? opened.title : "Radio",
    artUrl: row.art || opened.art,
    peaks: asPeaks(version.peaks),
    duration: version.duration ?? 0,
    url: version.url,
    shareUrl: null,
    lyrics: track.lyrics || row.lyrics,
  };
}

export async function playRadio(tracks: RadioTrack[]) {
  const queue: AcetateQueueItem[] = [];
  for (const track of tracks.slice(0, 12)) {
    const item = track.mine ? await fromMine(track) : await fromToken(track);
    if (!item && track.token) {
      const shared = await fromToken(track);
      if (shared) queue.push(shared);
      continue;
    }
    if (item) queue.push(item);
  }
  if (!queue.length) throw new Error("Nothing in that shelf has audio yet. Public cuts need a share link.");
  useAcetatePlayer.getState().setQueue(queue, 0);
}
