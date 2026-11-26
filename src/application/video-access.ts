/** What VideoAccess needs to know about viewers. */
type VideoAudience = {
  isController(playerId: string): boolean;
  isConnected(playerId: string): boolean;
  /**
   * When given, spectator slots go only to players about to play (everyone else watches the
   * public restream); without it, slots go to whoever asks first.
   */
  isUpcoming?(playerId: string): boolean;
};

type Admission = 'granted' | 'full' | 'unknown';

/** Marks a slot reserved while the WebRTC handshake is still in flight. */
const PENDING = '';

/**
 * Decides who may open a direct video stream. Every viewer costs upload bandwidth on the host's
 * connection, so spectators are capped; the controller always gets video because they cannot
 * play blind.
 */
export class VideoAccess {
  readonly #audience: VideoAudience;
  readonly #maxSpectators: number;
  /** playerId → upstream session URL (PENDING while connecting). */
  readonly #sessions = new Map<string, string>();

  constructor(audience: VideoAudience, maxSpectators: number) {
    this.#audience = audience;
    this.#maxSpectators = maxSpectators;
  }

  admit(playerId: string): Admission {
    if (!this.#audience.isConnected(playerId)) return 'unknown';
    if (this.#audience.isController(playerId)) return 'granted';
    if (this.#audience.isUpcoming && !this.#audience.isUpcoming(playerId)) return 'full';
    let spectators = 0;
    for (const id of this.#sessions.keys()) {
      if (id !== playerId && !this.#audience.isController(id)) spectators++;
    }
    return spectators < this.#maxSpectators ? 'granted' : 'full';
  }

  /** Holds a slot while the handshake runs. Returns the session it replaces, if any. */
  reserve(playerId: string): string | null {
    return this.register(playerId, PENDING);
  }

  /** Records the player's session. Returns the session it replaces, if any. */
  register(playerId: string, sessionUrl: string): string | null {
    const previous = this.#sessions.get(playerId) || null;
    this.#sessions.set(playerId, sessionUrl);
    return previous;
  }

  /** Players holding a session they may no longer have (disconnected, or turn over). */
  revocable(): string[] {
    return [...this.#sessions.keys()].filter((id) => {
      if (!this.#audience.isConnected(id)) return true;
      if (this.#audience.isController(id)) return false;
      return this.#audience.isUpcoming ? !this.#audience.isUpcoming(id) : false;
    });
  }

  /** Frees the player's slot. Returns the session to tear down, if any. */
  release(playerId: string): string | null {
    const session = this.#sessions.get(playerId) || null;
    this.#sessions.delete(playerId);
    return session;
  }
}
