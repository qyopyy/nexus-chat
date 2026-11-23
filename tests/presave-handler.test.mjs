import assert from 'node:assert/strict';
import test from 'node:test';
import { createPresaveHandler } from '../supabase/functions/presave/handler.mjs';
import { encrypt, pkceChallenge, randomToken, sha256 } from '../supabase/functions/presave/core.mjs';

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const CAMPAIGN = '33333333-3333-4333-8333-333333333333';
const URI = 'spotify:track:0123456789ABCDEFGHIJKL';
const ENDPOINT = 'https://example.supabase.co/functions/v1/presave';
const TEST_ENV = {
  SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-only-service-key',
  SPOTIFY_CLIENT_ID: 'test-client', PRESAVE_TOKEN_KEY: Buffer.alloc(32, 7).toString('base64'),
  PRESAVE_CRON_SECRET: 'test-only-scheduler-secret-at-least-32-chars',
  PRESAVE_PUBLIC_URL: 'https://nexus.example/public/presave/index.html', PRESAVE_SCHEDULER_ENABLED: 'true',
};
const jwt = (aal = 'aal1') => `test.${Buffer.from(JSON.stringify({ sub: ALICE, aal })).toString('base64url')}.test-signature`;
const campaign = (extra = {}) => ({
  id: CAMPAIGN, owner_id: ALICE, slug: 'test-release', title: 'Release', artist: 'Artist',
  spotify_uri: URI, release_at: new Date(Date.now() + 86400000).toISOString(), published: true, links: [], ...extra,
});
const request = (body, headers = {}) => new Request(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

// A tiny generic PostgREST transport double. The separate database suite tests
// the real SQL; this double makes HTTP auth and provider trust boundaries visible.
function database(rows = [], users = new Map(), rpcImpl) {
  const tables = { presave_campaigns: structuredClone(rows), presave_authorizations: [], presave_oauth_states: [] };
  const calls = [];
  class Query {
    constructor(table) { this.table = table; this.operation = 'select'; this.filters = []; }
    select() { return this; }
    eq(key, value) { this.filters.push((row) => row[key] === value); return this; }
    is(key, value) { this.filters.push((row) => (row[key] ?? null) === value); return this; }
    gt(key, value) { this.filters.push((row) => row[key] > value); return this; }
    in(key, values) { this.filters.push((row) => values.includes(row[key])); return this; }
    insert(value) { this.operation = 'insert'; this.value = value; return this; }
    update(value) { this.operation = 'update'; this.value = value; return this; }
    delete() { this.operation = 'delete'; return this; }
    async execute(single = false) {
      const table = tables[this.table] ||= [];
      let selected = table.filter((row) => this.filters.every((filter) => filter(row)));
      if (this.operation === 'insert') {
        const row = { id: crypto.randomUUID(), expires_at: new Date(Date.now() + 900000).toISOString(), ...structuredClone(this.value) };
        table.push(row); selected = [row];
      }
      if (this.operation === 'update') selected.forEach((row) => Object.assign(row, structuredClone(this.value)));
      if (this.operation === 'delete') tables[this.table] = table.filter((row) => !selected.includes(row));
      return { data: structuredClone(single ? selected[0] ?? null : selected), error: null };
    }
    maybeSingle() { return this.execute(true); }
    single() { return this.execute(true); }
    then(resolve, reject) { return this.execute().then(resolve, reject); }
  }
  return {
    tables, calls,
    auth: { getUser: async (token) => ({ data: { user: users.get(token) ?? null }, error: users.has(token) ? null : { message: 'invalid token' } }) },
    from: (table) => new Query(table),
    rpc: async (name, args) => {
      calls.push({ name, args: structuredClone(args) });
      if (rpcImpl) return rpcImpl(name, args, tables);
      if (name === 'presave_rate_limit') return { data: true, error: null };
      if (name === 'presave_list') return { data: { campaigns: tables.presave_campaigns.filter((row) => row.owner_id === args.p_owner) }, error: null };
      if (name === 'presave_accept_authorization') return { data: 'pending', error: null };
      if (name === 'presave_claim_due') return { data: structuredClone(tables.presave_authorizations), error: null };
      throw new Error(`Unexpected RPC ${name}`);
    },
  };
}

test('management actions reject missing/forged bearer tokens and never use a supplied owner ID', async () => {
  const token = jwt();
  const db = database([campaign(), campaign({ id: crypto.randomUUID(), owner_id: BOB, slug: 'bob-release' })], new Map([[token, { id: ALICE }]]));
  const handler = createPresaveHandler({ db, env: TEST_ENV });
  for (const action of ['list', 'save', 'duplicate', 'delete']) {
    assert.equal((await handler(request({ action, owner_id: BOB, id: CAMPAIGN, campaign: campaign() }))).status, 401);
    assert.equal((await handler(request({ action, owner_id: BOB, id: CAMPAIGN }, { Authorization: 'Bearer forged.jwt.signature' }))).status, 401);
  }
  assert.equal(db.calls.length, 0);
  const result = await handler(request({ action: 'list', owner_id: BOB }, { Authorization: `Bearer ${token}` }));
  assert.equal(result.status, 200);
  assert.ok((await result.json()).campaigns.every((row) => row.owner_id === ALICE));
});

test('verified MFA enrollment requires aal2 even when the primary access token is valid', async () => {
  const users = new Map([[jwt('aal1'), { id: ALICE, factors: [{ status: 'verified' }] }], [jwt('aal2'), { id: ALICE, factors: [{ status: 'verified' }] }]]);
  const db = database([campaign()], users);
  const handler = createPresaveHandler({ db, env: TEST_ENV });
  const low = await handler(request({ action: 'list' }, { Authorization: `Bearer ${jwt('aal1')}` }));
  assert.equal(low.status, 403);
  assert.equal((await low.json()).code, 'mfa_required');
  assert.equal(db.calls.length, 0);
  assert.equal((await handler(request({ action: 'list' }, { Authorization: `Bearer ${jwt('aal2')}` }))).status, 200);
});

test('HTTP campaign mutations cannot read, duplicate, overwrite, or delete another owner’s rows', async () => {
  const token = jwt();
  const db = database([campaign({ owner_id: BOB })], new Map([[token, { id: ALICE }]]));
  const handler = createPresaveHandler({ db, env: TEST_ENV });
  const headers = { Authorization: `Bearer ${token}` };
  for (const body of [{ action: 'save', campaign: campaign({ owner_id: ALICE }) }, { action: 'duplicate', id: CAMPAIGN }, { action: 'delete', id: CAMPAIGN }]) {
    assert.equal((await handler(request(body, headers))).status, 404);
  }
  assert.equal(db.tables.presave_campaigns.length, 1);
  assert.equal(db.tables.presave_campaigns[0].owner_id, BOB);
  const fresh = campaign({ owner_id: BOB, slug: 'fresh-release' });
  delete fresh.id;
  const created = await handler(request({ action: 'save', campaign: fresh }, headers));
  assert.equal(created.status, 200);
  assert.equal((await created.json()).campaign.owner_id, ALICE);
});

test('custom appearance survives create, edit, list, and duplicate without publishing the duplicate', async () => {
  const token = jwt();
  const db = database([], new Map([[token, { id: ALICE }]]));
  const handler = createPresaveHandler({ db, env: TEST_ENV });
  const headers = { Authorization: `Bearer ${token}` };
  const design = {
    theme: 'galaxy', background_url: 'https://images.example/nebula.webp',
    background_overlay: 42, background_motion: false,
    background_color: '#112233', text_color: '#eeddff', button_style: 'pill', font_style: 'mono',
  };
  const fresh = campaign(design);
  delete fresh.id;
  const created = await handler(request({ action: 'save', campaign: fresh }, headers));
  assert.equal(created.status, 200);
  const saved = (await created.json()).campaign;
  for (const [key, value] of Object.entries(design)) assert.equal(saved[key], value, key);
  const updatedResponse = await handler(request({ action: 'save', campaign: { ...saved, title: 'An edited release', background_overlay: 0, background_url: null } }, headers));
  assert.equal(updatedResponse.status, 200);
  const updated = (await updatedResponse.json()).campaign;
  assert.equal(updated.background_overlay, 0);
  assert.equal(updated.background_url, null);
  const listing = await (await handler(request({ action: 'list' }, headers))).json();
  assert.equal(listing.campaigns[0].font_style, design.font_style);
  const duplicatedResponse = await handler(request({ action: 'duplicate', id: saved.id }, headers));
  assert.equal(duplicatedResponse.status, 200);
  const duplicate = (await duplicatedResponse.json()).campaign;
  for (const key of Object.keys(design)) assert.equal(duplicate[key], updated[key], key);
  assert.notEqual(duplicate.id, saved.id);
  assert.notEqual(duplicate.slug, saved.slug);
  assert.equal(duplicate.published, false);
  assert.equal(duplicate.owner_id, ALICE);
});

test('older clients can edit a campaign without resetting appearance fields they do not know', async () => {
  const token = jwt();
  const design = {
    background_url: 'https://images.example/saved.png', background_overlay: 72,
    background_motion: false, background_color: '#223344', text_color: '#ddeeff',
    button_style: 'square', font_style: 'editorial',
  };
  const db = database([campaign(design)], new Map([[token, { id: ALICE }]]));
  const handler = createPresaveHandler({ db, env: TEST_ENV });
  const headers = { Authorization: `Bearer ${token}` };
  const response = await handler(request({ action: 'save', campaign: campaign({ title: 'Saved by an older client' }) }, headers));
  assert.equal(response.status, 200);
  const updated = (await response.json()).campaign;
  assert.equal(updated.title, 'Saved by an older client');
  for (const [key, value] of Object.entries(design)) assert.equal(updated[key], value, key);
  const invalid = await handler(request({ action: 'save', campaign: campaign({ background_motion: 'false' }) }, headers));
  assert.equal(invalid.status, 400);
  assert.equal(db.tables.presave_campaigns[0].background_motion, false);
});

test('HTTP parsing limits and neutral errors prevent unbounded requests and secret disclosure', async () => {
  const db = database([], new Map([[jwt(), { id: ALICE }]]));
  const handler = createPresaveHandler({ db, env: TEST_ENV });
  assert.equal((await handler(new Request(ENDPOINT, { method: 'PUT' }))).status, 405);
  assert.equal((await handler(new Request(ENDPOINT, { method: 'POST', body: 'plain text' }))).status, 415);
  assert.equal((await handler(request({ action: 'config', extra: 'x'.repeat(33000) }))).status, 413);
  assert.equal((await handler(request([]))).status, 400);
  assert.equal((await handler(request({ action: 'unknown' }))).status, 400);
  db.rpc = async () => { throw new Error('private-provider-token: do-not-expose'); };
  const error = await handler(request({ action: 'list' }, { Authorization: `Bearer ${jwt()}` }));
  assert.equal(error.status, 503);
  assert.equal((await error.text()).includes('private-provider-token'), false);
});

test('Spotify is unavailable until configured and the scheduler requires its own secret', async () => {
  const db = database();
  const disabled = createPresaveHandler({ db, env: { ...TEST_ENV, PRESAVE_SCHEDULER_ENABLED: 'false' } });
  assert.equal((await (await disabled(request({ action: 'config' }))).json()).spotify_configured, false);
  assert.equal((await disabled(request({ action: 'authorize', slug: 'test-release' }))).status, 503);
  const handler = createPresaveHandler({ db, env: TEST_ENV });
  assert.equal((await handler(request({ action: 'run' }))).status, 401);
  assert.equal((await handler(request({ action: 'run' }, { 'x-presave-cron-secret': 'incorrect' }))).status, 401);
  assert.equal(db.calls.length, 0);
  const run = await handler(request({ action: 'run' }, { 'x-presave-cron-secret': TEST_ENV.PRESAVE_CRON_SECRET }));
  assert.deepEqual(await run.json(), { processed: 0, results: {} });
});

test('receipt lookup rejects bogus capabilities and capabilities for a different campaign', async () => {
  const token = randomToken();
  const db = database([campaign(), campaign({ id: crypto.randomUUID(), slug: 'different-release' })]);
  db.tables.presave_authorizations.push({
    campaign_id: CAMPAIGN, cancel_hash: await sha256(token), status: 'pending',
    scheduled_for: new Date(Date.now() + 86400000).toISOString(), token_expires_at: new Date(Date.now() + 86400000).toISOString(),
  });
  const handler = createPresaveHandler({ db, env: TEST_ENV });
  for (const body of [
    { token: 'bogus', slug: 'test-release' }, { token: randomToken(), slug: 'test-release' },
    { token, slug: 'different-release' }, { token, slug: '../private' }, { token: { value: token }, slug: 'test-release' },
  ]) {
    const result = await handler(request({ action: 'receipt', ...body }));
    assert.equal(result.status, 404);
    assert.equal((await result.json()).code, 'not_found');
  }
});

test('a valid receipt exposes only verified pending, saved, and expired status without credentials or private errors', async () => {
  const token = randomToken();
  const db = database([campaign({ published: false })]);
  const job = {
    campaign_id: CAMPAIGN, cancel_hash: await sha256(token), status: 'pending',
    scheduled_for: new Date(Date.now() + 86400000).toISOString(), saved_at: null,
    token_expires_at: new Date(Date.now() + 86400000).toISOString(),
    refresh_token_ciphertext: 'private-encrypted-token', spotify_user_hash: 'private-fan-identity',
    error_code: 'private-provider-token-do-not-expose',
  };
  db.tables.presave_authorizations.push(job);
  const handler = createPresaveHandler({ db, env: TEST_ENV });
  const get = async () => {
    const response = await handler(request({ action: 'receipt', token, slug: 'test-release' }));
    assert.equal(response.status, 200);
    return response.json();
  };
  const pending = await get();
  assert.deepEqual(Object.keys(pending).sort(), ['saved_at', 'scheduled_for', 'status']);
  assert.equal(pending.status, 'pending');
  assert.equal(JSON.stringify(pending).includes('private'), false);
  job.token_expires_at = new Date(Date.now() - 1000).toISOString();
  assert.equal((await get()).status, 'expired');
  job.status = 'saved'; job.saved_at = new Date().toISOString();
  const saved = await get();
  assert.equal(saved.status, 'saved');
  assert.equal(saved.saved_at, job.saved_at);
  job.status = 'failed'; job.error_code = 'authorization_expired';
  const expired = await get();
  assert.equal(expired.status, 'expired');
  assert.equal(expired.error_code, 'authorization_expired');
});

test('OAuth handshake binds PKCE and one-use state to a browser cookie, and never exposes refresh tokens', async () => {
  const db = database([campaign()]);
  const providerCalls = [];
  const handler = createPresaveHandler({ db, env: TEST_ENV, fetchImpl: async (url, init) => {
    providerCalls.push({ url, init });
    if (url === 'https://accounts.spotify.com/api/token') return Response.json({ access_token: 'test-access-token', refresh_token: 'test-refresh-token', scope: 'user-library-modify user-read-private' });
    if (url === 'https://api.spotify.com/v1/me') return Response.json({ id: 'test-spotify-account' });
    throw new Error('Unexpected provider URL');
  } });
  const start = await handler(request({ action: 'authorize', slug: 'test-release', return_url: TEST_ENV.PRESAVE_PUBLIC_URL }));
  assert.equal(start.status, 200);
  const connectUrl = (await start.json()).url;
  const connect = await handler(new Request(connectUrl));
  assert.equal(connect.status, 303);
  const spotify = new URL(connect.headers.get('location'));
  assert.equal(spotify.origin, 'https://accounts.spotify.com');
  assert.equal(spotify.searchParams.get('code_challenge_method'), 'S256');
  assert.ok(spotify.searchParams.get('scope').includes('user-library-modify'));
  assert.equal((await handler(new Request(connectUrl))).status, 400);
  const state = spotify.searchParams.get('state');
  const callback = `${ENDPOINT}?action=callback&state=${state}&code=test-code`;
  assert.equal((await handler(new Request(callback))).status, 400);
  assert.equal((await handler(new Request(callback, { headers: { Cookie: `np_oauth_${state.slice(0, 12)}=${randomToken()}` } }))).status, 400);
  assert.equal(db.tables.presave_oauth_states.length, 1);
  const cookie = connect.headers.get('set-cookie').split(';')[0];
  const complete = await handler(new Request(callback, { headers: { Cookie: cookie } }));
  assert.equal(complete.status, 303);
  const returned = new URL(complete.headers.get('location'));
  assert.equal(returned.origin + returned.pathname, TEST_ENV.PRESAVE_PUBLIC_URL);
  assert.equal(returned.searchParams.get('presave'), 'success');
  assert.ok(new URLSearchParams(returned.hash.slice(1)).get('cancel'));
  assert.equal(returned.href.includes('test-refresh-token'), false);
  assert.equal(db.tables.presave_oauth_states.length, 0);
  const tokenBody = providerCalls[0].init.body;
  assert.equal(await pkceChallenge(tokenBody.get('code_verifier')), spotify.searchParams.get('code_challenge'));
  const accepted = db.calls.find((call) => call.name === 'presave_accept_authorization');
  assert.equal(accepted.args.p_campaign, CAMPAIGN);
  assert.equal(accepted.args.p_target, URI);
  assert.equal(accepted.args.p_token.includes('test-refresh-token'), false);
  assert.equal((await handler(new Request(callback, { headers: { Cookie: cookie } }))).status, 400);
  assert.equal(providerCalls.length, 2);
});

test('scheduler saves only the consented recording, clears successful tokens, and retries Spotify rate limits honestly', async () => {
  for (const providerStatus of [204, 429]) {
    const hash = 'a'.repeat(64);
    const db = database([campaign()]);
    db.tables.presave_authorizations.push({ id: crypto.randomUUID(), campaign_id: CAMPAIGN, spotify_user_hash: hash, target_uri: URI,
      refresh_token_ciphertext: await encrypt('old-refresh-token', TEST_ENV.PRESAVE_TOKEN_KEY, `spotify:${CAMPAIGN}:${hash}`),
      status: 'processing', claim_token: crypto.randomUUID(), attempts: 1 });
    const calls = [];
    const handler = createPresaveHandler({ db, env: TEST_ENV, fetchImpl: async (url, init) => {
      calls.push({ url, init });
      if (url === 'https://accounts.spotify.com/api/token') return Response.json({ access_token: 'test-access', refresh_token: 'rotated-refresh' });
      const endpoint = new URL(url);
      assert.equal(endpoint.origin + endpoint.pathname, 'https://api.spotify.com/v1/me/library');
      assert.equal(endpoint.searchParams.get('uris'), URI);
      assert.equal(init.method, 'PUT');
      return new Response(null, { status: providerStatus, headers: { 'Retry-After': '120' } });
    } });
    const response = await handler(request({ action: 'run' }, { 'x-presave-cron-secret': TEST_ENV.PRESAVE_CRON_SECRET }));
    assert.equal(response.status, 200);
    const result = await response.json();
    const job = db.tables.presave_authorizations[0];
    assert.equal(calls.length, 2);
    assert.equal(job.claim_token, null);
    if (providerStatus === 204) {
      assert.deepEqual(result, { processed: 1, results: { saved: 1 } });
      assert.equal(job.status, 'saved');
      assert.equal(job.refresh_token_ciphertext, null);
      assert.ok(job.saved_at);
    } else {
      assert.deepEqual(result, { processed: 1, results: { pending: 1 } });
      assert.equal(job.status, 'pending');
      assert.ok(Date.parse(job.next_attempt_at) >= Date.now() + 110000);
      assert.ok(job.refresh_token_ciphertext.startsWith('v1.'));
      assert.equal(job.refresh_token_ciphertext.includes('rotated-refresh'), false);
    }
  }
});
