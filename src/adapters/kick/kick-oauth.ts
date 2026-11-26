import { createHash, randomBytes } from 'node:crypto';
import type { Account } from '../../application/login-sessions.ts';

/** Kick's OAuth 2.1 endpoints. */
const AUTHORIZE_URL = 'https://id.kick.com/oauth/authorize';
const TOKEN_URL = 'https://id.kick.com/oauth/token';
const USERS_URL = 'https://api.kick.com/public/v1/users';
/** Only the account id and username are needed. */
const SCOPE = 'user:read';
const REQUEST_TIMEOUT_MS = 10_000;

/** A login in progress: the caller keeps `state` and `verifier` in the browser (HttpOnly cookie). */
type LoginStart = { url: string; state: string; verifier: string };

/** An OAuth identity provider for "Log in with …". */
export interface IdentityProvider {
  start(redirectUri: string): LoginStart;
  finish(code: string, verifier: string, redirectUri: string): Promise<Account>;
}

/**
 * "Log in with Kick": the authorization-code flow with PKCE, stateless on the server. The Kick
 * access token is used once to read the username and then dropped.
 */
export class KickOAuth implements IdentityProvider {
  readonly #clientId: string;
  readonly #clientSecret: string;
  readonly #fetch: typeof fetch;

  constructor({
    clientId,
    clientSecret,
    fetch: fetchFn = fetch,
  }: {
    clientId: string;
    clientSecret: string;
    fetch?: typeof fetch;
  }) {
    this.#clientId = clientId;
    this.#clientSecret = clientSecret;
    this.#fetch = fetchFn;
  }

  start(redirectUri: string): LoginStart {
    const state = randomBytes(24).toString('base64url');
    const verifier = randomBytes(48).toString('base64url');
    const url = new URL(AUTHORIZE_URL);
    url.search = new URLSearchParams({
      response_type: 'code',
      client_id: this.#clientId,
      redirect_uri: redirectUri,
      scope: SCOPE,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
      state,
    }).toString();
    return { url: url.toString(), state, verifier };
  }

  async finish(code: string, verifier: string, redirectUri: string): Promise<Account> {
    if (!code || !verifier) throw new Error('missing code or verifier');
    const tokenResponse = await this.#fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: this.#clientId,
        client_secret: this.#clientSecret,
        redirect_uri: redirectUri,
        code_verifier: verifier,
        code,
      }).toString(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!tokenResponse.ok) throw new Error(`token exchange failed (${tokenResponse.status})`);
    const { access_token: accessToken } = (await tokenResponse.json()) as { access_token?: unknown };
    if (typeof accessToken !== 'string' || !accessToken) throw new Error('no access token');

    const userResponse = await this.#fetch(USERS_URL, {
      headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!userResponse.ok) throw new Error(`user lookup failed (${userResponse.status})`);
    const { data } = (await userResponse.json()) as { data?: Array<{ user_id?: unknown; name?: unknown }> };
    const user = data?.[0];
    if (typeof user?.user_id !== 'number') throw new Error('no user in the response');
    // Kick sometimes returns an empty name for a valid account: use a stand-in.
    const name = typeof user.name === 'string' && user.name.trim() ? user.name : `Player ${user.user_id}`;
    return { id: `kick:${user.user_id}`, name };
  }
}
