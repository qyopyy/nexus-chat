"use client";

import { create } from "zustand";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase, errorText } from "./supabase";
import { useApp, toast } from "@/store/app";
import { signedUrl, storageRef } from "./storage";
import type { SpacePlayer, SpaceTrack } from "./types";

// "Listen together": every member of a space hears the same uploaded track at the same position.
// The shared state is one space_player row (track, playing, position, updated_at); each listener's
// browser plays the file locally and keeps itself within ~1s of that clock.

type State = {
  spaceId: string | null;
  tracks: SpaceTrack[];
  player: SpacePlayer | null;
  listening: boolean;
  volume: number;
  progress: number;
  duration: number;
  loading: boolean;
};

export const useSpaceMusic = create<State>(() => ({
  spaceId: null,
  tracks: [],
  player: null,
  listening: false,
  volume: 0.8,
  progress: 0,
  duration: 0,
  loading: false,
}));

const MAX = 50 * 1024 * 1024;
let audio: HTMLAudioElement | null = null;
let channel: RealtimeChannel | null = null;
let currentSrcKey = "";
let tick: ReturnType<typeof setInterval> | null = null;

function el() {
  if (!audio && typeof window !== "undefined") {
    audio = new Audio();
    audio.preload = "auto";
    audio.addEventListener("timeupdate", () => useSpaceMusic.setState({ progress: audio!.currentTime, duration: audio!.duration || 0 }));
    audio.addEventListener("ended", () => void next(true));
  }
  return audio;
}

/** where the shared clock says playback should be right now (seconds) */
export function expectedPosition(p: SpacePlayer | null) {
  if (!p) return 0;
  return p.position + (p.is_playing ? Math.max(0, (Date.now() - new Date(p.updated_at).getTime()) / 1000) : 0);
}

async function sync() {
  const { player, tracks, listening, volume } = useSpaceMusic.getState();
  const a = el();
  if (!a) return;
  a.volume = volume;
  const track = tracks.find((t) => t.id === player?.track_id);
  if (!listening || !player || !track) {
    if (!a.paused) a.pause();
    return;
  }
  if (currentSrcKey !== track.id) {
    currentSrcKey = track.id;
    useSpaceMusic.setState({ loading: true });
    const url = await signedUrl(track.url);
    if (!url || currentSrcKey !== track.id) return;
    a.src = url;
    await new Promise<void>((r) => {
      const done = () => (a.removeEventListener("loadedmetadata", done), r());
      a.addEventListener("loadedmetadata", done);
      setTimeout(done, 4000);
    });
    useSpaceMusic.setState({ loading: false });
  }
  const want = expectedPosition(player);
  if (a.duration && want >= a.duration) {
    // finished while we were away
    if (player.is_playing) void next(true);
    return;
  }
  if (Math.abs(a.currentTime - want) > 1.2) a.currentTime = want;
  if (player.is_playing && a.paused) await a.play().catch(() => toast("Tap ▶ to start listening (your browser blocked autoplay)", "info"));
  if (!player.is_playing && !a.paused) a.pause();
}

export async function openSpaceMusic(spaceId: string) {
  if (useSpaceMusic.getState().spaceId === spaceId && channel) return;
  closeSpaceMusic();
  useSpaceMusic.setState({ spaceId, tracks: [], player: null });
  const [{ data: tracks }, { data: player }] = await Promise.all([
    supabase.from("space_tracks").select("*").eq("space_id", spaceId).is("removed_at", null).order("created_at"),
    supabase.from("space_player").select("*").eq("space_id", spaceId).maybeSingle(),
  ]);
  if (useSpaceMusic.getState().spaceId !== spaceId) return;
  useSpaceMusic.setState({ tracks: (tracks ?? []) as SpaceTrack[], player: (player as SpacePlayer) ?? null });
  channel = supabase
    .channel(`space-music:${spaceId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "space_tracks", filter: `space_id=eq.${spaceId}` }, ({ new: row, eventType }) => {
      const t = row as SpaceTrack;
      useSpaceMusic.setState((s) => {
        const rest = s.tracks.filter((x) => x.id !== t.id);
        if (eventType === "DELETE" || t.removed_at) return { tracks: rest };
        return { tracks: [...rest, t].sort((a, b) => a.created_at.localeCompare(b.created_at)) };
      });
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "space_player", filter: `space_id=eq.${spaceId}` }, ({ new: row }) => {
      useSpaceMusic.setState({ player: row as SpacePlayer });
      void sync();
    })
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "spaces", filter: `id=eq.${spaceId}` }, ({ new: row }) => {
      const sp = row as { id: string; music_enabled?: boolean };
      useApp.setState((s) => ({ spaces: s.spaces.map((x) => (x.id === sp.id ? { ...x, music_enabled: sp.music_enabled } : x)) }));
    })
    .subscribe();
  if (!tick) tick = setInterval(() => void sync(), 5000);
  void sync();
}

export function closeSpaceMusic() {
  if (channel) void supabase.removeChannel(channel);
  channel = null;
  if (tick) clearInterval(tick);
  tick = null;
  currentSrcKey = "";
  audio?.pause();
  useSpaceMusic.setState({ spaceId: null, tracks: [], player: null, listening: false, progress: 0, duration: 0 });
}

export function setListening(on: boolean) {
  useSpaceMusic.setState({ listening: on });
  const a = el();
  if (on && a) {
    // unlock audio on this user gesture (iOS)
    void a.play().catch(() => {});
    a.pause();
  }
  void sync();
}

export function setMusicVolume(v: number) {
  useSpaceMusic.setState({ volume: v });
  if (audio) audio.volume = v;
}

async function writePlayer(patch: Partial<SpacePlayer>) {
  const { spaceId, player } = useSpaceMusic.getState();
  const me = useApp.getState().userId;
  if (!spaceId) return;
  const row = {
    space_id: spaceId,
    track_id: player?.track_id ?? null,
    is_playing: player?.is_playing ?? false,
    position: player ? expectedPosition(player) : 0,
    ...patch,
    updated_at: new Date().toISOString(),
    updated_by: me,
  };
  useSpaceMusic.setState({ player: row as SpacePlayer }); // optimistic
  void sync();
  const { error } = await supabase.from("space_player").upsert(row, { onConflict: "space_id" });
  if (error) toast(errorText(error), "error");
}

export function playTrack(trackId: string) {
  if (!useSpaceMusic.getState().listening) setListening(true);
  void writePlayer({ track_id: trackId, position: 0, is_playing: true });
}

export function togglePlay() {
  const { player, tracks } = useSpaceMusic.getState();
  if (!useSpaceMusic.getState().listening) setListening(true);
  if (!player?.track_id) {
    if (tracks[0]) playTrack(tracks[0].id);
    return;
  }
  void writePlayer({ is_playing: !player.is_playing, position: expectedPosition(player) });
}

export function seek(seconds: number) {
  void writePlayer({ position: Math.max(0, seconds) });
}

export async function next(auto = false) {
  const { player, tracks } = useSpaceMusic.getState();
  if (!tracks.length) return;
  // when a track ends, only the person who last controlled the player advances it (prevents everyone racing)
  if (auto && player?.updated_by && player.updated_by !== useApp.getState().userId) return;
  const i = tracks.findIndex((t) => t.id === player?.track_id);
  const nxt = tracks[(i + 1) % tracks.length];
  if (auto && i === tracks.length - 1) return void writePlayer({ is_playing: false, position: 0, track_id: tracks[0].id });
  void writePlayer({ track_id: nxt.id, position: 0, is_playing: true });
}

export function prev() {
  const { player, tracks } = useSpaceMusic.getState();
  if (!tracks.length) return;
  if (expectedPosition(player) > 4) return seek(0);
  const i = tracks.findIndex((t) => t.id === player?.track_id);
  const p = tracks[(i - 1 + tracks.length) % tracks.length];
  void writePlayer({ track_id: p.id, position: 0, is_playing: true });
}

export async function uploadTrack(spaceId: string, file: File) {
  if (!file.type.startsWith("audio/")) return toast("Pick an audio file (mp3, m4a, wav…)", "error");
  if (file.size > MAX) return toast("Tracks can be up to 50 MB", "error");
  const me = useApp.getState().userId!;
  const path = `${spaceId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
  const { error } = await supabase.storage.from("space-music").upload(path, file, { contentType: file.type });
  if (error) return toast(`Upload failed: ${errorText(error)}`, "error");
  const base = file.name.replace(/\.[^.]+$/, "");
  const [artist, title] = base.includes(" - ") ? base.split(" - ", 2) : [null, base];
  const { error: e2 } = await supabase.from("space_tracks").insert({
    space_id: spaceId,
    title: (title || base).slice(0, 200),
    artist: artist?.slice(0, 200) ?? null,
    url: storageRef("space-music", path),
    kind: "upload",
    added_by: me,
  });
  if (e2) toast(errorText(e2), "error");
  else toast("Added to the queue", "success");
}

export async function removeTrack(id: string) {
  const { error } = await supabase.from("space_tracks").update({ removed_at: new Date().toISOString() }).eq("id", id);
  if (error) toast(errorText(error), "error");
  else useSpaceMusic.setState((s) => ({ tracks: s.tracks.filter((t) => t.id !== id) }));
}

export async function setSpaceMusicEnabled(spaceId: string, on: boolean) {
  if (!on) {
    // pause for everyone first (player writes are only allowed while music is enabled)
    const { player } = useSpaceMusic.getState();
    if (player?.is_playing) await supabase.from("space_player").update({ is_playing: false, position: expectedPosition(player), updated_at: new Date().toISOString() }).eq("space_id", spaceId);
  }
  const { error } = await supabase.from("spaces").update({ music_enabled: on }).eq("id", spaceId);
  if (error) return toast(errorText(error), "error");
  useApp.setState((s) => ({ spaces: s.spaces.map((x) => (x.id === spaceId ? { ...x, music_enabled: on } : x)) }));
  toast(on ? "Listen together is on for this space" : "Listen together turned off", "success");
}
