"use client";

import { useEffect, useRef } from "react";
import { supabase, errorText } from "./supabase";
import { useApp } from "@/store/app";
import type { AcetateQueueItem } from "./acetatePlayer";

export type RecapPlay = {
  id: number;
  track_id: string | null;
  title: string;
  artist: string | null;
  album: string | null;
  seconds: number;
  played_at: string;
};

export async function loadRecap() {
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from("acetate_recap")
    .select("id, track_id, title, artist, album, seconds, played_at")
    .gte("played_at", since)
    .order("played_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(errorText(error));
  return (data ?? []) as RecapPlay[];
}

export async function clearRecap() {
  const me = useApp.getState().userId;
  if (!me) return;
  const { error } = await supabase.from("acetate_recap").delete().eq("user_id", me);
  if (error) throw new Error(errorText(error));
}

async function saveRecap(sessionId: string, item: AcetateQueueItem, seconds: number) {
  const me = useApp.getState().userId;
  if (!me || seconds < 5) return;
  const { error } = await supabase.from("acetate_recap").upsert(
    {
      user_id: me,
      session_id: sessionId,
      track_id: item.trackId,
      title: item.title.slice(0, 160),
      artist: item.artist?.slice(0, 120) || null,
      album: item.album?.slice(0, 160) || null,
      seconds: Math.min(7200, Math.round(seconds)),
      played_at: new Date().toISOString(),
    },
    { onConflict: "user_id,session_id" },
  );
  if (error) throw new Error(errorText(error));
}

/** Count listening time for the signed-in account. Failures stay quiet so playback continues. */
export function useRecapRecorder(item: AcetateQueueItem | null, playing: boolean, current: number) {
  const session = useRef<{ id: string; item: AcetateQueueItem; seconds: number; last: number; sent: number } | null>(null);

  useEffect(() => {
    const prev = session.current;
    if (prev && prev.item.key !== item?.key && prev.seconds >= 5) {
      void saveRecap(prev.id, prev.item, prev.seconds).catch(() => undefined);
    }
    if (!item) {
      session.current = null;
      return;
    }
    if (!prev || prev.item.key !== item.key) {
      session.current = { id: crypto.randomUUID(), item, seconds: 0, last: current, sent: 0 };
    } else {
      prev.item = item;
    }
    // current is the position at the moment the cut changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item]);

  useEffect(() => {
    const row = session.current;
    if (!row || !item || row.item.key !== item.key) return;
    const delta = current - row.last;
    row.last = current;
    if (playing && delta > 0 && delta < 3) row.seconds += delta;
    if (row.seconds >= 5 && row.seconds - row.sent >= 20) {
      row.sent = row.seconds;
      void saveRecap(row.id, row.item, row.seconds).catch(() => undefined);
    }
  }, [current, playing, item]);

  useEffect(() => {
    return () => {
      const row = session.current;
      if (row && row.seconds >= 5) void saveRecap(row.id, row.item, row.seconds).catch(() => undefined);
    };
  }, []);
}
