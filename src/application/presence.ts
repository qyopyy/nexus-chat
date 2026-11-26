import { randomUUID } from 'node:crypto';
import type { Clock } from './ports.ts';
import { hashToken, randomToken } from './tokens.ts';

type PresenceOptions = {
  /** How long a disconnected player keeps their identity (and place in line). */
  graceMs: number;
  now?: Clock;
  /** Called once when a disconnected player did not come back in time. */
  onExpire: (playerId: string) => void;
};

type Entry = { resumeHash: string; connected: boolean; expiresAt: number };

/**
 * Who is here and who is just reconnecting. A Wi-Fi blip or a page reload must not cost a player
 * their place: each player gets a secret resume token (kept by their tab) and keeps their identity
 * for `graceMs` after the connection drops.
 */
export class Presence {
  readonly #graceMs: number;
  readonly #now: Clock;
  readonly #onExpire: (playerId: string) => void;
  readonly #players = new Map<string, Entry>();
  readonly #byHash = new Map<string, string>();

  constructor({ graceMs, now = Date.now, onExpire }: PresenceOptions) {
    this.#graceMs = graceMs;
    this.#now = now;
    this.#onExpire = onExpire;
  }

  /** A brand-new player identity and the secret that resumes it. */
  connect(): { playerId: string; resumeToken: string } {
    const playerId = randomUUID();
    const resumeToken = randomToken();
    const resumeHash = hashToken(resumeToken);
    this.#players.set(playerId, { resumeHash, connected: true, expiresAt: 0 });
    this.#byHash.set(resumeHash, playerId);
    return { playerId, resumeToken };
  }

  /** The hash of a player's resume token (to save the line), or null if unknown. */
  resumeHashOf(playerId: string): string | null {
    return this.#players.get(playerId)?.resumeHash ?? null;
  }

  /** Brings back a player saved before a restart, disconnected, for `graceMs`. */
  restore(playerId: string, resumeHash: string, graceMs: number): void {
    if (this.#players.has(playerId) || this.#byHash.has(resumeHash)) return;
    this.#players.set(playerId, { resumeHash, connected: false, expiresAt: this.#now() + graceMs });
    this.#byHash.set(resumeHash, playerId);
  }

  /** The player id to continue as, or null if the token is unknown, expired or already in use. */
  resume(resumeToken: string): string | null {
    const playerId = this.#byHash.get(hashToken(resumeToken));
    const entry = playerId ? this.#players.get(playerId) : undefined;
    if (!playerId || !entry || entry.connected) return null;
    entry.connected = true;
    return playerId;
  }

  disconnect(playerId: string): void {
    const entry = this.#players.get(playerId);
    if (!entry) return;
    entry.connected = false;
    entry.expiresAt = this.#now() + this.#graceMs;
  }

  /** Expires players whose grace period ran out. Call periodically. */
  tick(): void {
    const now = this.#now();
    for (const [playerId, entry] of this.#players) {
      if (entry.connected || now < entry.expiresAt) continue;
      this.#byHash.delete(entry.resumeHash);
      this.#players.delete(playerId);
      this.#onExpire(playerId);
    }
  }
}
