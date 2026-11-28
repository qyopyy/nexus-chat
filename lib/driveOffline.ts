"use client";

// Selective offline copies. A file you mark "keep offline" is downloaded once into the browser's Cache Storage
// and played from there with no network. The copy lives only on this device and can be removed at any time.

import { supabase } from "./supabase";
import type { VaultFile } from "./protect";

const CACHE = "nexus-drive-v1";
const INDEX = "nexus.drive.offline.v1";
const key = (id: string) => `/__nexus-drive/${id}`;

export const offlineSupported = () => typeof caches !== "undefined";
type Entry = { id: string; name: string; bytes: number; at: number };
const readIdx = (): Entry[] => {
  try {
    return JSON.parse(localStorage.getItem(INDEX) ?? "[]");
  } catch {
    return [];
  }
};
const writeIdx = (e: Entry[]) => {
  try {
    localStorage.setItem(INDEX, JSON.stringify(e));
  } catch {
    /* ignore */
  }
};
export const offlineList = () => readIdx();
export const isOffline = (id: string) => readIdx().some((e) => e.id === id);

export async function saveOffline(f: VaultFile, onProgress: (done: number, total: number) => void, signal: AbortSignal): Promise<void> {
  if (!offlineSupported()) throw new Error("This browser can't keep files offline.");
  const { data } = await supabase.storage.from("user-vault").createSignedUrl(f.path, 3600);
  if (!data?.signedUrl) throw new Error("Could not get the file");
  const res = await fetch(data.signedUrl, { signal });
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status})`);
  const total = Number(res.headers.get("content-length")) || f.bytes;
  let done = 0;
  const counted = res.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, ctl) {
        done += chunk.byteLength;
        onProgress(done, total);
        ctl.enqueue(chunk);
      },
    }),
  );
  const cache = await caches.open(CACHE);
  try {
    await cache.put(key(f.id), new Response(counted, { headers: { "content-type": f.mime || "application/octet-stream", "content-length": String(total) } }));
  } catch (e) {
    await cache.delete(key(f.id));
    if (signal.aborted) throw e;
    throw new Error("Not enough space on this device for an offline copy.");
  }
  writeIdx([...readIdx().filter((e) => e.id !== f.id), { id: f.id, name: f.name, bytes: total, at: Date.now() }]);
}

/** A playable blob: URL for an offline copy (revoke it when done), or null. */
export async function offlineUrl(id: string): Promise<string | null> {
  if (!offlineSupported() || !isOffline(id)) return null;
  const hit = await (await caches.open(CACHE)).match(key(id));
  if (!hit) {
    writeIdx(readIdx().filter((e) => e.id !== id)); // the browser evicted it
    return null;
  }
  return URL.createObjectURL(await hit.blob());
}
export async function removeOffline(id: string) {
  if (offlineSupported()) await (await caches.open(CACHE)).delete(key(id));
  writeIdx(readIdx().filter((e) => e.id !== id));
}
export async function deviceStorage(): Promise<{ used: number; quota: number } | null> {
  try {
    const e = await navigator.storage?.estimate?.();
    return e ? { used: e.usage ?? 0, quota: e.quota ?? 0 } : null;
  } catch {
    return null;
  }
}
