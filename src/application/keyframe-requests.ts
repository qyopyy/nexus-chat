import type { Clock } from './ports.ts';

/**
 * On-demand keyframes for the live video. Each console keyframe costs the player a small visible
 * hitch, so they are requested only when needed (a new viewer, a frozen picture) and never more
 * than once per `minIntervalMs`, however many callers ask.
 */
export class KeyframeRequests {
  readonly #send: (() => void) | null;
  readonly #minIntervalMs: number;
  readonly #now: Clock;
  #lastSentAt = Number.NEGATIVE_INFINITY;

  constructor({
    send,
    minIntervalMs,
    now = Date.now,
  }: {
    send: (() => void) | null;
    minIntervalMs: number;
    now?: Clock;
  }) {
    this.#send = send;
    this.#minIntervalMs = minIntervalMs;
    this.#now = now;
  }

  /** Returns true when the request reached the console. */
  request(): boolean {
    if (!this.#send) return false;
    const now = this.#now();
    if (now - this.#lastSentAt < this.#minIntervalMs) return false;
    this.#lastSentAt = now;
    this.#send();
    return true;
  }
}
