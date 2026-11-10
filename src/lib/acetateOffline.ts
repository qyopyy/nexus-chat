"use client";

const CACHE = "acetate-offline-v1";
const INDEX = "acetate:offline";

export type OfflineCut = { id: string; title: string; savedAt: string };

export function offlineCuts(): OfflineCut[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(INDEX) || "[]") as OfflineCut[];
  } catch {
    return [];
  }
}

export function offlineUrl(versionId: string) {
  return `/acetate-offline/${versionId}`;
}

export async function isOffline(versionId: string) {
  if (typeof caches === "undefined") return false;
  const cache = await caches.open(CACHE);
  return !!(await cache.match(offlineUrl(versionId)));
}

/** Keep a copy of a signed file on this device. The signed URL itself is not stored. */
export async function keepOffline(versionId: string, signedUrl: string, title: string) {
  const res = await fetch(signedUrl);
  if (!res.ok) throw new Error("Couldn't save that version on this device");
  const cache = await caches.open(CACHE);
  await cache.put(offlineUrl(versionId), res);
  const next = offlineCuts().filter((row) => row.id !== versionId);
  next.unshift({ id: versionId, title, savedAt: new Date().toISOString() });
  localStorage.setItem(INDEX, JSON.stringify(next.slice(0, 40)));
}

export async function dropOffline(versionId: string) {
  const cache = await caches.open(CACHE);
  await cache.delete(offlineUrl(versionId));
  localStorage.setItem(INDEX, JSON.stringify(offlineCuts().filter((row) => row.id !== versionId)));
}
