/** Someone in line. */
export type Player = { id: string; name: string };

type QueueConfig = {
  /** How long a regular turn lasts. */
  turnMs: number;
  /** Extra time granted when a turn ends and nobody is waiting. */
  extensionMs: number;
};

/** Why the turn clock is frozen: the video stream is down, or an admin paused the game. */
export type PauseReason = 'stream' | 'admin';

/** A read-only picture of the line. */
export type QueueSnapshot = {
  current: { id: string; name: string; endsAt: number } | null;
  waiting: Player[];
  /** Set while the turn clock is frozen; `remainingMs` is the current turn's frozen time left. */
  paused: { reasons: PauseReason[]; remainingMs: number | null } | null;
};

type Turn = { player: Player; endsAt: number };

/**
 * A first-come, first-served line of players for a single console, with timed turns.
 * Pure: time comes from the injected clock, so it is fully deterministic in tests.
 */
export class TurnQueue {
  readonly #config: QueueConfig;
  readonly #now: () => number;
  #current: Turn | null = null;
  #waiting: Player[] = [];
  readonly #pauseReasons = new Set<PauseReason>();
  /** When the clock froze; null while it runs. */
  #pausedAt: number | null = null;

  constructor(config: QueueConfig, now: () => number = Date.now) {
    this.#config = config;
    this.#now = now;
  }

  /** Adds a player (or keeps their place) and returns their position: 0 means in control. */
  join(player: Player): number {
    const existing = this.positionOf(player.id);
    if (existing !== -1) return existing;
    if (!this.#current) {
      this.#startTurn(player);
      return 0;
    }
    this.#waiting.push(player);
    return this.#waiting.length;
  }

  /**
   * Replaces the line with one saved before a restart. `current` keeps playing with
   * `remainingMs` left; without one, the first waiting player starts a fresh turn.
   */
  restore(current: { player: Player; remainingMs: number } | null, waiting: readonly Player[]): void {
    this.#waiting = [...waiting];
    this.#current = null;
    if (current) this.#current = { player: current.player, endsAt: this.#clockNow() + current.remainingMs };
    else this.#advance();
  }

  /** Removes a player; when it is the controller, the next player takes over. */
  leave(id: string): void {
    if (this.#current?.player.id === id) this.#advance();
    else this.#waiting = this.#waiting.filter((p) => p.id !== id);
  }

  /** Freezes the turn clock for `reason`. Returns false if that reason was already active. */
  pause(reason: PauseReason): boolean {
    if (this.#pauseReasons.has(reason)) return false;
    this.#pausedAt ??= this.#now();
    this.#pauseReasons.add(reason);
    return true;
  }

  /** Lifts `reason`; the clock runs again once no reason is left. Returns false if it was not active. */
  resume(reason: PauseReason): boolean {
    if (!this.#pauseReasons.delete(reason)) return false;
    if (this.#pauseReasons.size === 0 && this.#pausedAt !== null) {
      if (this.#current) this.#current.endsAt += this.#now() - this.#pausedAt;
      this.#pausedAt = null;
    }
    return true;
  }

  /** When the turn clock froze, or null while it runs. */
  pausedAt(): number | null {
    return this.#pausedAt;
  }

  /** Ends or extends the current turn when it has expired. Returns true if anything changed. */
  tick(): boolean {
    if (this.#pausedAt !== null || !this.#current || this.#now() < this.#current.endsAt) return false;
    if (this.#waiting.length === 0) this.#current.endsAt += this.#config.extensionMs;
    else this.#advance();
    return true;
  }

  isController(id: string): boolean {
    return this.#current?.player.id === id;
  }

  controllerId(): string | null {
    return this.#current?.player.id ?? null;
  }

  /** 0 = in control, 1..n = waiting, -1 = not in line. */
  positionOf(id: string): number {
    if (this.#current?.player.id === id) return 0;
    const index = this.#waiting.findIndex((p) => p.id === id);
    return index === -1 ? -1 : index + 1;
  }

  /** Every player id in line, controller first. */
  ids(): string[] {
    return [...(this.#current ? [this.#current.player.id] : []), ...this.#waiting.map((p) => p.id)];
  }

  snapshot(): QueueSnapshot {
    const current = this.#current
      ? { id: this.#current.player.id, name: this.#current.player.name, endsAt: this.#current.endsAt }
      : null;
    const waiting = this.#waiting.map((p) => ({ id: p.id, name: p.name }));
    const paused =
      this.#pausedAt === null
        ? null
        : {
            reasons: [...this.#pauseReasons],
            remainingMs: this.#current ? Math.max(0, this.#current.endsAt - this.#pausedAt) : null,
          };
    return { current, waiting, paused };
  }

  #clockNow(): number {
    return this.#pausedAt ?? this.#now();
  }

  #advance(): void {
    const next = this.#waiting.shift();
    this.#current = null;
    if (next) this.#startTurn(next);
  }

  #startTurn(player: Player): void {
    // A turn that starts during a pause starts frozen: resume() pushes endsAt by the paused time.
    this.#current = { player, endsAt: this.#clockNow() + this.#config.turnMs };
  }
}
