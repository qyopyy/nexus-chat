"use client";

// Nexus Radio — one global station. Anyone adds tracks; everyone hears the same clock; live jam beside it.

import { create } from "zustand";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase, errorText } from "./supabase";
import { useApp, toast } from "@/store/app";
import { signedUrl, storageRef } from "./storage";
import { BEAT_PRESETS, type Pattern } from "@/components/music/Tools2";

export type RadioTrack = {
  id: string;
  title: string;
  artist: string | null;
  url: string;
  kind: "upload" | "url";
  duration: number | null;
  added_by: string;
  removed_at: string | null;
  created_at: string;
};

export type RadioPlayer = {
  id: string;
  track_id: string | null;
  is_playing: boolean;
  position: number;
  updated_at: string;
  updated_by: string | null;
};

export type RadioJam = {
  id: string;
  pattern: Pattern;
  bpm: number;
  root: number;
  updated_at: string;
  updated_by: string | null;
};

type Listener = { id: string; username: string; display_name: string };

type State = {
  tracks: RadioTrack[];
  player: RadioPlayer | null;
  jam: RadioJam | null;
  listening: boolean;
  volume: number;
  progress: number;
  duration: number;
  loading: boolean;
  open: boolean;
  listeners: Listener[];
};

export const useRadio = create<State>(() => ({
  tracks: [],
  player: null,
  jam: null,
  listening: false,
  volume: 0.85,
  progress: 0,
  duration: 0,
  loading: false,
  open: false,
  listeners: [],
}));

const MAX = 100 * 1024 * 1024;
let audio: HTMLAudioElement | null = null;
let channel: RealtimeChannel | null = null;
let currentSrcKey = "";
let tick: ReturnType<typeof setInterval> | null = null;
let started = false;

function el() {
  if (!audio && typeof window !== "undefined") {
    audio = new Audio();
    audio.preload = "auto";
    audio.addEventListener("timeupdate", () => useRadio.setState({ progress: audio!.currentTime, duration: audio!.duration || 0 }));
    audio.addEventListener("ended", () => void radioNext(true));
  }
  return audio;
}

export function radioExpectedPosition(p: RadioPlayer | null) {
  if (!p) return 0;
  return p.position + (p.is_playing ? Math.max(0, (Date.now() - new Date(p.updated_at).getTime()) / 1000) : 0);
}

async function sync() {
  const { player, tracks, listening, volume } = useRadio.getState();
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
    useRadio.setState({ loading: true });
    const url = await signedUrl(track.url);
    if (currentSrcKey !== track.id) return; // superseded by a newer track switch
    if (!url) {
      useRadio.setState({ loading: false });
      toast("Couldn't load this radio track", "error");
      return;
    }
    a.src = url;
    await new Promise<void>((r) => {
      const done = () => (a.removeEventListener("loadedmetadata", done), r());
      a.addEventListener("loadedmetadata", done);
      setTimeout(done, 4000);
    });
    if (currentSrcKey !== track.id) return;
    useRadio.setState({ loading: false, duration: a.duration || track.duration || 0 });
  }
  const want = radioExpectedPosition(player);
  if (a.duration && want >= a.duration - 0.25) {
    if (player.is_playing) void radioNext(true);
    return;
  }
  if (Math.abs(a.currentTime - want) > 1.2) a.currentTime = want;
  if (player.is_playing && a.paused) await a.play().catch(() => toast("Tap Tune in to start listening (autoplay blocked)", "info"));
  if (!player.is_playing && !a.paused) a.pause();
}

function emptyPattern(): Pattern {
  const pr = BEAT_PRESETS.Trap ?? Object.values(BEAT_PRESETS)[0];
  return (pr?.p ?? {}) as Pattern;
}

/** Refresh queue/player/jam + realtime channel without navigating to the Radio hub. */
export async function ensureRadio() {
  // Always refresh queue/player; only skip re-subscribing if the channel is already live
  const [{ data: tracks }, { data: player }, { data: jam }] = await Promise.all([
    supabase.from("radio_tracks").select("*").is("removed_at", null).order("created_at"),
    supabase.from("radio_player").select("*").eq("id", "main").maybeSingle(),
    supabase.from("radio_jam").select("*").eq("id", "main").maybeSingle(),
  ]);

  let jamRow = jam as RadioJam | null;
  if (!jamRow || !jamRow.pattern || Object.keys(jamRow.pattern as object).length === 0) {
    const pattern = emptyPattern();
    await supabase.from("radio_jam").upsert({ id: "main", pattern, bpm: 140, root: 0 });
    jamRow = { id: "main", pattern, bpm: 140, root: 0, updated_at: new Date().toISOString(), updated_by: null };
  }

  useRadio.setState({
    tracks: (tracks ?? []) as RadioTrack[],
    player: (player as RadioPlayer) ?? { id: "main", track_id: null, is_playing: false, position: 0, updated_at: new Date().toISOString(), updated_by: null },
    jam: jamRow,
  });

  const me = useApp.getState().userId;
  const meProfile = me ? useApp.getState().profiles[me] : null;

  if (!(started && channel)) {
    started = true;
    channel = supabase.channel("nexus-radio", { config: { presence: { key: me ?? crypto.randomUUID() } } });
    channel
      .on("postgres_changes", { event: "*", schema: "public", table: "radio_tracks" }, ({ new: row, eventType }) => {
        const t = row as RadioTrack;
        useRadio.setState((s) => {
          const rest = s.tracks.filter((x) => x.id !== t.id);
          if (eventType === "DELETE" || t.removed_at) return { tracks: rest };
          return { tracks: [...rest, t].sort((a, b) => a.created_at.localeCompare(b.created_at)) };
        });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "radio_player" }, ({ new: row }) => {
        useRadio.setState({ player: row as RadioPlayer });
        void sync();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "radio_jam" }, ({ new: row }) => {
        useRadio.setState({ jam: row as RadioJam });
      })
      .on("presence", { event: "sync" }, () => {
        const state = channel?.presenceState() ?? {};
        const listeners: Listener[] = [];
        for (const key of Object.keys(state)) {
          const metas = state[key] as { id?: string; username?: string; display_name?: string }[];
          const m = metas?.[0];
          if (m?.id) listeners.push({ id: m.id, username: m.username ?? "user", display_name: m.display_name ?? "Listener" });
        }
        useRadio.setState({ listeners });
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED" && me) {
          await channel?.track({
            id: me,
            username: meProfile?.username ?? "user",
            display_name: meProfile?.display_name ?? "Listener",
            at: Date.now(),
          });
        }
      });
  } else if (me) {
    void channel.track({
      id: me,
      username: meProfile?.username ?? "user",
      display_name: meProfile?.display_name ?? "Listener",
      at: Date.now(),
    });
  }

  if (!tick) tick = setInterval(() => void sync(), 4000);
  void sync();
}

export async function openRadio() {
  useApp.setState({ hub: "radio", mobileTab: "music" });
  useRadio.setState({ open: true });
  await ensureRadio();
}

export function closeRadio() {
  // keep channel alive while browsing other hubs? pause listening only
  setRadioListening(false);
  useRadio.setState({ open: false });
}

export function setRadioListening(on: boolean) {
  useRadio.setState({ listening: on });
  const a = el();
  if (on && a) {
    void a.play().catch(() => {});
    a.pause();
  }
  void sync();
}

export function setRadioVolume(v: number) {
  useRadio.setState({ volume: v });
  if (audio) audio.volume = v;
}

async function writePlayer(patch: Partial<RadioPlayer>) {
  const { player } = useRadio.getState();
  const me = useApp.getState().userId;
  const row: RadioPlayer = {
    id: "main",
    track_id: player?.track_id ?? null,
    is_playing: player?.is_playing ?? false,
    position: player ? radioExpectedPosition(player) : 0,
    ...patch,
    updated_at: new Date().toISOString(),
    updated_by: me,
  };
  useRadio.setState({ player: row });
  void sync();
  const { error } = await supabase.from("radio_player").upsert(row, { onConflict: "id" });
  if (error) toast(errorText(error), "error");
}

export function radioPlayTrack(trackId: string) {
  if (!useRadio.getState().listening) setRadioListening(true);
  void writePlayer({ track_id: trackId, position: 0, is_playing: true });
}

export function radioTogglePlay() {
  const { player, tracks } = useRadio.getState();
  if (!useRadio.getState().listening) setRadioListening(true);
  if (!player?.track_id) {
    if (tracks[0]) radioPlayTrack(tracks[0].id);
    return;
  }
  void writePlayer({ is_playing: !player.is_playing, position: radioExpectedPosition(player) });
}

export function radioSeek(seconds: number) {
  void writePlayer({ position: Math.max(0, seconds) });
}

export async function radioNext(auto = false) {
  const { player, tracks } = useRadio.getState();
  if (!tracks.length) return;
  if (auto && player?.updated_by && player.updated_by !== useApp.getState().userId) return;
  const i = tracks.findIndex((t) => t.id === player?.track_id);
  if (auto && (i < 0 || i >= tracks.length - 1)) {
    return void writePlayer({ is_playing: false, position: 0, track_id: tracks[0]?.id ?? null });
  }
  const nxt = tracks[(i + 1) % tracks.length];
  if (nxt) void writePlayer({ track_id: nxt.id, position: 0, is_playing: true });
}

export function radioPrev() {
  const { player, tracks } = useRadio.getState();
  if (!tracks.length) return;
  if (radioExpectedPosition(player) > 4) return radioSeek(0);
  const i = tracks.findIndex((t) => t.id === player?.track_id);
  const p = tracks[(i - 1 + tracks.length) % tracks.length];
  if (p) void writePlayer({ track_id: p.id, position: 0, is_playing: true });
}

function isPhone() {
  return typeof navigator !== "undefined" && /iPhone|iPad|Android|Mobile/i.test(navigator.userAgent);
}

async function audioDuration(file: File): Promise<number | null> {
  // Phones often hang on metadata for WAV/MP4 from Files — don't block the upload.
  const budget = isPhone() ? 1500 : 4000;
  const url = URL.createObjectURL(file);
  try {
    const a = new Audio();
    a.preload = "metadata";
    a.src = url;
    await new Promise<void>((res) => {
      a.onloadedmetadata = () => res();
      a.onerror = () => res();
      setTimeout(res, budget);
    });
    return Number.isFinite(a.duration) && a.duration > 0 ? a.duration : null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const RADIO_EXT = /\.(mp3|wav|flac|m4a|aac|ogg|opus|webm|mp4|m4b|aiff?|caf)$/i;

/** Phones often send M4A/MP4 as video/mp4 and WAV without a useful type — accept those. */
export function isRadioAudioFile(f: File): boolean {
  const t = (f.type || "").toLowerCase().trim();
  if (t.startsWith("audio/")) return true;
  if (t === "video/mp4" || t === "video/quicktime" || t === "application/mp4" || t === "audio/mp4") return true;
  if (t === "application/octet-stream" || t === "binary/octet-stream" || !t) return RADIO_EXT.test(f.name) || !f.name.includes(".");
  return RADIO_EXT.test(f.name);
}

/** Map extension / odd browser types onto a stable content-type for upload. */
function radioContentType(file: File): string {
  const t = (file.type || "").toLowerCase().trim();
  const map: Record<string, string> = {
    "audio/mpeg": "audio/mpeg",
    "audio/mp3": "audio/mpeg",
    "audio/mp4": "audio/mp4",
    "audio/x-m4a": "audio/mp4",
    "audio/m4a": "audio/mp4",
    "audio/aac": "audio/aac",
    "audio/wav": "audio/wav",
    "audio/x-wav": "audio/wav",
    "audio/wave": "audio/wav",
    "audio/vnd.wave": "audio/wav",
    "audio/flac": "audio/flac",
    "audio/x-flac": "audio/flac",
    "audio/ogg": "audio/ogg",
    "audio/opus": "audio/ogg",
    "audio/webm": "audio/webm",
    "audio/x-caf": "audio/mp4",
    "video/mp4": "video/mp4",
    "video/quicktime": "video/mp4",
    "application/mp4": "video/mp4",
    "application/octet-stream": "",
  };
  if (t && map[t]) return map[t] || byExt(file.name) || "application/octet-stream";
  if (t.startsWith("audio/")) return t;
  return byExt(file.name) || t || "application/octet-stream";
}

function byExt(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const m: Record<string, string> = {
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    m4b: "audio/mp4",
    aac: "audio/aac",
    wav: "audio/wav",
    flac: "audio/flac",
    ogg: "audio/ogg",
    opus: "audio/ogg",
    webm: "audio/webm",
    mp4: "video/mp4",
    mov: "video/mp4",
    caf: "audio/mp4",
    aiff: "audio/wav",
    aif: "audio/wav",
  };
  return m[ext] || "";
}

function pushTrackLocal(row: RadioTrack) {
  useRadio.setState((s) => {
    if (s.tracks.some((t) => t.id === row.id)) return s;
    return { tracks: [...s.tracks, row].sort((a, b) => a.created_at.localeCompare(b.created_at)) };
  });
}

/** Shield / YouTube CID decode can hang on phones — skip there; otherwise fail open fast. */
async function radioShieldOk(file: File) {
  if (isPhone()) return true;
  try {
    const { shieldGate } = await import("./shield");
    const { youtubeCidGate } = await import("./audio");
    const blocked = await Promise.race([
      (async () => (await shieldGate(file, "space")) || (await youtubeCidGate(file, "space")))(),
      new Promise<false>((resolve) => setTimeout(() => resolve(false), 8_000)),
    ]);
    return !blocked;
  } catch {
    return true;
  }
}

function radioUploadBody(file: File, safeName: string, contentType: string): Blob {
  try {
    if (file.type && file.type.toLowerCase() === contentType) return file;
    // Safari / iOS: re-wrap with an explicit type so Storage doesn't see an empty MIME
    return new File([file], safeName, { type: contentType, lastModified: file.lastModified || Date.now() });
  } catch {
    return file.slice(0, file.size, contentType);
  }
}

export async function radioUpload(file: File) {
  try {
    const me = useApp.getState().userId;
    if (!me) return toast("Sign in to upload", "error");
    if (!isRadioAudioFile(file)) {
      return toast("Pick an audio file (mp3, wav, m4a, mp4…)", "error");
    }
    if (file.size <= 0) return toast("That file is empty", "error");
    if (file.size > MAX) return toast("Tracks can be up to 100 MB", "error");
    const { malwareGate } = await import("./malwareGuard");
    if (await malwareGate(file, { fileName: file.name, context: "audio" })) return;
    if (!(await radioShieldOk(file))) return;

    const contentType = radioContentType(file) || "application/octet-stream";
    const extGuess =
      byExt(file.name) ? "" : contentType.includes("mpeg") ? ".mp3" : contentType.includes("wav") ? ".wav" : contentType.includes("mp4") ? ".m4a" : ".bin";
    const rawName = (file.name || "").trim() || `track${extGuess}`;
    const safeName = (rawName.replace(/[^\w.\-]+/g, "_").slice(-80) || `track${extGuess}`).replace(/^\.+/, "track.");
    const path = `${me}/${crypto.randomUUID()}-${safeName}`;
    const body = radioUploadBody(file, safeName, contentType);

    const duration = await audioDuration(file);
    const { error } = await supabase.storage.from("nexus-radio").upload(path, body, {
      contentType,
      upsert: false,
      cacheControl: "3600",
    });
    if (error) {
      const msg = errorText(error);
      if (/mime|not supported|invalid/i.test(msg)) {
        return toast(`Upload failed: file type blocked (${contentType || file.type || "unknown"}). Try MP3 or WAV.`, "error");
      }
      if (/row-level security|policy|authorized|permission|jwt|session/i.test(msg)) {
        return toast("Upload failed: storage permission denied. Re-sign in and try again.", "error");
      }
      if (/payload|too large|entity too large|413/i.test(msg)) {
        return toast("Upload failed: file is too large for the server.", "error");
      }
      return toast(`Upload failed: ${msg}`, "error");
    }
    const base = file.name.replace(/\.[^.]+$/, "") || "Untitled";
    const [artist, title] = base.includes(" - ") ? base.split(" - ", 2) : [null, base];
    const { data, error: e2 } = await supabase
      .from("radio_tracks")
      .insert({
        title: (title || base).slice(0, 200),
        artist: artist?.slice(0, 200) ?? null,
        url: storageRef("nexus-radio", path),
        kind: "upload",
        duration,
        added_by: me,
      })
      .select("*")
      .single();
    if (e2) {
      void supabase.storage.from("nexus-radio").remove([path]);
      return toast(errorText(e2), "error");
    }
    if (data) pushTrackLocal(data as RadioTrack);
    toast("Added to Nexus Radio", "success");
  } catch (e) {
    toast(`Upload failed: ${errorText(e)}`, "error");
  }
}

export async function radioAddUrl(rawUrl: string, title?: string, artist?: string) {
  const url = rawUrl.trim();
  if (!/^https?:\/\//i.test(url)) return toast("Paste a direct audio URL (https://…)", "error");
  const me = useApp.getState().userId;
  if (!me) return toast("Sign in to add a link", "error");
  const { data, error } = await supabase
    .from("radio_tracks")
    .insert({
      title: (title || "Untitled track").slice(0, 200),
      artist: artist?.slice(0, 200) || null,
      url: url.slice(0, 800),
      kind: "url",
      added_by: me,
    })
    .select("*")
    .single();
  if (error) toast(errorText(error), "error");
  else {
    if (data) pushTrackLocal(data as RadioTrack);
    toast("Link added to the queue", "success");
  }
}

export async function radioRemove(id: string) {
  const { error } = await supabase.from("radio_tracks").update({ removed_at: new Date().toISOString() }).eq("id", id);
  if (error) toast(errorText(error), "error");
  else useRadio.setState((s) => ({ tracks: s.tracks.filter((t) => t.id !== id) }));
}

export async function saveRadioJam(patch: Partial<Pick<RadioJam, "pattern" | "bpm" | "root">>) {
  const me = useApp.getState().userId;
  const { error } = await supabase
    .from("radio_jam")
    .update({ ...patch, updated_by: me, updated_at: new Date().toISOString() })
    .eq("id", "main");
  if (error) toast(errorText(error), "error");
}
