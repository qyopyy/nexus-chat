import type { ConsoleAdapter } from '../../application/ports.ts';
import { BUTTONS, type ControllerState, NEUTRAL_STATE } from '../../domain/controller-state.ts';

/** One frame of the simulator, sent to browsers to draw. */
type SimulatedFrame = {
  x: number;
  y: number;
  heading: number;
  pressed: string[];
  sticks: ControllerState['sticks'];
  triggers: ControllerState['triggers'];
};

const WORLD_SIZE = 1000;
const SPEED_PER_SECOND = 300;
const DEADZONE = 0.12;

/**
 * A stand-in console: a dot on a map driven by the left stick (R2 pressure boosts it). Lets the
 * whole flow be developed and tested without any hardware.
 */
export class SimulatedConsole implements ConsoleAdapter {
  #state: ControllerState = NEUTRAL_STATE;
  #x = WORLD_SIZE / 2;
  #y = WORLD_SIZE / 2;
  #heading = 0;

  apply(state: ControllerState): void {
    this.#state = state;
  }

  release(): void {
    this.#state = NEUTRAL_STATE;
  }

  /** Moves the dot by `elapsedMs` of simulated time. */
  step(elapsedMs: number): void {
    const { lx, ly } = this.#state.sticks;
    if (Math.hypot(lx, ly) < DEADZONE) return;
    const speed = SPEED_PER_SECOND * (1 + this.#state.triggers.r2) * (elapsedMs / 1000);
    this.#x = wrap(this.#x + lx * speed);
    this.#y = wrap(this.#y + ly * speed);
    this.#heading = Math.atan2(ly, lx);
  }

  frame(): SimulatedFrame {
    return {
      x: this.#x / WORLD_SIZE,
      y: this.#y / WORLD_SIZE,
      heading: this.#heading,
      pressed: BUTTONS.filter((b) => this.#state.buttons[b]),
      sticks: this.#state.sticks,
      triggers: this.#state.triggers,
    };
  }
}

function wrap(value: number): number {
  return ((value % WORLD_SIZE) + WORLD_SIZE) % WORLD_SIZE;
}
