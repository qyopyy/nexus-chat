import type { IncomingMessage, ServerResponse } from 'node:http';
import { APP_NAME } from '../../app-info.ts';
import type { Account, LoginSessions } from '../../application/login-sessions.ts';
import type { IdentityProvider } from '../kick/kick-oauth.ts';
import { cookie, readCookie } from './http-util.ts';

const SESSION_COOKIE = `${APP_NAME}_session`;
const LOGIN_COOKIE = `${APP_NAME}_login`;
const LOGIN_COOKIE_PATH = '/auth/kick';
const LOGIN_TTL_SECONDS = 600;
/** Several pending logins, so a double tap or a second tab does not break the first one. */
const MAX_PENDING_LOGINS = 3;
const PENDING_LOGIN = /^[\w-]{1,128}\.[\w-]{1,128}$/;

type AuthApiOptions = {
  /** null: login off (everyone may join with a typed name). */
  provider: IdentityProvider | null;
  sessions: LoginSessions;
  sessionTtlSeconds: number;
  /** The site's public address for the OAuth redirect URL; '' = derived from Host. */
  publicUrl: string;
  log?: (line: string) => void;
};

/**
 * Routes under `/auth/`: log in with Kick (login, callback), who am I, log out. The session is an
 * opaque random token in an HttpOnly cookie; {@link accountOf} reads it for WebSockets.
 */
export class AuthApi {
  readonly #provider: IdentityProvider | null;
  readonly #sessions: LoginSessions;
  readonly #sessionTtlSeconds: number;
  readonly #publicUrl: string;
  readonly #log: (line: string) => void;

  constructor({ provider, sessions, sessionTtlSeconds, publicUrl, log = console.warn }: AuthApiOptions) {
    this.#provider = provider;
    this.#sessions = sessions;
    this.#sessionTtlSeconds = sessionTtlSeconds;
    this.#publicUrl = publicUrl.replace(/\/+$/, '');
    this.#log = log;
  }

  get enabled(): boolean {
    return this.#provider !== null;
  }

  accountOf(req: IncomingMessage): Account | null {
    const token = readCookie(req, SESSION_COOKIE);
    return token ? this.#sessions.get(token) : null;
  }

  /** Returns false when the request is not for an `/auth/` route. */
  async handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (!url.pathname.startsWith('/auth/')) return false;
    const route = `${req.method} ${url.pathname}`;

    if (route === 'GET /auth/me') {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ login: this.enabled ? 'kick' : 'none', name: this.accountOf(req)?.name ?? null }));
      return true;
    }
    if (route === 'POST /auth/logout') {
      const token = readCookie(req, SESSION_COOKIE);
      if (token) this.#sessions.delete(token);
      res.writeHead(204, { 'set-cookie': cookie(SESSION_COOKIE, '', '/', 0) }).end();
      return true;
    }
    if (this.#provider && route === 'GET /auth/kick/login') {
      const { url: target, state, verifier } = this.#provider.start(this.#redirectUri(req));
      const pending = [`${state}.${verifier}`, ...pendingLogins(req)].slice(0, MAX_PENDING_LOGINS);
      redirect(res, target, loginCookie(pending));
      return true;
    }
    if (this.#provider && route === 'GET /auth/kick/callback') {
      await this.#callback(this.#provider, req, res, url);
      return true;
    }
    res.writeHead(404).end('Not found');
    return true;
  }

  /**
   * The state must come back to the browser that started the login (one of its HttpOnly pending
   * logins), so nobody can hand someone a callback link that logs them in as another account.
   */
  async #callback(provider: IdentityProvider, req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    const state = url.searchParams.get('state') ?? '';
    const pending = pendingLogins(req);
    const match = state ? pending.find((entry) => entry.startsWith(`${state}.`)) : undefined;
    const keepLogins = loginCookie(pending.filter((entry) => entry !== match));
    // Already logged in: a stale or cancelled callback changes nothing, so no error to show.
    const fallback = (failure: string) => (this.accountOf(req) ? '/' : failure);

    if (url.searchParams.get('error')) {
      redirect(res, fallback('/?login=cancelled'), keepLogins);
      return;
    }
    if (!match) {
      this.#log('Login failed: state mismatch');
      redirect(res, fallback('/?login=failed'), keepLogins);
      return;
    }
    try {
      const verifier = match.slice(state.length + 1);
      const account = await provider.finish(url.searchParams.get('code') ?? '', verifier, this.#redirectUri(req));
      const token = this.#sessions.create(account);
      redirect(res, '/', [keepLogins, cookie(SESSION_COOKIE, token, '/', this.#sessionTtlSeconds)]);
    } catch (error) {
      this.#log(`Login failed: ${(error as Error).message}`);
      redirect(res, '/?login=failed', keepLogins);
    }
  }

  #redirectUri(req: IncomingMessage): string {
    if (this.#publicUrl) return `${this.#publicUrl}/auth/kick/callback`;
    const host = req.headers.host ?? 'localhost';
    const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
    return `${local ? 'http' : 'https'}://${host}/auth/kick/callback`;
  }
}

function pendingLogins(req: IncomingMessage): string[] {
  return readCookie(req, LOGIN_COOKIE)
    .split('|')
    .filter((entry) => PENDING_LOGIN.test(entry))
    .slice(0, MAX_PENDING_LOGINS);
}

function loginCookie(pending: string[]): string {
  return cookie(LOGIN_COOKIE, pending.join('|'), LOGIN_COOKIE_PATH, pending.length ? LOGIN_TTL_SECONDS : 0);
}

function redirect(res: ServerResponse, location: string, setCookie: string | string[]): void {
  res.writeHead(302, { location, 'cache-control': 'no-store', 'set-cookie': setCookie }).end();
}
