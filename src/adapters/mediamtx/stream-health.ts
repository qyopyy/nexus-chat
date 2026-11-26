type StreamHealthOptions = {
  /** Media server control API, e.g. http://127.0.0.1:9997 */
  apiUrl: string;
  /** HTTP Basic authorization header for the API, if it needs one. */
  authorization?: string | undefined;
  /** The path the console video is published to. */
  path: string;
  /** Called on every up/down change. */
  onChange: (up: boolean) => void;
  timeoutMs?: number;
  /** Consecutive failed polls before the stream counts as down. */
  failuresBeforeDown?: number;
};

/**
 * Watches whether the console video is being published. Starts "up"; goes down after a few
 * consecutive bad polls (one slow answer must not pause the game) and back up on the first good one.
 */
export class StreamHealth {
  readonly #url: string;
  readonly #headers: Record<string, string>;
  readonly #onChange: (up: boolean) => void;
  readonly #timeoutMs: number;
  readonly #failuresBeforeDown: number;
  #up = true;
  #failures = 0;
  #inFlight: Promise<void> | null = null;
  #timer: ReturnType<typeof setInterval> | null = null;

  constructor({
    apiUrl,
    authorization,
    path,
    onChange,
    timeoutMs = 1500,
    failuresBeforeDown = 2,
  }: StreamHealthOptions) {
    this.#url = `${apiUrl.replace(/\/+$/, '')}/v3/paths/get/${encodeURIComponent(path)}`;
    this.#headers = authorization ? { authorization } : {};
    this.#onChange = onChange;
    this.#timeoutMs = timeoutMs;
    this.#failuresBeforeDown = failuresBeforeDown;
  }

  start(intervalMs = 2000): void {
    this.stop();
    this.#timer = setInterval(() => void this.poll(), intervalMs);
    this.#timer.unref();
  }

  stop(): void {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
  }

  /** Checks once. Overlapping calls share the poll in flight. */
  poll(): Promise<void> {
    this.#inFlight ??= this.#check().finally(() => {
      this.#inFlight = null;
    });
    return this.#inFlight;
  }

  async #check(): Promise<void> {
    if (await this.#isReady()) {
      this.#failures = 0;
      this.#set(true);
    } else if (++this.#failures >= this.#failuresBeforeDown) {
      this.#set(false);
    }
  }

  async #isReady(): Promise<boolean> {
    try {
      const response = await fetch(this.#url, { headers: this.#headers, signal: AbortSignal.timeout(this.#timeoutMs) });
      if (!response.ok) {
        await response.body?.cancel();
        return false;
      }
      return ((await response.json()) as { ready?: unknown })?.ready === true;
    } catch {
      return false;
    }
  }

  #set(up: boolean): void {
    if (up === this.#up) return;
    this.#up = up;
    this.#onChange(up);
  }
}
