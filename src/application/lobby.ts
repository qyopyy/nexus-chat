import type { PauseReason } from '../domain/turn-queue.ts';
import type { KeyframeRequests } from './keyframe-requests.ts';
import type { Account } from './login-sessions.ts';
import { type OverlayState, overlayLine } from './overlay-state.ts';
import type { PlaySession } from './play-session.ts';
import type { Clock } from './ports.ts';
import type { Presence } from './presence.ts';
import { LeadingThrottle, QueueFeed, queueMessage } from './queue-feed.ts';

/** Delivers server messages. Strings are already-serialized JSON (sent as is). */
export interface Notifier {
  toPlayer(playerId: string, message: object | string): void;
  toAll(message: object | string): void;
}

/** Why a join was refused. */
type JoinRejection = 'line-full' | 'login-required' | 'origin-full' | 'account-in-line';

type LobbyOptions = {
  session: PlaySession;
  presence: Presence;
  notifier: Notifier;
  keyframes: KeyframeRequests;
  /** Longest the waiting line may get; 0 = unlimited. */
  maxLine: number;
  /** Joining needs a logged-in account (its name is the name in line). */
  loginRequired: boolean;
  turnMs: number;
  /** The controller sees an idle countdown this long before losing the turn. */
  idleWarningMs?: number;
  /** Something worth saving changed (the line). */
  onPersist?: () => void;
  now?: Clock;
  /** Coalesces queue broadcasts; injectable for tests. */
  broadcastIntervalMs?: number;
};

/**
 * The live line as players experience it: joining and leaving, input and idle warnings.
 * Transport-agnostic: it talks to players only through the {@link Notifier} port, so the
 * WebSocket gateway stays a thin adapter and this stays testable.
 */
export class Lobby {
  readonly #o: Required<LobbyOptions>;
  readonly #feed = new QueueFeed();
  readonly #throttle: LeadingThrottle;
  /** Restored players whose browser has not reconnected yet. */
  readonly #awaitingReturn = new Set<string>();
  #lastLineKey = '';
  #idleWarning: { playerId: string; kickAt: number } | null = null;

  constructor(options: LobbyOptions) {
    this.#o = {
      idleWarningMs: 10_000,
      onPersist: () => {},
      now: Date.now,
      broadcastIntervalMs: 1000,
      ...options,
    };
    this.#throttle = new LeadingThrottle({
      intervalMs: this.#o.broadcastIntervalMs,
      run: () => this.#broadcastLine(),
      now: this.#o.now,
    });
  }

  /** Marks players restored from a saved line; they get a fresh idle clock when they return. */
  expectReturning(playerIds: Iterable<string>): void {
    for (const id of playerIds) this.#awaitingReturn.add(id);
  }

  /** Sends a newly connected player everything they need to render the page. */
  welcome(playerId: string, resumed: boolean): void {
    const { notifier, session } = this.#o;
    if (resumed && this.#awaitingReturn.delete(playerId) && session.isController(playerId)) {
      session.restartIdleClock();
    }
    notifier.toPlayer(playerId, queueMessage(session.snapshot(), this.#o.now()));
    this.#sendPosition(playerId);
  }

  /** The connection dropped; the place in line is kept until presence expires. */
  disconnected(playerId: string): void {
    this.#o.presence.disconnect(playerId);
  }

  /** Presence gave up on a player: they leave the line. */
  expired(playerId: string): void {
    this.#awaitingReturn.delete(playerId);
    this.#o.session.leave(playerId);
    this.lineChanged();
  }

  /**
   * Joins the line. With login required the account is mandatory, its name is the name in line
   * and it (not the IP) is the one-place-per-person key.
   */
  join(playerId: string, request: { name: string; account: Account | null; origin: string }): JoinRejection | null {
    const { session, maxLine, loginRequired } = this.#o;
    const inLine = session.positionOf(playerId) !== -1;
    if (!inLine && maxLine > 0 && session.snapshot().waiting.length >= maxLine) return 'line-full';
    if (loginRequired && !request.account) return 'login-required';
    const { account } = request;
    const result = session.join(playerId, account ? account.name : request.name, account ? account.id : request.origin);
    if (result === 'origin-full') return account ? 'account-in-line' : 'origin-full';
    this.#sendPosition(playerId);
    this.lineChanged();
    return null;
  }

  leave(playerId: string): void {
    this.#o.session.leave(playerId);
    this.#sendPosition(playerId);
    this.lineChanged();
  }

  input(playerId: string, state: unknown): void {
    this.#o.session.input(playerId, state);
  }

  /** The controller's picture froze: ask the console for a keyframe. Spectators cannot. */
  videoStalled(playerId: string): void {
    if (this.#o.session.isController(playerId)) this.#o.keyframes.request();
  }

  /** A new direct-video viewer needs a keyframe to start. */
  videoSessionStarted(): void {
    this.#o.keyframes.request();
  }

  /** Once a second: presence and turn rotation. */
  tick(): void {
    this.#o.presence.tick();
    if (this.#o.session.tick()) this.lineChanged();
  }

  /** A few times a second: release stuck input and keep the idle warning current. */
  fastTick(): void {
    this.#o.session.releaseIfInputStale();
    this.#updateIdleWarning();
  }

  /** The player in control lost the turn for idling. */
  idleRemoved(playerId: string): void {
    this.#o.notifier.toPlayer(playerId, { type: 'kicked', reason: 'idle' });
  }

  /** The video stream went down or came back: turns freeze while players cannot see. */
  streamHealth(up: boolean): void {
    if (up) this.#o.session.resume('stream');
    else this.#o.session.pause('stream');
    this.lineChanged();
  }

  // ---------- admin actions ----------

  kick(playerId: string): boolean {
    if (!this.#o.session.kick(playerId)) return false;
    this.#o.notifier.toPlayer(playerId, { type: 'kicked' });
    this.lineChanged();
    return true;
  }

  skipTurn(): boolean {
    const skipped = this.#o.session.skipTurn();
    if (skipped) this.lineChanged();
    return skipped;
  }

  setPaused(reason: PauseReason, paused: boolean): void {
    if (paused) this.#o.session.pause(reason);
    else this.#o.session.resume(reason);
    this.lineChanged();
  }

  // ---------- read models ----------

  /** What the broadcast overlay draws. */
  overlay(): OverlayState {
    return { ...overlayLine(this.#o.session.snapshot(), this.#o.now()), turnMs: this.#o.turnMs };
  }

  // ---------- change notifications ----------

  /** The line changed: broadcast it (coalesced) and save it. */
  lineChanged(): void {
    this.#throttle.request();
  }

  #broadcastLine(): void {
    const { session, notifier } = this.#o;
    const snapshot = session.snapshot();
    const lineKey = JSON.stringify(snapshot);
    if (lineKey !== this.#lastLineKey) {
      this.#lastLineKey = lineKey;
      this.#o.onPersist();
    }
    const shared = this.#feed.shared(snapshot, this.#o.now());
    if (shared) notifier.toAll(shared);
    for (const [id, position] of this.#feed.positions(snapshot))
      notifier.toPlayer(id, { type: 'position', ...position });
  }

  #sendPosition(playerId: string): void {
    const position = this.#feed.positionOf(this.#o.session.snapshot(), playerId);
    this.#o.notifier.toPlayer(playerId, { type: 'position', ...position });
  }

  /**
   * Only the controller gets the idle warning, only in its last seconds, and only when it appears,
   * moves or clears: a player who keeps playing gets no messages.
   */
  #updateIdleWarning(): void {
    const now = this.#o.now();
    const kickAt = this.#o.session.idleKickAt();
    const controller = this.#o.session.controllerId();
    const next =
      kickAt !== null && controller && kickAt - now <= this.#o.idleWarningMs ? { playerId: controller, kickAt } : null;
    const previous = this.#idleWarning;
    if (previous && previous.playerId !== next?.playerId) {
      this.#o.notifier.toPlayer(previous.playerId, { type: 'idle', kickAt: null, serverNow: now });
    }
    if (next && (previous?.playerId !== next.playerId || previous.kickAt !== next.kickAt)) {
      this.#o.notifier.toPlayer(next.playerId, { type: 'idle', kickAt: next.kickAt, serverNow: now });
    }
    this.#idleWarning = next;
  }
}
