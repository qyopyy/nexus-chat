/** Types for line-view.js, so tests import it type-safely. */
type Queue = {
  current: { name: string; endsAt: number } | null;
  waiting?: ReadonlyArray<unknown>;
  total?: number;
  paused: { remainingMs: number | null } | null;
};

export declare function lineSummary(queue: Queue): string;

export declare function statusText(input: {
  position: number | null;
  controlling: boolean;
  reconnecting: boolean;
  notice: string;
  pausedReasons?: readonly string[];
}): string;

export declare function turnLeftMs(queue: Queue, serverNow: number): number;

export declare function videoEligible(input: {
  restream: boolean;
  controller: boolean;
  position: number | null;
  videoSpectators: number;
}): boolean;

export declare function reconnectDelay(attempt: number, random?: () => number): number;

export declare function formatClock(ms: number): string;
