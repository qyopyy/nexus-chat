"use client";

// Folder sync (one way: this device → Nexus Drive). Works where the browser lets a page keep a folder handle
// (Chrome, Edge, desktop and Android). Elsewhere the Drive app falls back to a one-time "upload a folder" picker.

import { addFiles, useDrive } from "./driveStore";
import { planSync, syncKey, joinPath, parentPath, type LocalFile, type RemoteFile } from "./driveFolders";

type DirHandle = FileSystemDirectoryHandle & {
  entries(): AsyncIterable<[string, FileSystemHandle]>;
  queryPermission?(o: { mode: "read" }): Promise<PermissionState>;
  requestPermission?(o: { mode: "read" }): Promise<PermissionState>;
};
export type SyncEntry = { id: string; name: string; root: string; handle: DirHandle; last?: number };

export const syncSupported = () => typeof window !== "undefined" && "showDirectoryPicker" in window;

// ------------------------------------------------------------------ remembering folders (handles live in IndexedDB)
const DB = "nexus-drive";
const STORE = "sync";
const open = () =>
  new Promise<IDBDatabase>((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: "id" });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
const tx = async <T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>) => {
  const db = await open();
  return new Promise<T>((res, rej) => {
    const r = f(db.transaction(STORE, mode).objectStore(STORE));
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
};
export const listSync = async (): Promise<SyncEntry[]> => {
  try {
    return await tx("readonly", (s) => s.getAll() as IDBRequest<SyncEntry[]>);
  } catch {
    return [];
  }
};
const saveEntry = (e: SyncEntry) => tx("readwrite", (s) => s.put(e));
export const removeSync = (id: string) => tx("readwrite", (s) => s.delete(id));

export async function addSyncFolder(): Promise<SyncEntry | null> {
  try {
    const handle = (await (window as unknown as { showDirectoryPicker: (o?: object) => Promise<DirHandle> }).showDirectoryPicker({ mode: "read", id: "nexus-drive" })) as DirHandle;
    const e: SyncEntry = { id: crypto.randomUUID(), name: handle.name, root: joinPath("Synced", handle.name), handle };
    await saveEntry(e);
    return e;
  } catch {
    return null; // cancelled
  }
}

// ------------------------------------------------------------------ scanning
const SKIP = /^(\.|Thumbs\.db$|desktop\.ini$|~\$)/i;
const MAX_FILES = 20000;
export async function scanFolder(root: DirHandle): Promise<{ list: LocalFile[]; get: (rel: string) => Promise<File> }> {
  const list: LocalFile[] = [];
  const handles = new Map<string, FileSystemFileHandle>();
  const walk = async (dir: DirHandle, prefix: string, depth: number) => {
    for await (const [name, h] of dir.entries()) {
      if (SKIP.test(name) || list.length >= MAX_FILES) continue;
      if (h.kind === "directory") {
        if (depth < 8) await walk(h as DirHandle, prefix + name + "/", depth + 1);
      } else {
        const f = await (h as FileSystemFileHandle).getFile();
        const rel = prefix + name;
        handles.set(rel, h as FileSystemFileHandle);
        list.push({ rel, size: f.size, mtime: f.lastModified });
      }
    }
  };
  await walk(root, "", 0);
  return { list, get: async (rel) => handles.get(rel)!.getFile() };
}

// ------------------------------------------------------------------ syncing
const doneKey = (id: string) => `nexus.drive.sync.done.${id}`;
const readDone = (id: string): Set<string> => {
  try {
    return new Set(JSON.parse(localStorage.getItem(doneKey(id)) ?? "[]"));
  } catch {
    return new Set();
  }
};
const writeDone = (id: string, s: Set<string>) => {
  try {
    localStorage.setItem(doneKey(id), JSON.stringify([...s].slice(-50000)));
  } catch {
    /* ignore */
  }
};

/** Needs a user gesture the first time after a restart (the browser asks again before reading a saved folder). */
export async function ensureRead(h: DirHandle): Promise<boolean> {
  if ((await h.queryPermission?.({ mode: "read" })) === "granted") return true;
  return (await h.requestPermission?.({ mode: "read" })) === "granted";
}

export async function syncNow(e: SyncEntry, remote: RemoteFile[]): Promise<{ queued: number; total: number } | { error: string }> {
  if (!(await ensureRead(e.handle))) return { error: "Allow access to the folder to sync it." };
  const { list, get } = await scanFolder(e.handle);
  const todo = planSync(list, remote, e.root, readDone(e.id));
  const jobs: { rel: string; sk: string; key: string }[] = [];
  const items: { file: File; folder: string }[] = [];
  for (const l of todo) {
    const file = await get(l.rel);
    items.push({ file, folder: joinPath(e.root, parentPath(l.rel)) });
    jobs.push({ rel: l.rel, sk: syncKey(l), key: `${joinPath(e.root, parentPath(l.rel))}|${file.name}|${file.size}|${file.lastModified}` });
  }
  addFiles(items);
  if (jobs.length) {
    // remember each file as synced once it has really landed, so a half-finished run is picked up again next time
    const pending = new Map(jobs.map((j) => [j.key, j.sk]));
    const off = useDrive.subscribe((s) => {
      let changed = false;
      const done = readDone(e.id);
      for (const t of s.items) {
        const sk = pending.get(t.key);
        if (sk && t.state === "done") (done.add(sk), pending.delete(t.key), (changed = true));
      }
      if (changed) writeDone(e.id, done);
      if (!pending.size) off();
    });
  }
  await saveEntry({ ...e, last: Date.now() });
  return { queued: todo.length, total: list.length };
}
