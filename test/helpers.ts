import type { ConsoleAdapter } from '../src/application/ports.ts';
import type { ControllerState } from '../src/domain/controller-state.ts';

/** A controllable clock for deterministic tests. */
export class FakeClock {
  now = 1_000_000;
  readonly read = (): number => this.now;

  advance(ms: number): void {
    this.now += ms;
  }
}

/** Records what reached the console. */
export class RecordingConsole implements ConsoleAdapter {
  applied: ControllerState[] = [];
  releases = 0;
  keyframes = 0;

  apply(state: ControllerState): void {
    this.applied.push(state);
  }

  release(): void {
    this.releases++;
  }

  requestKeyframe(): void {
    this.keyframes++;
  }
}

/** Records every message the lobby sends. */
export class RecordingNotifier {
  readonly toPlayerLog: Array<{ id: string; message: Record<string, unknown> }> = [];
  readonly toAllLog: Array<Record<string, unknown>> = [];

  toPlayer(id: string, message: object | string): void {
    this.toPlayerLog.push({ id, message: typeof message === 'string' ? JSON.parse(message) : message });
  }

  toAll(message: object | string): void {
    this.toAllLog.push(typeof message === 'string' ? JSON.parse(message) : message);
  }

  sentTo(id: string, type: string): Record<string, unknown>[] {
    return this.toPlayerLog.filter((entry) => entry.id === id && entry.message.type === type).map((e) => e.message);
  }
}

/** Lets queued microtasks (throttled broadcasts) run. */
export const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));
