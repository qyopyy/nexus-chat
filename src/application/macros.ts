import { type Button, type ControllerState, NEUTRAL_STATE, BUTTONS, isButton } from '../domain/controller-state.ts';
import type { ConsoleAdapter } from './ports.ts';

/** One beat of a macro: these buttons held for `ms`, then released (empty = a pause). */
export type MacroStep = { buttons: Button[]; ms: number };

export const MACRO_MAX_STEPS = 160;
export const MACRO_MIN_MS = 30;
export const MACRO_MAX_MS = 2000;
/** Console-level buttons a macro may never press, whoever runs it. */
const NEVER: readonly Button[] = ['ps', 'create'];

/**
 * Turns untrusted JSON into macro steps, or null when anything is off. Used by the admin API for
 * things like in-game cheat codes, which are just a fixed sequence of button presses.
 */
export function parseMacro(raw: unknown): MacroStep[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MACRO_MAX_STEPS) return null;
  const steps: MacroStep[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) return null;
    const { buttons, ms } = item as { buttons?: unknown; ms?: unknown };
    if (!Array.isArray(buttons) || buttons.length > BUTTONS.length) return null;
    if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < MACRO_MIN_MS || ms > MACRO_MAX_MS) return null;
    const names: Button[] = [];
    for (const name of buttons) {
      if (typeof name !== 'string' || !isButton(name) || NEVER.includes(name)) return null;
      if (!names.includes(name)) names.push(name);
    }
    steps.push({ buttons: names, ms: Math.round(ms) });
  }
  return steps;
}

function stateFor(buttons: Button[]): ControllerState {
  const pressed = Object.fromEntries(BUTTONS.map((b) => [b, buttons.includes(b)])) as Record<Button, boolean>;
  return {
    buttons: pressed,
    sticks: { lx: 0, ly: 0, rx: 0, ry: 0 },
    triggers: { l2: pressed.l2 ? 1 : 0, r2: pressed.r2 ? 1 : 0 },
  };
}

type Sleep = (ms: number) => Promise<void>;

/**
 * Plays macros on the console. While one runs, the player's own input is ignored (see
 * {@link GatedConsole}) so the sequence is not disturbed.
 */
export class MacroRunner {
  readonly #device: ConsoleAdapter;
  readonly #sleep: Sleep;
  #running = false;

  constructor(device: ConsoleAdapter, sleep: Sleep = (ms) => new Promise((r) => setTimeout(r, ms))) {
    this.#device = device;
    this.#sleep = sleep;
  }

  get running(): boolean {
    return this.#running;
  }

  /** Starts the macro and resolves when it finished; resolves false straight away if one is running. */
  async run(steps: MacroStep[]): Promise<boolean> {
    if (this.#running) return false;
    this.#running = true;
    try {
      this.#device.release();
      for (const step of steps) {
        this.#device.apply(stateFor(step.buttons));
        await this.#sleep(step.ms);
      }
    } finally {
      this.#device.release();
      this.#running = false;
    }
    return true;
  }
}

/** The console as players see it: input is dropped while a macro is playing. */
export class GatedConsole implements ConsoleAdapter {
  readonly #inner: ConsoleAdapter;
  readonly #runner: MacroRunner;

  constructor(inner: ConsoleAdapter, runner: MacroRunner) {
    this.#inner = inner;
    this.#runner = runner;
  }

  apply(state: ControllerState): void {
    if (!this.#runner.running) this.#inner.apply(state);
  }

  release(): void {
    if (!this.#runner.running) this.#inner.release();
  }

  requestKeyframe(): void {
    this.#inner.requestKeyframe?.();
  }
}

export { NEUTRAL_STATE };
