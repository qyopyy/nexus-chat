import type { QueueSnapshot } from '../domain/turn-queue.ts';
import type { Clock } from './ports.ts';

/** How many waiting players every viewer sees by name; the rest only count. */
const QUEUE_TOP = 20;

/** A player's place: 0 = in control, 1..n = waiting, null = not in line. */
type Position = { position: number | null };

const NOT_IN_LINE: Position = Object.freeze({ position: null });

/** The line as every viewer sees it: the controller, the first names, the total. */
type QueueMessage = {
  type: 'queue';
  serverNow: number;
  current: QueueSnapshot['current'];
  waiting: Array<{ name: string }>;
  total: number;
  paused: QueueSnapshot['paused'];
};

/**
 * The shared queue message. The controller's id is included (a page must know it is in control,
 * and ids are not secrets); waiting players are names only.
 */
export function queueMessage(snapshot: QueueSnapshot, now: number, top = QUEUE_TOP): QueueMessage {
  return {
    type: 'queue',
    serverNow: now,
    current: snapshot.current,
    waiting: snapshot.waiting.slice(0, top).map((p) => ({ name: p.name })),
    total: snapshot.waiting.length,
    paused: snapshot.paused,
  };
}

/** Every player's position, in one pass. */
function linePositions(snapshot: QueueSnapshot): Map<string, Position> {
  const positions = new Map<string, Position>();
  if (snapshot.current) positions.set(snapshot.current.id, { position: 0 });
  snapshot.waiting.forEach((p, index) => {
    positions.set(p.id, { position: index + 1 });
  });
  return positions;
}

/**
 * Turns line snapshots into the few bytes each viewer needs: one shared message (serialized once,
 * only when it changed) and per-player position updates only for players whose place changed.
 */
export class QueueFeed {
  readonly #top: number;
  #lastHead = '';
  #lastTotal = -1;
  /** Last position sent to each player in line. */
  readonly #sent = new Map<string, number | null>();

  constructor({ top = QUEUE_TOP }: { top?: number } = {}) {
    this.#top = top;
  }

  /** The serialized message for every viewer, or null when nothing they see changed. */
  shared(snapshot: QueueSnapshot, now: number): string | null {
    const { serverNow: _ignored, total, ...head } = queueMessage(snapshot, 0, this.#top);
    const headKey = JSON.stringify(head);
    if (headKey !== this.#lastHead) {
      this.#lastHead = headKey;
      this.#lastTotal = total;
      return JSON.stringify(queueMessage(snapshot, now, this.#top));
    }
    if (total === this.#lastTotal) return null;
    this.#lastTotal = total;
    return JSON.stringify({ type: 'count', total });
  }

  /** Players whose position changed since it was last sent (NOT_IN_LINE for those who left). */
  positions(snapshot: QueueSnapshot): Array<[string, Position]> {
    const current = linePositions(snapshot);
    const changes: Array<[string, Position]> = [];
    for (const [id, position] of current) {
      if (this.#sent.get(id) === position.position) continue;
      this.#sent.set(id, position.position);
      changes.push([id, position]);
    }
    for (const id of this.#sent.keys()) {
      if (current.has(id)) continue;
      this.#sent.delete(id);
      changes.push([id, NOT_IN_LINE]);
    }
    return changes;
  }

  /** One player's position right now, recorded as sent. */
  positionOf(snapshot: QueueSnapshot, id: string): Position {
    const position = linePositions(snapshot).get(id) ?? NOT_IN_LINE;
    if (position.position === null) this.#sent.delete(id);
    else this.#sent.set(id, position.position);
    return position;
  }
}

type Timer = (fn: () => void, ms: number) => void;

const defaultTimer: Timer = (fn, ms) => {
  if (ms <= 0) queueMicrotask(fn);
  else setTimeout(fn, ms).unref();
};

/**
 * Coalesces requests: runs on the next microtask when the last run was at least `intervalMs` ago,
 * otherwise once at the end of the interval, however many requests came in between.
 */
export class LeadingThrottle {
  readonly #intervalMs: number;
  readonly #run: () => void;
  readonly #now: Clock;
  readonly #setTimer: Timer;
  #pending = false;
  #lastRun = Number.NEGATIVE_INFINITY;

  constructor(options: { intervalMs: number; run: () => void; now?: Clock; setTimer?: Timer }) {
    this.#intervalMs = options.intervalMs;
    this.#run = options.run;
    this.#now = options.now ?? Date.now;
    this.#setTimer = options.setTimer ?? defaultTimer;
  }

  request(): void {
    if (this.#pending) return;
    this.#pending = true;
    const wait = Math.max(0, this.#lastRun + this.#intervalMs - this.#now());
    this.#setTimer(() => {
      this.#pending = false;
      this.#lastRun = this.#now();
      this.#run();
    }, wait);
  }
}
