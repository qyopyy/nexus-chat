"use client";

/**
 * Wump local music — songs, folders, projects (device-local IndexedDB + prefs).
 * Spotify playback uses the existing Nexus Spotify connection.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

const DB = "wump-music-v1";
const STORE = "songs";

export type WumpFolder = { id: string; name: string; created_at: string };
export type WumpProject = { id: string; name: string; songIds: string[]; folderId: string | null; created_at: string };
export type WumpSongMeta = {
  id: string;
  name: string;
  folderId: string | null;
  projectId: string | null;
  mime: string;
  size: number;
  duration: number | null;
  created_at: string;
};

type State = {
  folders: WumpFolder[];
  projects: WumpProject[];
  songs: WumpSongMeta[];
  currentId: string | null;
  playing: boolean;
};

export const useWumpMusic = create<State>()(
  persist(
    (): State => ({
      folders: [] as WumpFolder[],
      projects: [] as WumpProject[],
      songs: [] as WumpSongMeta[],
      currentId: null,
      playing: false,
    }),
    { name: "wump.music.meta", version: 1 },
  ),
);

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
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

const urlCache = new Map<string, string>();

export async function wumpSongUrl(id: string): Promise<string | null> {
  const hit = urlCache.get(id);
  if (hit) return hit;
  const blob = await idbGet(id);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urlCache.set(id, url);
  return url;
}

export async function wumpAddSongs(files: FileList | File[], folderId: string | null = null) {
  const list = Array.from(files).filter((f) => /^audio\//.test(f.type) || /\.(mp3|m4a|aac|wav|ogg|flac)$/i.test(f.name));
  const added: WumpSongMeta[] = [];
  for (const f of list) {
    const id = crypto.randomUUID();
    await idbPut(id, f);
    added.push({
      id,
      name: f.name.replace(/\.[^.]+$/, ""),
      folderId,
      projectId: null,
      mime: f.type || "audio/mpeg",
      size: f.size,
      duration: null,
      created_at: new Date().toISOString(),
    });
  }
  if (added.length) useWumpMusic.setState((s) => ({ songs: [...added, ...s.songs] }));
  return added.length;
}

export function wumpAddFolder(name: string) {
  const folder: WumpFolder = { id: crypto.randomUUID(), name: name.trim() || "Folder", created_at: new Date().toISOString() };
  useWumpMusic.setState((s) => ({ folders: [folder, ...s.folders] }));
  return folder;
}

export function wumpAddProject(name: string, folderId: string | null = null) {
  const project: WumpProject = {
    id: crypto.randomUUID(),
    name: name.trim() || "Project",
    songIds: [],
    folderId,
    created_at: new Date().toISOString(),
  };
  useWumpMusic.setState((s) => ({ projects: [project, ...s.projects] }));
  return project;
}

export function wumpAssignSong(songId: string, patch: Partial<Pick<WumpSongMeta, "folderId" | "projectId" | "name">>) {
  useWumpMusic.setState((s) => ({
    songs: s.songs.map((x) => (x.id === songId ? { ...x, ...patch } : x)),
    projects: patch.projectId
      ? s.projects.map((p) =>
          p.id === patch.projectId
            ? { ...p, songIds: p.songIds.includes(songId) ? p.songIds : [...p.songIds, songId] }
            : { ...p, songIds: p.songIds.filter((id) => id !== songId) },
        )
      : s.projects,
  }));
}

export async function wumpDeleteSong(id: string) {
  await idbDel(id);
  const url = urlCache.get(id);
  if (url) {
    URL.revokeObjectURL(url);
    urlCache.delete(id);
  }
  useWumpMusic.setState((s) => ({
    songs: s.songs.filter((x) => x.id !== id),
    projects: s.projects.map((p) => ({ ...p, songIds: p.songIds.filter((x) => x !== id) })),
    currentId: s.currentId === id ? null : s.currentId,
    playing: s.currentId === id ? false : s.playing,
  }));
}

export function wumpDeleteFolder(id: string) {
  useWumpMusic.setState((s) => ({
    folders: s.folders.filter((f) => f.id !== id),
    songs: s.songs.map((x) => (x.folderId === id ? { ...x, folderId: null } : x)),
    projects: s.projects.map((p) => (p.folderId === id ? { ...p, folderId: null } : p)),
  }));
}

export function wumpDeleteProject(id: string) {
  useWumpMusic.setState((s) => ({
    projects: s.projects.filter((p) => p.id !== id),
    songs: s.songs.map((x) => (x.projectId === id ? { ...x, projectId: null } : x)),
  }));
}

export function wumpSetPlaying(id: string | null, playing = true) {
  useWumpMusic.setState({ currentId: id, playing: !!id && playing });
}
