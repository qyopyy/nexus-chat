"use client";

import { create } from "zustand";
import { loadJSON, saveJSON } from "@/lib/utils";

export type MenuTrackMeta = {
  id: string;
  name: string;
  mime: string;
  size: number;
  addedAt: number;
};

type MenuMusicState = {
  tracks: MenuTrackMeta[];
  currentId: string | null;
  playing: boolean;
  volume: number; // 0–1
};

const META_KEY = "nexus.menuMusic.meta";
const DB_NAME = "nexus-menu-music";
const STORE = "tracks";
const MAX_TRACKS = 24;
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB per file (device-local)

const EMPTY: MenuMusicState = { tracks: [], currentId: null, playing: false, volume: 0.55 };

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

function persistMeta(partial?: Partial<MenuMusicState>) {
  const s = { ...useMenuMusic.getState(), ...partial };
  saveJSON(META_KEY, {
    tracks: s.tracks,
    currentId: s.currentId,
    volume: s.volume,
  });
}

export const useMenuMusic = create<MenuMusicState>(() => {
  if (typeof window === "undefined") return EMPTY;
  const loaded = loadJSON<{ tracks?: MenuTrackMeta[]; currentId?: string | null; volume?: number }>(META_KEY, {});
  return {
    tracks: Array.isArray(loaded.tracks) ? loaded.tracks : [],
    currentId: loaded.currentId ?? null,
    playing: false,
    volume: typeof loaded.volume === "number" ? Math.min(1, Math.max(0, loaded.volume)) : 0.55,
  };
});

let audio: HTMLAudioElement | null = null;
let objectUrl: string | null = null;

function el() {
  if (typeof window === "undefined") return null;
  if (!audio) {
    audio = new Audio();
    audio.preload = "metadata";
    audio.loop = true;
    audio.addEventListener("ended", () => useMenuMusic.setState({ playing: false }));
    audio.addEventListener("pause", () => {
      if (!audio?.ended) useMenuMusic.setState({ playing: false });
    });
    audio.addEventListener("play", () => useMenuMusic.setState({ playing: true }));
  }
  return audio;
}

function revoke() {
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }
}

export async function addMenuTrack(file: File): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!file.type.startsWith("audio/") && !/\.(mp3|wav|m4a|aac|ogg|flac|webm)$/i.test(file.name)) {
    return { ok: false, error: "Pick an audio file" };
  }
  if (file.size > MAX_BYTES) return { ok: false, error: "File must be under 25 MB" };
  const { tracks } = useMenuMusic.getState();
  if (tracks.length >= MAX_TRACKS) return { ok: false, error: `Max ${MAX_TRACKS} tracks` };
  const id = `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  try {
    await idbPut(id, file);
  } catch {
    return { ok: false, error: "Couldn't save on this device" };
  }
  const meta: MenuTrackMeta = {
    id,
    name: file.name.replace(/\.[^.]+$/, "").slice(0, 80) || "Track",
    mime: file.type || "audio/mpeg",
    size: file.size,
    addedAt: Date.now(),
  };
  const next = [meta, ...tracks].slice(0, MAX_TRACKS);
  useMenuMusic.setState({ tracks: next, currentId: useMenuMusic.getState().currentId ?? id });
  persistMeta();
  return { ok: true };
}

export async function removeMenuTrack(id: string) {
  const { tracks, currentId } = useMenuMusic.getState();
  await idbDel(id).catch(() => {});
  const next = tracks.filter((t) => t.id !== id);
  const nextCurrent = currentId === id ? next[0]?.id ?? null : currentId;
  if (currentId === id) {
    el()?.pause();
    revoke();
  }
  useMenuMusic.setState({ tracks: next, currentId: nextCurrent, playing: currentId === id ? false : useMenuMusic.getState().playing });
  persistMeta();
}

export function setMenuMusicVolume(v: number) {
  const volume = Math.min(1, Math.max(0, v));
  const a = el();
  if (a) a.volume = volume;
  useMenuMusic.setState({ volume });
  persistMeta();
}

export function selectMenuTrack(id: string) {
  useMenuMusic.setState({ currentId: id });
  persistMeta();
}

export async function playMenuTrack(id?: string) {
  const state = useMenuMusic.getState();
  const trackId = id ?? state.currentId ?? state.tracks[0]?.id;
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
      useMenuMusic.setState({ currentId: trackId });
      persistMeta();
    }
    a.volume = state.volume;
    a.loop = true;
    await a.play();
    useMenuMusic.setState({ playing: true });
    return true;
  } catch {
    useMenuMusic.setState({ playing: false });
    return false;
  }
}

export function pauseMenuMusic() {
  el()?.pause();
  useMenuMusic.setState({ playing: false });
}

export function toggleMenuMusic() {
  const { playing } = useMenuMusic.getState();
  if (playing) pauseMenuMusic();
  else void playMenuTrack();
}
