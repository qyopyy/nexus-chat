import type { Clock } from './ports.ts';

type Bucket = { tokens: number; at: number };

type RateLimiterOptions = {
  /** Burst size. */
  capacity: number;
  /** Tokens added per second. */
  perSecond: number;
  /** Most keys tracked at once; the least recently used are dropped beyond it. */
  maxKeys?: number;
  now?: Clock;
};

/** A token bucket per key (e.g. visitor IP). `take()` spends one token; false means over the limit. */
export class RateLimiter {
  readonly #capacity: number;
  readonly #perMs: number;
  readonly #maxKeys: number;
  readonly #now: Clock;
  readonly #buckets = new Map<string, Bucket>();

  constructor({ capacity, perSecond, maxKeys = 50_000, now = Date.now }: RateLimiterOptions) {
    this.#capacity = capacity;
    this.#perMs = perSecond / 1000;
    this.#maxKeys = maxKeys;
    this.#now = now;
  }

  take(key: string): boolean {
    const now = this.#now();
    const bucket = this.#buckets.get(key) ?? { tokens: this.#capacity, at: now };
    bucket.tokens = Math.min(this.#capacity, bucket.tokens + (now - bucket.at) * this.#perMs);
    bucket.at = now;
    const allowed = bucket.tokens >= 1;
    if (allowed) bucket.tokens -= 1;
    // Re-insert so Map order is least-recently-used first.
    this.#buckets.delete(key);
    this.#buckets.set(key, bucket);
    while (this.#buckets.size > this.#maxKeys) this.#buckets.delete(this.#buckets.keys().next().value!);
    return allowed;
  }
}

/** Caps how many connections one origin may keep open at once. 0 means unlimited. */
export class ConnectionLimit {
  readonly #max: number;
  readonly #open = new Map<string, number>();

  constructor(max: number) {
    this.#max = max;
  }

  /** Counts a new connection; false (and nothing counted) when the origin is at the limit. */
  tryOpen(origin: string): boolean {
    const count = this.#open.get(origin) ?? 0;
    if (this.#max > 0 && count >= this.#max) return false;
    this.#open.set(origin, count + 1);
    return true;
  }

  close(origin: string): void {
    const count = (this.#open.get(origin) ?? 0) - 1;
    if (count > 0) this.#open.set(origin, count);
    else this.#open.delete(origin);
  }
}
