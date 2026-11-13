"use client";

const CACHE = "acetate-offline-v1";
const INDEX = "acetate:offline";
const MAX_COUNT = 40;
const MAX_BYTES = 500 * 1024 * 1024;

export type OfflineCut = {
  id: string;
  trackId?: string;
  title: string;
  bytes?: number;
  savedAt: string;
};

const blobUrls = new Map<string, string>();

/** Under /acetate/ so the service worker scope can answer it. Playback prefers a blob URL. */
export function offlinePath(versionId: string) {
  return `/acetate/offline/${encodeURIComponent(versionId)}`;
}

function legacyPath(versionId: string) {
  return `/acetate-offline/${encodeURIComponent(versionId)}`;
}

export function offlineCuts(): OfflineCut[] {
  if (typeof window === "undefined") return [];
  try {
    const rows = JSON.parse(localStorage.getItem(INDEX) || "[]") as OfflineCut[];
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

export function offlineUrl(versionId: string) {
  return offlinePath(versionId);
}

async function openCache() {
  return caches.open(CACHE);
}

async function matchCut(versionId: string) {
  if (typeof caches === "undefined") return undefined;
  const cache = await openCache();
  return (await cache.match(offlinePath(versionId))) || (await cache.match(legacyPath(versionId)));
}

export async function isOffline(versionId: string) {
  return !!(await matchCut(versionId));
}

/** Object URL for a saved cut. Null when this device does not have it. */
export async function offlinePlaybackUrl(versionId: string) {
  const existing = blobUrls.get(versionId);
  if (existing) return existing;
  const hit = await matchCut(versionId);
  if (!hit) return null;
  const url = URL.createObjectURL(await hit.blob());
  blobUrls.set(versionId, url);
  return url;
}

async function forgetIds(ids: string[]) {
  if (!ids.length || typeof caches === "undefined") return;
  const cache = await openCache();
  await Promise.all(
    ids.flatMap((id) => {
      const blob = blobUrls.get(id);
      if (blob) URL.revokeObjectURL(blob);
      blobUrls.delete(id);
      return [cache.delete(offlinePath(id)), cache.delete(legacyPath(id))];
    }),
  );
}

/** Keep a copy of a signed file on this device. The signed URL itself is not stored. */
export async function keepOffline(
  versionId: string,
  signedUrl: string,
  title: string,
  meta?: { trackId?: string; bytes?: number },
) {
  const res = await fetch(signedUrl);
  if (!res.ok) throw new Error("Couldn't save that version on this device");
  const blob = await res.blob();
  if (blob.size > MAX_BYTES) throw new Error("That file is over 500 MB, so it stays online only.");
  const cache = await openCache();
  await cache.put(offlinePath(versionId), new Response(blob, { headers: { "Content-Type": blob.type || "audio/mpeg" } }));
  const cut: OfflineCut = {
    id: versionId,
    trackId: meta?.trackId,
    title: title.trim() || "Vault track",
    bytes: blob.size || meta?.bytes || 0,
    savedAt: new Date().toISOString(),
  };
  const next = offlineCuts().filter((row) => row.id !== versionId);
  next.unshift(cut);
  const dropped: string[] = [];
  let bytes = next.reduce((sum, row) => sum + (row.bytes || 0), 0);
  while (next.length > MAX_COUNT || (bytes > MAX_BYTES && next.length > 1)) {
    const last = next.pop();
    if (!last || last.id === versionId) break;
    dropped.push(last.id);
    bytes -= last.bytes || 0;
  }
  localStorage.setItem(INDEX, JSON.stringify(next));
  await forgetIds(dropped);
}

export async function dropOffline(versionId: string) {
  await forgetIds([versionId]);
  localStorage.setItem(INDEX, JSON.stringify(offlineCuts().filter((row) => row.id !== versionId)));
}
