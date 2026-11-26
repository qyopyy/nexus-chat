/**
 * Command-line client for the local admin API (`/api/admin/*`).
 *
 *   bun run admin status            the line and connected players
 *   bun run admin --json status     the raw JSON instead
 *
 * Reads ADMIN_TOKEN and, optionally, ADMIN_URL (default http://127.0.0.1:$PORT) from the
 * environment; Bun also loads `.env`. The token is never taken from the command line, where other
 * local accounts could read it with `ps`.
 */

const USAGE = `Usage: bun run admin [--json] <command>

Commands:
  status            Show the line and connected players
  skip              End the current turn (alias: next)
  pause             Freeze the turn clock
  resume            Restart the turn clock
  kick <player-id>  Remove a player from the line

Environment: ADMIN_TOKEN (required), ADMIN_URL (default http://127.0.0.1:$PORT, PORT defaults to 3000).`;

export type Command =
  | { name: 'status' }
  | { name: 'skip' }
  | { name: 'pause' }
  | { name: 'resume' }
  | { name: 'kick'; id: string }
  | { name: 'help' };

type Parsed = { ok: true; command: Command; json: boolean } | { ok: false; error: string };

/** Parses argv (without `bun` and the script path). */
export function parseArgs(argv: readonly string[]): Parsed {
  const json = argv.includes('--json');
  const args = argv.filter((a) => a !== '--json');
  const unknownFlag = args.find((a) => a.startsWith('-') && !['-h', '--help'].includes(a));
  if (unknownFlag) return { ok: false, error: `Unknown option: ${unknownFlag}` };
  const ok = (command: Command): Parsed => ({ ok: true, command, json });
  const extra = (count: number): Parsed | null =>
    args.length > count ? { ok: false, error: `Unexpected argument: ${args[count]}` } : null;
  const [name, ...rest] = args;
  switch (name) {
    case undefined:
    case 'help':
    case '-h':
    case '--help':
      return ok({ name: 'help' });
    case 'status':
    case 'pause':
    case 'resume':
      return extra(1) ?? ok({ name });
    case 'skip':
    case 'next':
      return extra(1) ?? ok({ name: 'skip' });
    case 'kick':
      if (!rest[0]) return { ok: false, error: 'kick needs a player id (see `status`)' };
      return extra(2) ?? ok({ name: 'kick', id: rest[0] });
    default:
      return { ok: false, error: `Unknown command: ${name}` };
  }
}

/** The API answers only on this machine; refuse to send the token anywhere else. */
export function resolveBaseUrl(env: Record<string, string | undefined>): string {
  const raw = env.ADMIN_URL?.trim() || `http://127.0.0.1:${env.PORT?.trim() || '3000'}`;
  const url = URL.parse(raw);
  if (!url || url.protocol !== 'http:') throw new Error(`ADMIN_URL must be an http:// URL (got "${raw}")`);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
    throw new Error(`ADMIN_URL must point at this machine (localhost, 127.0.0.1 or [::1]), got "${url.hostname}"`);
  }
  return url.origin;
}

type ApiResult = { status: number; body: unknown };

/** A thin client: one method per route, results returned as status plus parsed body. */
export class AdminClient {
  readonly #base: string;
  readonly #token: string;
  readonly #fetch: typeof fetch;

  constructor({ baseUrl, token, fetchImpl = fetch }: { baseUrl: string; token: string; fetchImpl?: typeof fetch }) {
    this.#base = baseUrl;
    this.#token = token;
    this.#fetch = fetchImpl;
  }

  /** Runs a parsed command against the API. */
  run(command: Exclude<Command, { name: 'help' }>): Promise<ApiResult> {
    switch (command.name) {
      case 'status':
        return this.#call('GET', 'state');
      case 'skip':
      case 'pause':
      case 'resume':
        return this.#call('POST', command.name);
      case 'kick':
        return this.#call('POST', 'kick', { id: command.id });
    }
    throw new Error('unknown command');
  }

  async #call(method: string, route: string, body?: object): Promise<ApiResult> {
    const response = await this.#fetch(`${this.#base}/api/admin/${route}`, {
      method,
      headers: {
        authorization: `Bearer ${this.#token}`,
        ...(body && { 'content-type': 'application/json' }),
      },
      ...(body && { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    return { status: response.status, body: parsed };
  }
}

const ERRORS: Record<number, string> = {
  400: 'The server rejected the request.',
  401: 'Unauthorized: ADMIN_TOKEN does not match the server.',
  404: 'Not found: the player is not in line, or the admin API is disabled.',
  413: 'Request too large.',
};

/** One readable line (or block) for a result. */
export function describeResult(command: Command, result: ApiResult, now: number): string {
  if (command.name === 'skip' && result.status === 409) return 'Nobody is playing: nothing to skip.';
  if (result.status >= 400) return ERRORS[result.status] ?? `Request failed with HTTP ${result.status}.`;
  switch (command.name) {
    case 'status':
      return formatStatus(result.body as AdminState, now);
    case 'skip':
      return 'Turn ended.';
    case 'pause':
      return 'Turn clock paused.';
    case 'resume':
      return 'Turn clock resumed.';
    case 'kick':
      return `Removed ${command.id}.`;
    default:
      return USAGE;
  }
}

type AdminState = {
  current: { id: string; name: string; endsAt: number } | null;
  waiting: Array<{ id: string; name: string }>;
  paused: { reasons: string[]; remainingMs: number | null } | null;
  connected?: number;
  serverNow?: number;
};

const clock = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

/** The state as a short plain-text report. */
export function formatStatus(state: AdminState, now: number): string {
  const serverNow = state.serverNow ?? now;
  const lines: string[] = [];
  if (state.current) {
    const left = state.paused ? (state.paused.remainingMs ?? 0) : state.current.endsAt - serverNow;
    lines.push(`Playing: ${state.current.name} (${state.current.id}), ${clock(left)} left`);
  } else lines.push('Playing: nobody');
  if (state.paused) lines.push(`Paused: ${state.paused.reasons.join(', ')}`);
  lines.push(`Waiting: ${state.waiting.length}`);
  state.waiting.forEach((p, i) => {
    lines.push(`  ${i + 1}. ${p.name} (${p.id})`);
  });
  if (state.connected !== undefined) lines.push(`Connected: ${state.connected}`);
  return lines.join('\n');
}

/** Runs the CLI; returns the exit code. */
export async function main(
  argv: readonly string[],
  env: Record<string, string | undefined>,
  out: (text: string) => void = console.log,
  fetchImpl: typeof fetch = fetch,
): Promise<number> {
  const now = Date.now();
  const parsed = parseArgs(argv);
  if (!parsed.ok) {
    out(`${parsed.error}\n\n${USAGE}`);
    return 2;
  }
  const { command, json } = parsed;
  if (command.name === 'help') {
    out(USAGE);
    return 0;
  }
  const token = env.ADMIN_TOKEN?.trim();
  if (!token) {
    out('ADMIN_TOKEN is not set (put it in the environment or .env).');
    return 2;
  }
  let result: ApiResult;
  try {
    const client = new AdminClient({ baseUrl: resolveBaseUrl(env), token, fetchImpl });
    result = await client.run(command);
  } catch (error) {
    out(`Could not reach the server: ${(error as Error).message}`);
    return 1;
  }
  out(
    json ? JSON.stringify({ status: result.status, body: result.body }, null, 2) : describeResult(command, result, now),
  );
  return result.status < 400 ? 0 : 1;
}

if (import.meta.main) process.exitCode = await main(process.argv.slice(2), process.env);
