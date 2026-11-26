import { displayName } from '../domain/names.ts';
import type { QueueSnapshot } from '../domain/turn-queue.ts';

/** What the broadcast overlay shows (`/overlay.json`). Names only: player ids never leave. */
export type OverlayState = {
  playing: string | null;
  remainingMs: number | null;
  paused: boolean;
  next: string | null;
  /** The player who joined most recently. */
  last: string | null;
  waiting: number;
  turnMs: number;
};

export type OverlayEvent = { kind: 'turn' | 'joined'; name: string };

/** The line part of the overlay state. */
export function overlayLine(
  snapshot: QueueSnapshot,
  now: number,
): Pick<OverlayState, 'playing' | 'remainingMs' | 'paused' | 'next' | 'last' | 'waiting'> {
  const { current, waiting, paused } = snapshot;
  const last = waiting.at(-1);
  return {
    playing: current ? displayName(current.name) : null,
    remainingMs: current ? Math.max(0, paused?.remainingMs ?? current.endsAt - now) : null,
    paused: paused !== null,
    next: waiting[0] ? displayName(waiting[0].name) : null,
    last: last ? displayName(last.name) : null,
    waiting: waiting.length,
  };
}

/** Short announcements for the overlay when the line changes between two states. */
export function overlayEvents(before: OverlayState | null, after: OverlayState): OverlayEvent[] {
  if (!before) return [];
  const events: OverlayEvent[] = [];
  if (after.playing && after.playing !== before.playing) events.push({ kind: 'turn', name: after.playing });
  // Someone joined when the line got longer than it would be after just passing the turn on.
  const turnPassed = after.playing !== before.playing && before.waiting > 0;
  const expected = turnPassed ? before.waiting - 1 : before.waiting;
  if (after.waiting > expected && after.last) events.push({ kind: 'joined', name: after.last });
  return events;
}

/** A link as people would type it: "https://www.example.com/play/" → "example.com/play". */
export function shortUrl(url: string): string {
  const parsed = URL.parse(url);
  if (!parsed) return '';
  return `${parsed.host.replace(/^www\./, '')}${parsed.pathname}${parsed.search}`.replace(/\/$/, '');
}
