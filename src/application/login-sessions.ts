import type { Clock } from './ports.ts';
import { hashToken, randomToken } from './tokens.ts';

/** A logged-in viewer. `id` is provider-scoped, e.g. "kick:123". */
export type Account = { id: string; name: string };

/** A login as saved across restarts: the cookie's hash only, never the cookie itself. */
export type SavedLogin = { hash: string; id: string; name: string; expiresAt: number };

type Entry = { account: Account; expiresAt: number };

type LoginSessionsOptions = { ttlMs: number; max?: number; now?: Clock; onChange?: () => void };

/**
 * Login sessions: an opaque random token (the session cookie) → the account, stored by the token's
 * SHA-256 so a saved copy holds no usable cookie. Nothing from the identity provider is stored.
 */
export class LoginSessions {
  readonly #ttlMs: number;
  readonly #max: number;
  readonly #now: Clock;
  readonly #onChange: () => void;
  readonly #entries = new Map<string, Entry>();

  constructor({ ttlMs, max = 10_000, now = Date.now, onChange = () => {} }: LoginSessionsOptions) {
    this.#ttlMs = ttlMs;
    this.#max = max;
    this.#now = now;
    this.#onChange = onChange;
  }

  /** Starts a session and returns its cookie value. */
  create(account: Account): string {
    const token = randomToken(32);
    this.#add(hashToken(token), { account, expiresAt: this.#now() + this.#ttlMs });
    this.#onChange();
    return token;
  }

  get(token: string): Account | null {
    const hash = hashToken(token);
    const entry = this.#entries.get(hash);
    if (!entry) return null;
    if (this.#now() >= entry.expiresAt) {
      this.#entries.delete(hash);
      return null;
    }
    return entry.account;
  }

  delete(token: string): void {
    if (this.#entries.delete(hashToken(token))) this.#onChange();
  }

  /** Live sessions, oldest first. */
  saved(): SavedLogin[] {
    const now = this.#now();
    return [...this.#entries]
      .filter(([, entry]) => now < entry.expiresAt)
      .map(([hash, { account, expiresAt }]) => ({ hash, id: account.id, name: account.name, expiresAt }));
  }

  /** Brings back saved sessions; expired ones are skipped. */
  restore(logins: readonly SavedLogin[]): void {
    const now = this.#now();
    for (const { hash, id, name, expiresAt } of logins) {
      if (now < expiresAt) this.#add(hash, { account: { id, name }, expiresAt });
    }
  }

  #add(hash: string, entry: Entry): void {
    this.#entries.set(hash, entry);
    // Map keeps insertion order: the first key is the oldest session.
    while (this.#entries.size > this.#max) this.#entries.delete(this.#entries.keys().next().value!);
  }
}
