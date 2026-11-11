"use client";

import { useEffect, useRef } from "react";
import { supabase } from "./supabase";
import { acetateSigned } from "./acetate";
import { asPeaks } from "./acetateAudio";
import { asLyricCues } from "./acetateLyrics";
import { useAcetatePlayer, type AcetateQueueItem } from "./acetatePlayer";
import { thisDeviceId } from "./handset";
import { useApp } from "@/store/app";
import { hostRoomId, pushHostFromPlayer } from "./acetateRooms";

type SavedItem = {
  trackId: string;
  versionId: string;
  title: string;
  artist: string;
  album: string | null;
  duration: number;
  lyrics?: string | null;
};

type NowRow = {
  user_id: string;
  device_id: string;
  items: SavedItem[];
  index: number;
  position_s: number;
  playing: boolean;
  updated_at: string;
};

function savedItems(queue: AcetateQueueItem[]): SavedItem[] {
  return queue.slice(0, 80).map((item) => ({
    trackId: item.trackId,
    versionId: item.versionId,
    title: item.title,
    artist: item.artist,
    album: item.album,
    duration: item.duration,
    lyrics: item.lyrics ?? null,
  }));
}

async function resolveItem(item: SavedItem): Promise<AcetateQueueItem | null> {
  const { data } = await supabase.from("acetate_versions").select("id, path, label, version, peaks, duration").eq("id", item.versionId).maybeSingle();
  const path = (data as { path?: string; label?: string | null; version?: number; peaks?: unknown; duration?: number | null } | null)?.path;
  if (!path) return null;
  const url = await acetateSigned(path);
  if (!url) return null;
  const meta = await supabase.from("acetate_tracks").select("lyric_cues").eq("id", item.trackId).maybeSingle();
  const row = data as { label?: string | null; version?: number; peaks?: unknown; duration?: number | null };
  return {
    key: `${item.trackId}:${item.versionId}`,
    trackId: item.trackId,
    versionId: item.versionId,
    title: item.title,
    versionLabel: row.label || `Version ${row.version ?? 1}`,
    artist: item.artist,
    album: item.album,
    artUrl: null,
    peaks: asPeaks(row.peaks),
    duration: row.duration ?? item.duration ?? 0,
    url,
    shareUrl: null,
    lyrics: item.lyrics,
    lyricCues: asLyricCues(meta.data?.lyric_cues),
  };
}

/** Keep the signed-in queue in step across this account's devices. */
export function useAcetateAccountSync(enabled: boolean) {
  const userId = useApp((s) => s.userId);
  const queue = useAcetatePlayer((s) => s.queue);
  const index = useAcetatePlayer((s) => s.index);
  const playing = useAcetatePlayer((s) => s.playing);
  const applying = useRef(false);

  useEffect(() => {
    if (!enabled || !userId) return;
    const mine = thisDeviceId();
    const channel = supabase
      .channel(`acetate-now:${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "acetate_now", filter: `user_id=eq.${userId}` }, (payload) => {
        const row = payload.new as NowRow;
        if (!row?.device_id || row.device_id === mine || !Array.isArray(row.items)) return;
        applying.current = true;
        void (async () => {
          const next: AcetateQueueItem[] = [];
          for (const item of row.items.slice(0, 40)) {
            const resolved = await resolveItem(item);
            if (resolved) next.push(resolved);
          }
          if (next.length) useAcetatePlayer.getState().applyRemote(next, row.index ?? 0, row.position_s ?? 0, !!row.playing);
          window.setTimeout(() => {
            applying.current = false;
          }, 1600);
        })();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled, userId]);

  useEffect(() => {
    if (!enabled || !userId || applying.current) return;
    const timer = window.setTimeout(() => {
      if (applying.current) return;
      const player = useAcetatePlayer.getState();
      const items = savedItems(player.queue);
      void supabase.from("acetate_now").upsert({
        user_id: userId,
        device_id: thisDeviceId(),
        items,
        index: player.index,
        position_s: player.current,
        playing: player.playing,
      });
      if (hostRoomId()) void pushHostFromPlayer();
    }, 900);
    return () => window.clearTimeout(timer);
  }, [enabled, userId, queue, index, playing]);

  useEffect(() => {
    if (!enabled || !playing) return;
    const timer = window.setInterval(() => {
      if (applying.current) return;
      const player = useAcetatePlayer.getState();
      void supabase.from("acetate_now").upsert({
        user_id: userId,
        device_id: thisDeviceId(),
        items: savedItems(player.queue),
        index: player.index,
        position_s: player.current,
        playing: player.playing,
      });
      if (hostRoomId()) void pushHostFromPlayer();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [enabled, playing, userId]);
}
