/**
 * Shared in-memory API caches (followers, unfurl, …).
 * Cleared hourly by /api/cache/purge so serverless instances stay lean and fresh.
 */

export type CacheEntry<T> = { at: number; value: T };

type Bucket = Map<string, CacheEntry<unknown>>;

const buckets = new Map<string, Bucket>();

function bucket(name: string): Bucket {
  let b = buckets.get(name);
  if (!b) {
    b = new Map();
    buckets.set(name, b);
  }
  return b;
}

export function cacheGet<T>(name: string, key: string, ttlMs: number): T | undefined {
  const b = bucket(name);
  const hit = b.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > ttlMs) {
    b.delete(key);
    return undefined;
  }
  return hit.value as T;
}

export function cacheSet<T>(name: string, key: string, value: T) {
  bucket(name).set(key, { at: Date.now(), value });
}

/** Drop expired entries; returns how many were removed. */
export function cachePrune(name?: string): number {
  const now = Date.now();
  let removed = 0;
  const targets = name ? [bucket(name)] : [...buckets.values()];
  for (const b of targets) {
    for (const [k, v] of b) {
      // entries without explicit TTL are kept until hard clear; prune only very old (>2h)
      if (now - v.at > 2 * 60 * 60_000) {
        b.delete(k);
        removed++;
      }
    }
  }
  return removed;
}

/** Hard clear — used by the hourly cron. */
export function cacheClearAll(): { buckets: number; entries: number } {
  let entries = 0;
  for (const b of buckets.values()) entries += b.size;
  const n = buckets.size;
  buckets.clear();
  return { buckets: n, entries };
}

export function cacheStats() {
  const out: Record<string, number> = {};
  let total = 0;
  for (const [name, b] of buckets) {
    out[name] = b.size;
    total += b.size;
  }
  return { buckets: out, total };
}
