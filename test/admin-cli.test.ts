import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { AdminClient, describeResult, formatStatus, main, parseArgs, resolveBaseUrl } from '../scripts/admin.ts';
import { AdminApi, type AdminBackend } from '../src/adapters/http/admin-api.ts';
import { AuthApi } from '../src/adapters/http/auth-api.ts';
import { createHttpServer } from '../src/adapters/http/http-server.ts';
import { LoginSessions } from '../src/application/login-sessions.ts';
import { RateLimiter } from '../src/application/rate-limiter.ts';

const NOW = Date.parse('2026-01-01T00:00:00Z');

describe('admin CLI arguments', () => {
  it('parses the simple commands and the --json flag anywhere', () => {
    expect(parseArgs(['status'])).toStrictEqual({ ok: true, json: false, command: { name: 'status' } });
    expect(parseArgs(['--json', 'pause'])).toStrictEqual({ ok: true, json: true, command: { name: 'pause' } });
    expect(parseArgs(['resume', '--json'])).toStrictEqual({ ok: true, json: true, command: { name: 'resume' } });
    expect(parseArgs(['next'])).toStrictEqual({ ok: true, json: false, command: { name: 'skip' } });
    expect(parseArgs([])).toStrictEqual({ ok: true, json: false, command: { name: 'help' } });
  });

  it('parses kick', () => {
    expect(parseArgs(['kick', 'p1'])).toMatchObject({ ok: true, command: { name: 'kick', id: 'p1' } });
  });

  it('rejects bad input with a message', () => {
    for (const argv of [
      ['frobnicate'],
      ['kick'],
      ['status', 'extra'],
      ['kick', 'p1', 'extra'],
      ['--verbose', 'status'],
    ]) {
      const parsed = parseArgs(argv);
      expect(parsed.ok, argv.join(' ')).toBe(false);
    }
  });

  it('only talks to this machine', () => {
    expect(resolveBaseUrl({})).toBe('http://127.0.0.1:3000');
    expect(resolveBaseUrl({ PORT: '4000' })).toBe('http://127.0.0.1:4000');
    expect(resolveBaseUrl({ ADMIN_URL: 'http://localhost:5000/' })).toBe('http://localhost:5000');
    expect(() => resolveBaseUrl({ ADMIN_URL: 'http://play.example.com' })).toThrow();
    expect(() => resolveBaseUrl({ ADMIN_URL: 'https://localhost' })).toThrow();
  });

  it('formats the state as text', () => {
    const text = formatStatus(
      {
        current: { id: 'p1', name: 'Ana', endsAt: NOW + 90_000 },
        waiting: [{ id: 'p2', name: 'Bo' }],
        paused: null,
        connected: 2,
        serverNow: NOW,
      },
      NOW,
    );
    expect(text).toContain('Playing: Ana (p1), 1:30 left');
    expect(text).toContain('1. Bo (p2)');
    expect(text).toContain('Connected: 2');
    expect(describeResult({ name: 'skip' }, { status: 409, body: null }, NOW)).toMatch(/Nobody is playing/);
  });
});

const TOKEN = 'cli-test-token-1234567890';

describe('admin CLI against a local server', () => {
  let server: Server;
  let base = '';
  const calls: string[] = [];
  let current: { id: string; name: string; endsAt: number } | null = { id: 'p1', name: 'Ana', endsAt: NOW + 60_000 };

  const backend: AdminBackend = {
    state: () => ({ current, waiting: [{ id: 'p2', name: 'Bo' }], paused: null, serverNow: NOW }),
    kick: (id) => {
      calls.push(`kick ${id}`);
      return id === 'p2';
    },
    skipTurn: () => {
      calls.push('skip');
      const had = current !== null;
      current = null;
      return had;
    },
    setPaused: (reason, paused) => calls.push(`${paused ? 'pause' : 'resume'} ${reason}`),
    runMacro: () => 'started',
  };

  beforeAll(async () => {
    server = createHttpServer({
      publicDir: join(import.meta.dirname, '..', 'public'),
      auth: new AuthApi({
        provider: null,
        sessions: new LoginSessions({ ttlMs: 1000 }),
        sessionTtlSeconds: 1,
        publicUrl: '',
      }),
      admin: new AdminApi({ token: TOKEN, backend }),
      video: [],
      clientConfig: () => ({}),
      overlay: () => ({}),
      paused: false,
      limiter: new RateLimiter({ capacity: 1000, perSecond: 1000 }),
      videoLimiter: new RateLimiter({ capacity: 1000, perSecond: 1000 }),
      hsts: false,
      trustedProxy: 'none',
      log: () => {},
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => server.close());

  const run = async (...argv: string[]) => {
    const lines: string[] = [];
    const code = await main(argv, { ADMIN_TOKEN: TOKEN, ADMIN_URL: base }, (t) => lines.push(t));
    return { code, text: lines.join('\n') };
  };

  it('shows the status as text and as JSON', async () => {
    const text = await run('status');
    expect(text.code).toBe(0);
    expect(text.text).toContain('Playing: Ana (p1), 1:00 left');
    const json = await run('--json', 'status');
    expect(JSON.parse(json.text)).toMatchObject({ status: 200, body: { current: { id: 'p1' }, serverNow: NOW } });
  });

  it('sends every action to its route', async () => {
    expect((await run('pause')).code).toBe(0);
    expect((await run('resume')).code).toBe(0);
    expect((await run('kick', 'p2')).text).toBe('Removed p2.');
    expect((await run('kick', 'nobody')).code).toBe(1);
    expect((await run('skip')).text).toBe('Turn ended.');
    expect((await run('skip')).text).toMatch(/Nobody is playing/);
    expect(calls).toStrictEqual(['pause admin', 'resume admin', 'kick p2', 'kick nobody', 'skip', 'skip']);
  });

  it('reports a wrong token, a missing token and an unreachable server', async () => {
    const client = new AdminClient({ baseUrl: base, token: 'wrong-token-wrong-token' });
    expect((await client.run({ name: 'status' })).status).toBe(401);
    const lines: string[] = [];
    expect(await main(['status'], { ADMIN_URL: base }, (t) => lines.push(t))).toBe(2);
    expect(lines[0]).toMatch(/ADMIN_TOKEN/);
    const failing = (() => Promise.reject(new Error('refused'))) as unknown as typeof fetch;
    expect(await main(['status'], { ADMIN_TOKEN: TOKEN, ADMIN_URL: base }, () => {}, failing)).toBe(1);
  });
});
