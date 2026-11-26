import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Logger } from '../../application/ports.ts';

/** The few fs calls used here, injectable for tests. */
type StateFs = {
  writeFileSync(path: string, data: string, options: { mode: number }): void;
  renameSync(from: string, to: string): void;
  readFileSync(path: string, encoding: 'utf8'): string;
  mkdirSync(path: string, options: { recursive: true; mode: number }): unknown;
};

const realFs: StateFs = { writeFileSync, renameSync, readFileSync, mkdirSync };

/**
 * Writes JSON atomically: to `path.tmp` (owner-only, mode 600) first, then renamed over `path`, so
 * a crash mid-write never leaves a half-written file. Synchronous on purpose: the file is small
 * and it must also work in a signal handler right before exit.
 */
export function writeJsonFileAtomic(path: string, value: unknown, fs: StateFs = realFs): void {
  fs.mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value), { mode: 0o600 });
  fs.renameSync(tmp, path);
}

/** Reads a JSON file: undefined when missing; an unreadable or corrupt file is logged and undefined. */
export function readJsonFile(
  path: string,
  { fs = realFs, log = console.warn }: { fs?: StateFs; log?: Logger } = {},
): unknown {
  let text: string;
  try {
    text = fs.readFileSync(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') log(`Could not read ${path}: ${(error as Error).message}`);
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    log(`Ignoring corrupt ${path}: ${(error as Error).message}`);
    return undefined;
  }
}

/**
 * Coalesces saves: `schedule()` writes at most once per interval; `flush()` writes now (shutdown).
 * A failing save is logged, never thrown: losing the saved line must not take the live one down.
 */
export class SaveScheduler {
  readonly #save: () => void;
  readonly #intervalMs: number;
  readonly #log: Logger;
  #timer: ReturnType<typeof setTimeout> | null = null;

  constructor({ save, intervalMs, log = console.warn }: { save: () => void; intervalMs: number; log?: Logger }) {
    this.#save = save;
    this.#intervalMs = intervalMs;
    this.#log = log;
  }

  schedule(): void {
    if (this.#timer) return;
    this.#timer = setTimeout(() => this.flush(), this.#intervalMs);
    this.#timer.unref?.();
  }

  flush(): void {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
    try {
      this.#save();
    } catch (error) {
      this.#log(`Could not save state: ${(error as Error).message}`);
    }
  }
}
