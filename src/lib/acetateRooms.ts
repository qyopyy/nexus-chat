"use client";

import { supabase, errorText } from "./supabase";
import { acetateSigned } from "./acetate";
import { asPeaks } from "./acetateAudio";
import { useAcetatePlayer, type AcetateQueueItem } from "./acetatePlayer";
import { thisDeviceId } from "./handset";
import { driftedSeconds } from "./syncMath";

export type RoomMember = { user_id: string; role: "host" | "guest"; username?: string | null; display_name?: string | null };

export type RoomTrack = {
  id: string;
  title: string;
  artist: string;
  lyrics: string | null;
  art_path: string | null;
  version_id: string | null;
  path: string | null;
  label: string | null;
  duration: number | null;
  peaks: unknown;
};

export type RoomSnapshot = {
  ok: boolean;
  reason?: string;
  id?: string;
  token?: string;
  title?: string;
  host_id?: string;
  role?: "host" | "guest";
  track_id?: string | null;
  position_s?: number;
  playing?: boolean;
  updated_at?: string;
  expires_at?: string;
  queue?: string[];
  track?: RoomTrack | null;
  members?: RoomMember[];
};

const HOST_KEY = "acetate:host-room";

export function hostRoomId() {
  if (typeof sessionStorage === "undefined") return null;
  return sessionStorage.getItem(HOST_KEY);
}

export function rememberHostRoom(id: string | null) {
  if (typeof sessionStorage === "undefined") return;
  if (id) sessionStorage.setItem(HOST_KEY, id);
  else sessionStorage.removeItem(HOST_KEY);
}

export async function startListenRoom(title: string, queue: string[], trackId: string) {
  const { data, error } = await supabase.rpc("acetate_room_start", { p_title: title, p_queue: queue, p_track: trackId });
  if (error) throw new Error(errorText(error));
  const snap = data as RoomSnapshot;
  if (snap?.id) rememberHostRoom(snap.id);
  return snap;
}

export async function joinListenRoom(token: string) {
  const { data, error } = await supabase.rpc("acetate_room_join", { p_token: token });
  if (error) throw new Error(errorText(error));
  return data as RoomSnapshot;
}

export async function syncListenRoom(roomId: string, trackId: string, position: number, playing: boolean, queue: string[]) {
  const { error } = await supabase.rpc("acetate_room_sync", {
    p_room: roomId,
    p_track: trackId,
    p_position: position,
    p_playing: playing,
    p_queue: queue,
  });
  if (error) throw new Error(errorText(error));
}

export async function endListenRoom(roomId: string) {
  const { error } = await supabase.rpc("acetate_room_end", { p_room: roomId });
  rememberHostRoom(null);
  if (error) throw new Error(errorText(error));
}

export async function roomSnapshot(roomId: string) {
  const { data, error } = await supabase.rpc("acetate_room_snapshot", { p_room: roomId });
  if (error) throw new Error(errorText(error));
  return data as RoomSnapshot;
}

export function roomPlayhead(snap: RoomSnapshot, now = Date.now()) {
  return driftedSeconds(snap.position_s ?? 0, snap.updated_at || new Date(now).toISOString(), !!snap.playing, now);
}

export async function roomQueueItem(track: RoomTrack): Promise<AcetateQueueItem | null> {
  if (!track.path || !track.version_id) return null;
  const url = await acetateSigned(track.path);
  if (!url) return null;
  const artUrl = track.art_path ? await acetateSigned(track.art_path) : null;
  return {
    key: `${track.id}:${track.version_id}`,
    trackId: track.id,
    versionId: track.version_id,
    title: track.title,
    versionLabel: track.label || "Listen together",
    artist: track.artist,
    album: "Listen together",
    artUrl,
    peaks: asPeaks(track.peaks),
    duration: track.duration ?? 0,
    url,
    shareUrl: null,
    lyrics: track.lyrics,
  };
}

export function subscribeRoom(roomId: string, onChange: () => void) {
  const channel = supabase
    .channel(`acetate-room:${roomId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "acetate_rooms", filter: `id=eq.${roomId}` }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "acetate_room_members", filter: `room_id=eq.${roomId}` }, onChange)
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

export async function pushHostFromPlayer() {
  const roomId = hostRoomId();
  if (!roomId) return;
  const player = useAcetatePlayer.getState();
  const item = player.queue[player.index];
  if (!item) return;
  if (item.trackId && thisDeviceId()) {
    await syncListenRoom(
      roomId,
      item.trackId,
      player.current,
      player.playing,
      player.queue.map((row) => row.trackId).slice(0, 40),
    ).catch(() => undefined);
  }
}
