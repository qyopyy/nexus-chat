"use client";

/**
 * Bump Music — on-device library with projects, folders, and a singleton player
 * that keeps playing while you use Nearby / Friends / Messages.
 */

import { create } from "zustand";
import { loadJSON, saveJSON } from "@/lib/utils";

export type BumpMusicTrack = {
  id: string;
  projectId: string;
  folderId: string | null;
  name: string;
  mime: string;
  size: number;
  addedAt: number;
};

export type BumpMusicFolder = {
  id: string;
  projectId: string;
  name: string;
  createdAt: number;
};

export type BumpMusicProject = {
  id: string;
  name: string;
  color: string;
  createdAt: number;
  updatedAt: number;
};

type BumpMusicState = {
  projects: BumpMusicProject[];
  folders: BumpMusicFolder[];
  tracks: BumpMusicTrack[];
  activeProjectId: string | null;
  activeFolderId: string | null; // null = all in project
  currentId: string | null;
  playing: boolean;
  volume: number;
  loop: boolean;
  shuffle: boolean;
  /** playback position seconds */
  currentTime: number;
  /** track duration seconds (0 until known) */
  duration: number;
};

const META_KEY = "nexus.bumpMusic.v1";
const DB_NAME = "nexus-bump-music";
const STORE = "blobs";
const MAX_TRACKS = 80;
const MAX_BYTES = 40 * 1024 * 1024;
const COLORS = ["#22c55a", "#00a8fc", "#eb459e", "#f0b232", "#9146ff", "#1DB954", "#ff2bd6"];

const EMPTY: BumpMusicState = {
  projects: [],
  folders: [],
  tracks: [],
  activeProjectId: null,
  activeFolderId: null,
  currentId: null,
  playing: false,
  volume: 0.7,
  loop: true,
  shuffle: false,
  currentTime: 0,
  duration: 0,
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(id: string, blob: Blob) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(blob, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function idbGet(id: string): Promise<Blob | null> {
  const db = await openDb();
  const blob = await new Promise<Blob | null>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve((req.result as Blob) ?? null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return blob;
}

async function idbDel(id: string) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

function uid(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function persist() {
  const s = useBumpMusic.getState();
  saveJSON(META_KEY, {
    projects: s.projects,
    folders: s.folders,
    tracks: s.tracks.map(({ id, projectId, folderId, name, mime, size, addedAt }) => ({
      id,
      projectId,
      folderId,
      name,
      mime,
      size,
      addedAt,
    })),
    activeProjectId: s.activeProjectId,
    activeFolderId: s.activeFolderId,
    currentId: s.currentId,
    volume: s.volume,
    loop: s.loop,
    shuffle: s.shuffle,
  });
}

function ensureDefaultProject(state: BumpMusicState): BumpMusicState {
  if (state.projects.length) {
    if (!state.activeProjectId) return { ...state, activeProjectId: state.projects[0]!.id };
    return state;
  }
  const p: BumpMusicProject = {
    id: uid("bp"),
    name: "My mixes",
    color: COLORS[0]!,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  return { ...state, projects: [p], activeProjectId: p.id };
}

export const useBumpMusic = create<BumpMusicState>(() => {
  if (typeof window === "undefined") return EMPTY;
  const loaded = loadJSON<Partial<BumpMusicState>>(META_KEY, {});
  const base: BumpMusicState = {
    projects: Array.isArray(loaded.projects) ? loaded.projects : [],
    folders: Array.isArray(loaded.folders) ? loaded.folders : [],
    tracks: Array.isArray(loaded.tracks) ? loaded.tracks : [],
    activeProjectId: loaded.activeProjectId ?? null,
    activeFolderId: loaded.activeFolderId ?? null,
    currentId: loaded.currentId ?? null,
    playing: false,
    volume: typeof loaded.volume === "number" ? Math.min(1, Math.max(0, loaded.volume)) : 0.7,
    loop: loaded.loop !== false,
    shuffle: !!loaded.shuffle,
    currentTime: 0,
    duration: 0,
  };
  return ensureDefaultProject(base);
});

let audio: HTMLAudioElement | null = null;
let objectUrl: string | null = null;

function syncMediaSession() {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
  const track = bumpMusicCurrent();
  try {
    navigator.mediaSession.metadata = track
      ? new MediaMetadata({
          title: track.name,
          artist: "Wump Music",
          album: "On this device",
        })
      : null;
    navigator.mediaSession.playbackState = useBumpMusic.getState().playing ? "playing" : "paused";
  } catch {
    /* unsupported */
  }
}

function el() {
  if (typeof window === "undefined") return null;
  if (!audio) {
    audio = new Audio();
    audio.preload = "metadata";
    audio.addEventListener("ended", () => {
      const { loop, shuffle, currentId } = useBumpMusic.getState();
      if (loop && !shuffle) {
        void playBumpTrack(currentId ?? undefined);
        return;
      }
      void playNextBumpTrack();
    });
    audio.addEventListener("pause", () => {
      if (!audio?.ended) useBumpMusic.setState({ playing: false });
      syncMediaSession();
    });
    audio.addEventListener("play", () => {
      useBumpMusic.setState({ playing: true });
      syncMediaSession();
    });
    audio.addEventListener("timeupdate", () => {
      if (!audio) return;
      useBumpMusic.setState({ currentTime: audio.currentTime, duration: Number.isFinite(audio.duration) ? audio.duration : 0 });
    });
    audio.addEventListener("loadedmetadata", () => {
      if (!audio) return;
      useBumpMusic.setState({ duration: Number.isFinite(audio.duration) ? audio.duration : 0 });
    });
    if ("mediaSession" in navigator) {
      try {
        navigator.mediaSession.setActionHandler("play", () => void playBumpTrack());
        navigator.mediaSession.setActionHandler("pause", () => pauseBumpMusic());
        navigator.mediaSession.setActionHandler("previoustrack", () => void playPrevBumpTrack());
        navigator.mediaSession.setActionHandler("nexttrack", () => void playNextBumpTrack());
        navigator.mediaSession.setActionHandler("seekto", (d) => {
          if (typeof d.seekTime === "number") seekBumpMusic(d.seekTime);
        });
      } catch {
        /* ignore */
      }
    }
  }
  return audio;
}

function revoke() {
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }
}

export function bumpMusicQueue(): BumpMusicTrack[] {
  const s = useBumpMusic.getState();
  const pid = s.activeProjectId;
  if (!pid) return [];
  return s.tracks
    .filter((t) => t.projectId === pid && (s.activeFolderId ? t.folderId === s.activeFolderId : true))
    .sort((a, b) => b.addedAt - a.addedAt);
}

export function createBumpProject(name: string) {
  const p: BumpMusicProject = {
    id: uid("bp"),
    name: name.trim().slice(0, 60) || "New project",
    color: COLORS[useBumpMusic.getState().projects.length % COLORS.length]!,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  useBumpMusic.setState((s) => ({
    projects: [p, ...s.projects],
    activeProjectId: p.id,
    activeFolderId: null,
  }));
  persist();
  return p;
}

export function renameBumpProject(id: string, name: string) {
  useBumpMusic.setState((s) => ({
    projects: s.projects.map((p) => (p.id === id ? { ...p, name: name.trim().slice(0, 60) || p.name, updatedAt: Date.now() } : p)),
  }));
  persist();
}

export function deleteBumpProject(id: string) {
  const { projects, folders, tracks, currentId, activeProjectId } = useBumpMusic.getState();
  const trackIds = tracks.filter((t) => t.projectId === id).map((t) => t.id);
  for (const tid of trackIds) void idbDel(tid);
  if (currentId && trackIds.includes(currentId)) {
    el()?.pause();
    revoke();
  }
  const nextProjects = projects.filter((p) => p.id !== id);
  const next = ensureDefaultProject({
    ...useBumpMusic.getState(),
    projects: nextProjects,
    folders: folders.filter((f) => f.projectId !== id),
    tracks: tracks.filter((t) => t.projectId !== id),
    activeProjectId: activeProjectId === id ? nextProjects[0]?.id ?? null : activeProjectId,
    activeFolderId: null,
    currentId: currentId && trackIds.includes(currentId) ? null : currentId,
    playing: currentId && trackIds.includes(currentId) ? false : useBumpMusic.getState().playing,
  });
  useBumpMusic.setState(next);
  persist();
}

export function setActiveBumpProject(id: string) {
  useBumpMusic.setState({ activeProjectId: id, activeFolderId: null });
  persist();
}

export function createBumpFolder(projectId: string, name: string) {
  const f: BumpMusicFolder = {
    id: uid("bf"),
    projectId,
    name: name.trim().slice(0, 40) || "Folder",
    createdAt: Date.now(),
  };
  useBumpMusic.setState((s) => ({ folders: [...s.folders, f] }));
  persist();
  return f;
}

export function renameBumpFolder(id: string, name: string) {
  useBumpMusic.setState((s) => ({
    folders: s.folders.map((f) => (f.id === id ? { ...f, name: name.trim().slice(0, 40) || f.name } : f)),
  }));
  persist();
}

export function deleteBumpFolder(id: string) {
  useBumpMusic.setState((s) => ({
    folders: s.folders.filter((f) => f.id !== id),
    tracks: s.tracks.map((t) => (t.folderId === id ? { ...t, folderId: null } : t)),
    activeFolderId: s.activeFolderId === id ? null : s.activeFolderId,
  }));
  persist();
}

export function setActiveBumpFolder(id: string | null) {
  useBumpMusic.setState({ activeFolderId: id });
  persist();
}

export async function addBumpTrack(
  file: File,
  opts?: { projectId?: string; folderId?: string | null },
): Promise<{ ok: true; track: BumpMusicTrack } | { ok: false; error: string }> {
  if (!file.type.startsWith("audio/") && !/\.(mp3|wav|m4a|aac|ogg|flac|webm)$/i.test(file.name)) {
    return { ok: false, error: "Pick an audio file" };
  }
  if (file.size > MAX_BYTES) return { ok: false, error: "File must be under 40 MB" };
  const s = useBumpMusic.getState();
  if (s.tracks.length >= MAX_TRACKS) return { ok: false, error: `Max ${MAX_TRACKS} tracks on this device` };
  const projectId = opts?.projectId || s.activeProjectId || s.projects[0]?.id;
  if (!projectId) return { ok: false, error: "Create a project first" };
  const id = uid("bt");
  try {
    await idbPut(id, file);
  } catch {
    return { ok: false, error: "Couldn't save on this device" };
  }
  const track: BumpMusicTrack = {
    id,
    projectId,
    folderId: opts?.folderId ?? s.activeFolderId,
    name: file.name.replace(/\.[^.]+$/, "").slice(0, 100) || "Track",
    mime: file.type || "audio/mpeg",
    size: file.size,
    addedAt: Date.now(),
  };
  useBumpMusic.setState((st) => ({
    tracks: [track, ...st.tracks],
    currentId: st.currentId ?? id,
    projects: st.projects.map((p) => (p.id === projectId ? { ...p, updatedAt: Date.now() } : p)),
  }));
  persist();
  return { ok: true, track };
}

export async function removeBumpTrack(id: string) {
  const { tracks, currentId } = useBumpMusic.getState();
  await idbDel(id).catch(() => {});
  const next = tracks.filter((t) => t.id !== id);
  if (currentId === id) {
    el()?.pause();
    revoke();
  }
  useBumpMusic.setState({
    tracks: next,
    currentId: currentId === id ? next[0]?.id ?? null : currentId,
    playing: currentId === id ? false : useBumpMusic.getState().playing,
  });
  persist();
}

export function moveBumpTrackToFolder(trackId: string, folderId: string | null) {
  useBumpMusic.setState((s) => ({
    tracks: s.tracks.map((t) => (t.id === trackId ? { ...t, folderId } : t)),
  }));
  persist();
}

export function renameBumpTrack(id: string, name: string) {
  useBumpMusic.setState((s) => ({
    tracks: s.tracks.map((t) => (t.id === id ? { ...t, name: name.trim().slice(0, 100) || t.name } : t)),
  }));
  persist();
}

export function setBumpMusicVolume(v: number) {
  const volume = Math.min(1, Math.max(0, v));
  const a = el();
  if (a) a.volume = volume;
  useBumpMusic.setState({ volume });
  persist();
}

export function setBumpMusicLoop(loop: boolean) {
  useBumpMusic.setState({ loop });
  persist();
}

export function setBumpMusicShuffle(shuffle: boolean) {
  useBumpMusic.setState({ shuffle });
  persist();
}

export async function playBumpTrack(id?: string) {
  const state = useBumpMusic.getState();
  const queue = bumpMusicQueue();
  const trackId = id ?? state.currentId ?? queue[0]?.id;
  if (!trackId) return false;
  const a = el();
  if (!a) return false;
  try {
    if (state.currentId !== trackId || !objectUrl) {
      const blob = await idbGet(trackId);
      if (!blob) return false;
      revoke();
      objectUrl = URL.createObjectURL(blob);
      a.src = objectUrl;
      useBumpMusic.setState({ currentId: trackId });
      persist();
    }
    a.volume = state.volume;
    a.loop = false; // we handle next/loop ourselves
    await a.play();
    useBumpMusic.setState({ playing: true, currentTime: a.currentTime || 0 });
    syncMediaSession();
    return true;
  } catch {
    useBumpMusic.setState({ playing: false });
    return false;
  }
}

export function pauseBumpMusic() {
  el()?.pause();
  useBumpMusic.setState({ playing: false });
  syncMediaSession();
}

export function seekBumpMusic(seconds: number) {
  const a = el();
  if (!a || !Number.isFinite(seconds)) return;
  const dur = Number.isFinite(a.duration) ? a.duration : useBumpMusic.getState().duration;
  const t = Math.max(0, Math.min(dur || seconds, seconds));
  a.currentTime = t;
  useBumpMusic.setState({ currentTime: t });
}

export function formatBumpTime(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const s = Math.floor(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function toggleBumpMusic() {
  if (useBumpMusic.getState().playing) pauseBumpMusic();
  else void playBumpTrack();
}

export async function playNextBumpTrack() {
  const queue = bumpMusicQueue();
  if (!queue.length) {
    useBumpMusic.setState({ playing: false });
    return false;
  }
  const { currentId, shuffle } = useBumpMusic.getState();
  let next: BumpMusicTrack | undefined;
  if (shuffle) {
    const others = queue.filter((t) => t.id !== currentId);
    next = others[Math.floor(Math.random() * Math.max(1, others.length))] ?? queue[0];
  } else {
    const idx = queue.findIndex((t) => t.id === currentId);
    next = queue[(idx + 1) % queue.length];
  }
  return playBumpTrack(next?.id);
}

export async function playPrevBumpTrack() {
  const queue = bumpMusicQueue();
  if (!queue.length) return false;
  const { currentId } = useBumpMusic.getState();
  const idx = queue.findIndex((t) => t.id === currentId);
  const prev = queue[(idx <= 0 ? queue.length : idx) - 1];
  return playBumpTrack(prev?.id);
}

export function bumpMusicCurrent(): BumpMusicTrack | null {
  const { tracks, currentId } = useBumpMusic.getState();
  return tracks.find((t) => t.id === currentId) ?? null;
}

export function formatBumpBytes(n: number) {
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** The audio file of a library track (for uploading / sharing it with friends). */
export async function getBumpTrackBlob(id: string) {
  return idbGet(id);
}
