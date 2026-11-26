import type { ControllerState } from '../domain/controller-state.ts';

/**
 * Anything that can press buttons on a console: the simulator, a patched chiaki-ng
 * (PS5 Remote Play), or a hardware adapter.
 */
export interface ConsoleAdapter {
  /** Sets the full controller state (buttons held, stick positions). */
  apply(state: ControllerState): void;
  /** Lets go of every button and centers the sticks. */
  release(): void;
  /** Asks the console's video encoder for a keyframe, when the adapter can. */
  requestKeyframe?(): void;
}

/** Milliseconds since the epoch. Injected everywhere so tests control time. */
export type Clock = () => number;

/** A line of operational logging (never secrets or personal data). */
export type Logger = (line: string) => void;
