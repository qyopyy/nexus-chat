import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { AdminApi, type AdminBackend } from '../src/adapters/http/admin-api.ts';
import { AuthApi } from '../src/adapters/http/auth-api.ts';
import { clientIp, clientOrigin, isDirectLocalRequest, networkOf } from '../src/adapters/http/client-origin.ts';
import { createHttpServer } from '../src/adapters/http/http-server.ts';
import { LoginSessions } from '../src/application/login-sessions.ts';
import { RateLimiter } from '../src/application/rate-limiter.ts';

const req = (remoteAddress: string, headers: Record<string, string>) => ({ socket: { remoteAddress }, headers });

describe('client origin', () => {
  it('accepts only direct loopback requests to a local host name', () => {
    expect(isDirectLocalRequest(req('127.0.0.1', { host: 'localhost:3000' }))).toBe(true);
    expect(isDirectLocalRequest(req('::ffff:127.0.0.1', { host: '127.0.0.1:3000' }))).toBe(true);
    expect(isDirectLocalRequest(req('::1', { host: '[::1]:3000' }))).toBe(true);
  });

  it('rejects tunnelled, proxied and remote requests', () => {
    expect(isDirectLocalRequest(req('127.0.0.1', { host: 'play.example.com' }))).toBe(false);
    expect(isDirectLocalRequest(req('127.0.0.1', { host: 'localhost', 'cf-connecting-ip': '203.0.113.5' }))).toBe(
      false,
    );
    expect(isDirectLocalRequest(req('127.0.0.1', { host: 'localhost', 'x-forwarded-for': '203.0.113.5' }))).toBe(false);
    expect(isDirectLocalRequest(req('192.0.2.7', { host: 'localhost' }))).toBe(false);
    expect(isDirectLocalRequest(req('127.0.0.1', {}))).toBe(false);
  });

  it('trusts the tunnel IP header only when configured, and only from loopback', () => {
    const tunnelled = req('127.0.0.1', { 'cf-connecting-ip': '203.0.113.5' });
    expect(clientIp(tunnelled, 'cloudflare')).toBe('203.0.113.5');
    expect(clientIp(tunnelled, 'none')).toBe('127.0.0.1');
    expect(clientIp(req('198.51.100.1', { 'cf-connecting-ip': '203.0.113.5' }), 'cloudflare')).toBe('198.51.100.1');
  });

  it('groups IPv6 visitors by /56', () => {
    expect(networkOf('2001:db8:aa:bbcc::1')).toBe('2001:db8:aa:bb00::/56');
    expect(networkOf('2001:db8:aa:bb12:1:2:3:4')).toBe('2001:db8:aa:bb00::/56');
    expect(clientOrigin(req('192.0.2.1', {}), 'none')).toBe('192.0.2.1');
  });
});

const TOKEN = 'test-admin-token-123456';

describe('HTTP admin gate', () => {
  let server: Server;
  let port = 0;

  const backend: AdminBackend = {
    state: () => ({ current: null, waiting: [], paused: null }),
    kick: () => true,
    skipTurn: () => false,
    setPaused: () => {},
    runMacro: () => 'started',
  };

  const serve = (paused: boolean) =>
    createHttpServer({
      publicDir: join(import.meta.dirname, '..', 'public'),
      auth: new AuthApi({
        provider: null,
        sessions: new LoginSessions({ ttlMs: 1000 }),
        sessionTtlSeconds: 1,
        publicUrl: '',
      }),
      admin: new AdminApi({ token: TOKEN, backend }),
      video: [],
      clientConfig: () => ({ name: 'test' }),
      overlay: () => ({ playing: null }),
      paused,
      limiter: new RateLimiter({ capacity: 1000, perSecond: 1000 }),
      videoLimiter: new RateLimiter({ capacity: 1000, perSecond: 1000 }),
      hsts: false,
      trustedProxy: 'cloudflare',
      log: () => {},
    });

  beforeAll(async () => {
    server = serve(false);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => server.close());

  function get(path: string, headers: Record<string, string> = {}): Promise<{ status: number; body: string }> {
    return new Promise((resolve, reject) => {
      const r = request(
        { host: '127.0.0.1', port, path, headers: { host: `localhost:${port}`, ...headers } },
        (res) => {
          let body = '';
          res.on('data', (chunk) => {
            body += chunk;
          });
          res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
        },
      );
      r.on('error', reject);
      r.end();
    });
  }

  const auth = { authorization: `Bearer ${TOKEN}` };

  it('serves the admin API locally with the token', async () => {
    const res = await get('/api/admin/state', auth);
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toStrictEqual({ current: null, waiting: [], paused: null });
  });

  it('requires the token even locally', async () => {
    expect((await get('/api/admin/state')).status).toBe(401);
    expect((await get('/api/admin/state', { authorization: 'Bearer wrong' })).status).toBe(401);
  });

  it('pretends the admin API does not exist through a tunnel', async () => {
    const tunnelled = { ...auth, 'cf-connecting-ip': '203.0.113.5' };
    expect((await get('/api/admin/state', tunnelled)).status).toBe(404);
    expect((await get('/API/admin/state', tunnelled)).status).toBe(404);
    expect((await get('/api/admin/state', { ...auth, host: 'play.example.com' })).status).toBe(404);
  });

  it('serves the admin panel page to direct local requests only', async () => {
    expect((await get('/admin')).status).toBe(200);
    expect((await get('/admin.html')).status).toBe(200);
    expect((await get('/admin', { 'cf-connecting-ip': '203.0.113.5' })).status).toBe(404);
    expect((await get('/admin.html', { host: 'play.example.com' })).status).toBe(404);
  });

  it('runs a macro only for an authorized local admin, and validates it', async () => {
    const post = (headers: Record<string, string>, body: string): Promise<number> =>
      new Promise((resolve, reject) => {
        const r = request(
          { host: '127.0.0.1', port, path: '/api/admin/macro', method: 'POST', headers: { host: `localhost:${port}`, ...headers } },
          (res) => {
            res.resume();
            res.on('end', () => resolve(res.statusCode ?? 0));
          },
        );
        r.on('error', reject);
        r.end(body);
      });
    const good = JSON.stringify({ steps: [{ buttons: ['cross'], ms: 90 }] });
    expect(await post({}, good)).toBe(401);
    expect(await post({ authorization: `Bearer ${TOKEN}`, 'cf-connecting-ip': '203.0.113.5' }, good)).toBe(404);
    expect(await post({ authorization: `Bearer ${TOKEN}` }, good)).toBe(202);
    expect(await post({ authorization: `Bearer ${TOKEN}` }, JSON.stringify({ steps: [{ buttons: ['ps'], ms: 90 }] }))).toBe(400);
  });

  it('keeps the overlay feed local, and the public pages public', async () => {
    expect((await get('/overlay.json')).status).toBe(200);
    expect((await get('/overlay.json', { 'cf-connecting-ip': '203.0.113.5' })).status).toBe(404);
    expect((await get('/', { 'cf-connecting-ip': '203.0.113.5' })).status).toBe(200);
    expect((await get('/config.json', { 'cf-connecting-ip': '203.0.113.5' })).status).toBe(200);
  });

  it('never serves files outside the public folder', async () => {
    expect((await get('/..%2fpackage.json')).status).toBe(404);
    expect((await get('/../package.json')).status).toBe(404);
  });

  it('answers every route with the paused page while paused, auth included', async () => {
    const paused = serve(true);
    await new Promise<void>((resolve) => paused.listen(0, '127.0.0.1', resolve));
    const pausedPort = (paused.address() as AddressInfo).port;
    try {
      const fetchText = async (path: string) => {
        const res = await fetch(`http://127.0.0.1:${pausedPort}${path}`, {
          headers: { 'cf-connecting-ip': '203.0.113.5' },
          redirect: 'manual',
        });
        return { status: res.status, body: await res.text() };
      };
      const page = await fetchText('/');
      expect(page.status).toBe(200);
      expect(page.body).toMatch(/paused/i);
      for (const path of ['/auth/me', '/auth/kick/login', '/auth/kick/callback?code=x&state=y']) {
        expect((await fetchText(path)).body, path).toBe(page.body);
      }
      expect((await fetchText('/config.json')).status).toBe(503);
      expect((await fetchText('/js/app.js')).status).toBe(503);
      expect((await fetchText('/css/style.css')).status).toBe(200);
    } finally {
      paused.close();
    }
  });

  it('sends security headers', async () => {
    const headers = await new Promise<Record<string, unknown>>((resolve) => {
      request({ host: '127.0.0.1', port, path: '/', headers: { host: 'localhost' } }, (res) => {
        res.resume();
        resolve(res.headers);
      }).end();
    });
    expect(String(headers['content-security-policy'])).toMatch(/frame-ancestors 'none'/);
    expect(headers['x-frame-options']).toBe('DENY');
  });
});
