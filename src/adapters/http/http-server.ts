import { realpathSync } from 'node:fs';
import { realpath } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { join, normalize, sep } from 'node:path';
import type { Logger } from '../../application/ports.ts';
import type { RateLimiter } from '../../application/rate-limiter.ts';
import type { AdminApi } from './admin-api.ts';
import type { AuthApi } from './auth-api.ts';
import { clientOrigin, isDirectLocalRequest, type TrustedProxy } from './client-origin.ts';
import { StaticFiles } from './static-files.ts';

/** Content-Security-Policy and friends for every response. */
const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'content-security-policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self'",
    "media-src 'self' blob:",
    "connect-src 'self'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'self'",
  ].join('; '),
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  'cross-origin-opener-policy': 'same-origin',
  'permissions-policy': 'camera=(), geolocation=(), microphone=()',
};

/** The admin API (used by `bun run admin`); it answers only to direct local requests. */
const ADMIN_PATH = /^\/api\/admin(\/.*)?$/i;
/** The admin panel page (public/admin.html) is only served to direct local requests, like the API. */
const ADMIN_PAGE = /^\/admin(\.html)?\/?$/i;
/** What a paused site still serves. */
const PAUSED_ASSETS = /^\/(paused\.html|css\/style\.css|icon\.svg|favicon\.ico)$/;
/** Local-only JSON for the broadcast overlay renderer. */
const OVERLAY_PATH = '/overlay.json';
const DEFAULT_MAX_CONNECTIONS = 2000;

/** Anything that may answer a request; returns false to pass it on. */
export type RequestHandler = (req: IncomingMessage, res: ServerResponse) => Promise<boolean>;

type HttpServerOptions = {
  publicDir: string;
  auth: AuthApi;
  admin: AdminApi | null;
  /** Video signaling handlers (WHEP proxies). */
  video: readonly RequestHandler[];
  /** Public, non-secret settings the page needs (`/config.json`). */
  clientConfig: () => object;
  /** The overlay state (`/overlay.json`, local only). */
  overlay: () => object;
  paused: boolean;
  /** Per-visitor budget for every request (shared with WebSocket upgrades). */
  limiter: RateLimiter;
  /** Per-visitor budget for video offers (each one makes the media server build a session). */
  videoLimiter: RateLimiter;
  /** Sent only behind HTTPS (a public URL); browsers ignore it on http://localhost anyway. */
  hsts: boolean;
  /** Whose forwarding header identifies visitors. */
  trustedProxy: TrustedProxy;
  /** Cap on open sockets (HTTP and WebSocket) across all visitors. */
  maxConnections?: number;
  log?: Logger;
};

/** Builds the HTTP server: security headers, rate limits, the admin gate, then the routes. */
export function createHttpServer(options: HttpServerOptions): Server {
  const log = options.log ?? console.warn;
  const files = new StaticFiles();
  const publicDir = realpathSync(options.publicDir);

  const server = createServer(async (req, res) => {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(name, value);
    if (options.hsts) res.setHeader('strict-transport-security', 'max-age=31536000; includeSubDomains');
    const visitor = clientOrigin(req, options.trustedProxy);
    if (!options.limiter.take(visitor)) {
      res.writeHead(429, { 'retry-after': '1' }).end('Too many requests');
      return;
    }
    if (req.method === 'POST' && req.url?.startsWith('/api/video') && !options.videoLimiter.take(visitor)) {
      res.writeHead(429, { 'retry-after': '2' }).end('Too many video requests');
      return;
    }
    try {
      await route(req, res);
    } catch (error) {
      log(`Request failed: ${(error as Error).message}`);
      if (!res.headersSent) res.writeHead(500);
      res.end();
    }
  });
  // Slow clients cannot hold connections open by trickling headers or bodies.
  server.headersTimeout = 10_000;
  server.requestTimeout = 15_000;
  // A flood from many addresses cannot exhaust file descriptors: past the cap, sockets are dropped.
  server.maxConnections = options.maxConnections ?? DEFAULT_MAX_CONNECTIONS;
  return server;

  async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = URL.parse(req.url ?? '/', 'http://localhost');
    if (!url) {
      res.writeHead(400).end('Bad request');
      return;
    }
    const local = isDirectLocalRequest(req);

    // The admin API only exists for requests made on this machine, never through a tunnel.
    if (ADMIN_PATH.test(url.pathname) && (!local || !options.admin)) return notFound(res);
    if (ADMIN_PAGE.test(url.pathname) && (!local || !options.admin)) return notFound(res);

    // Paused: only the paused page and its assets, before any other handler (auth included) runs.
    // The local overlay feed and admin API keep working, so the owner can still see and act.
    const localOnly = local && (url.pathname === OVERLAY_PATH || ADMIN_PATH.test(url.pathname) || ADMIN_PAGE.test(url.pathname));
    if (options.paused && !localOnly) {
      if (PAUSED_ASSETS.test(url.pathname)) return serveFile(req, res, url.pathname);
      const isPage = (req.method === 'GET' || req.method === 'HEAD') && !/\.[A-Za-z0-9]+$/.test(url.pathname);
      if (isPage || url.pathname === '/index.html') return serveFile(req, res, '/paused.html');
      res.writeHead(503, { 'content-type': 'text/plain', 'retry-after': '3600' }).end('Paused');
      return;
    }

    if (url.pathname === OVERLAY_PATH) {
      if (!local) return notFound(res);
      return json(res, options.overlay());
    }
    if (url.pathname === '/config.json') return json(res, options.clientConfig());
    if (await options.auth.handle(req, res)) return;
    if (local && options.admin && (await options.admin.handle(req, res))) return;
    for (const handler of options.video) if (await handler(req, res)) return;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { allow: 'GET, HEAD' }).end();
      return;
    }
    await serveFile(req, res, ADMIN_PAGE.test(url.pathname) ? '/admin.html' : url.pathname);
  }

  async function serveFile(req: IncomingMessage, res: ServerResponse, pathname: string): Promise<void> {
    let relative: string;
    try {
      relative = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1));
    } catch {
      res.writeHead(400).end('Bad request');
      return;
    }
    const file = normalize(join(publicDir, relative));
    if (!file.startsWith(publicDir + sep)) return notFound(res);
    try {
      // A symlink inside public/ must not reach files outside it.
      const real = await realpath(file);
      if (!real.startsWith(publicDir + sep)) return notFound(res);
      const reply = await files.serve(real, {
        acceptEncoding: header(req, 'accept-encoding'),
        ifNoneMatch: header(req, 'if-none-match'),
      });
      res.writeHead(reply.status, reply.headers);
      res.end(req.method === 'HEAD' ? undefined : (reply.body ?? undefined));
    } catch {
      notFound(res);
    }
  }
}

function header(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name];
  return typeof value === 'string' ? value : undefined;
}

function notFound(res: ServerResponse): void {
  res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
}

function json(res: ServerResponse, body: object): void {
  res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(body));
}
