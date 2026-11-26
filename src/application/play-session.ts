import { type Button, isActive, parseControllerState } from '../domain/controller-state.ts';
import { cleanPlayerName } from '../domain/names.ts';
import type { PauseReason, QueueSnapshot, TurnQueue } from '../domain/turn-queue.ts';
import type { Clock, ConsoleAdapter } from './ports.ts';

/**
 * Buttons that act on the console rather than the game: PS opens the system menu and Create its
 * capture/broadcast menu. A gamepad's Share/View/Back button maps to Create, so it is blocked too.
 */
export const DEFAULT_BLOCKED_BUTTONS: readonly Button[] = ['ps', 'create'];

type PlaySessionOptions = {
  now?: Clock;
  /**
   * Browsers re-send the controller state a few times a second. If nothing arrives for this long
   * (tab hidden, browser frozen) the console is released so no button stays held.
   */
  inputTimeoutMs?: number;
  /** Buttons players never get to press. */
  blockedButtons?: readonly Button[];
  /** A controller who does nothing for this long loses the turn, if someone is waiting. */
  idleTurnMs?: number;
  /** Called with the controller removed for idling, so they can be told why. */
  onIdleRemoved?: (id: string) => void;
  /** Places in line one origin (IP or account) may hold at once. */
  maxPlayersPerOrigin?: number;
};

/** The position joined at (0 = in control), or why the join was refused. */
type JoinResult = number | 'origin-full';

/** A player in a line saved before a restart. */
export type RestoredPlayer = { id: string; name: string; origin?: string };

/**
 * Use cases for one shared console: who is in line, who is in control, and making sure only the
 * controller's input reaches the device. Also releases stuck input and removes idle controllers.
 */
export class PlaySession {
  readonly #queue: TurnQueue;
  readonly #device: ConsoleAdapter;
  readonly #now: Clock;
  readonly #inputTimeoutMs: number;
  readonly #blockedButtons: readonly Button[];
  readonly #idleTurnMs: number;
  readonly #onIdleRemoved: (id: string) => void;
  readonly #maxPlayersPerOrigin: number;
  /** playerId → origin, for the places-per-origin limit. */
  readonly #origins = new Map<string, string>();
  /** The controller the idle clock belongs to, and when they last did something. */
  #trackedController: string | null = null;
  #lastActiveAt = 0;
  #lastInputAt = 0;
  #holdingInput = false;

  constructor(queue: TurnQueue, device: ConsoleAdapter, options: PlaySessionOptions = {}) {
    this.#queue = queue;
    this.#device = device;
    this.#now = options.now ?? Date.now;
    this.#inputTimeoutMs = options.inputTimeoutMs ?? 750;
    this.#blockedButtons = options.blockedButtons ?? DEFAULT_BLOCKED_BUTTONS;
    this.#idleTurnMs = options.idleTurnMs ?? 60_000;
    this.#onIdleRemoved = options.onIdleRemoved ?? (() => {});
    this.#maxPlayersPerOrigin = options.maxPlayersPerOrigin ?? 1;
  }

  /** Joins the line (or keeps the current place). `origin` enforces the places-per-origin limit. */
  join(id: string, name: string, origin?: string): JoinResult {
    if (origin !== undefined && this.#queue.positionOf(id) === -1) {
      const sameOrigin = this.#queue.ids().filter((other) => this.#origins.get(other) === origin).length;
      if (sameOrigin >= this.#maxPlayersPerOrigin) return 'origin-full';
    }
    if (origin !== undefined) this.#origins.set(id, origin);
    const position = this.#queue.join({ id, name: cleanPlayerName(name) });
    this.#trackController();
    return position;
  }

  /** Replaces the line with one saved before a restart; the idle clock starts fresh. */
  restore(current: (RestoredPlayer & { remainingMs: number }) | null, waiting: readonly RestoredPlayer[]): void {
    this.#origins.clear();
    for (const player of [...(current ? [current] : []), ...waiting]) {
      if (player.origin !== undefined) this.#origins.set(player.id, player.origin);
    }
    const toPlayer = ({ id, name }: RestoredPlayer) => ({ id, name: cleanPlayerName(name) });
    this.#releaseIfControllerChanges(() =>
      this.#queue.restore(
        current && { player: toPlayer(current), remainingMs: current.remainingMs },
        waiting.map(toPlayer),
      ),
    );
    this.restartIdleClock();
  }

  /** The origin a player joined with, if known. */
  originOf(id: string): string | undefined {
    return this.#origins.get(id);
  }

  /** Gives the controller a fresh idle clock (e.g. back after a server restart). */
  restartIdleClock(): void {
    this.#trackedController = this.#queue.controllerId();
    this.#lastActiveAt = this.#idleClockNow();
  }

  /** Admin: removes a player from the line (or from control). Returns false if unknown. */
  kick(id: string): boolean {
    if (this.#queue.positionOf(id) === -1) return false;
    this.leave(id);
    return true;
  }

  /** Admin: ends the current turn now. Returns false if nobody is playing. */
  skipTurn(): boolean {
    const controller = this.#queue.controllerId();
    if (!controller) return false;
    this.leave(controller);
    return true;
  }

  leave(id: string): void {
    this.#origins.delete(id);
    this.#releaseIfControllerChanges(() => this.#queue.leave(id));
  }

  /** Forwards the controller's input to the console. Returns true when it did. */
  input(id: string, raw: unknown): boolean {
    if (!this.#queue.isController(id)) return false;
    const state = parseControllerState(raw);
    if (!state) return false;
    for (const button of this.#blockedButtons) state.buttons[button] = false;
    if (isActive(state)) this.#lastActiveAt = this.#idleClockNow();
    this.#device.apply(state);
    this.#lastInputAt = this.#now();
    this.#holdingInput = true;
    return true;
  }

  /** Releases the console when the controller's input went silent. Returns true if it did. */
  releaseIfInputStale(): boolean {
    if (!this.#holdingInput || this.#now() - this.#lastInputAt < this.#inputTimeoutMs) return false;
    this.#release();
    return true;
  }

  /** Freezes the turn and idle clocks. Joining and leaving still work. */
  pause(reason: PauseReason): boolean {
    return this.#queue.pause(reason);
  }

  /** Lifts one pause reason; the clocks run again when none is left. */
  resume(reason: PauseReason): boolean {
    const pausedAt = this.#queue.pausedAt();
    if (!this.#queue.resume(reason)) return false;
    // Idle time spent paused does not count, same as turn time.
    if (pausedAt !== null && this.#queue.pausedAt() === null) this.#lastActiveAt += this.#now() - pausedAt;
    return true;
  }

  /** Advances turns and removes an idle controller. Returns true if the line changed. */
  tick(): boolean {
    if (this.#queue.pausedAt() !== null) return false;
    let changed = false;
    this.#releaseIfControllerChanges(() => {
      changed = this.#queue.tick();
    });
    const controller = this.#queue.controllerId();
    const kickAt = this.idleKickAt();
    if (controller && kickAt !== null && this.#now() >= kickAt) {
      this.leave(controller);
      this.#onIdleRemoved(controller);
      changed = true;
    }
    return changed;
  }

  /**
   * When (epoch ms) the controller loses the turn for doing nothing, if they keep doing nothing.
   * Null when it cannot happen: nobody playing, nobody waiting, or paused.
   */
  idleKickAt(): number | null {
    if (this.#queue.pausedAt() !== null) return null;
    if (!this.#queue.controllerId() || this.#queue.snapshot().waiting.length === 0) return null;
    return this.#lastActiveAt + this.#idleTurnMs;
  }

  isController(id: string): boolean {
    return this.#queue.isController(id);
  }

  controllerId(): string | null {
    return this.#queue.controllerId();
  }

  positionOf(id: string): number {
    return this.#queue.positionOf(id);
  }

  snapshot(): QueueSnapshot {
    return this.#queue.snapshot();
  }

  #releaseIfControllerChanges(action: () => void): void {
    const before = this.#queue.controllerId();
    action();
    if (before !== null && before !== this.#queue.controllerId()) this.#release();
    this.#trackController();
  }

  /** Restarts the idle clock whenever a new player takes control. */
  #trackController(): void {
    const controller = this.#queue.controllerId();
    if (controller === this.#trackedController) return;
    this.#trackedController = controller;
    this.#lastActiveAt = this.#idleClockNow();
  }

  /** "Now" for the idle clock: frozen at the pause start while paused. */
  #idleClockNow(): number {
    return this.#queue.pausedAt() ?? this.#now();
  }

  #release(): void {
    this.#holdingInput = false;
    this.#device.release();
  }
}
