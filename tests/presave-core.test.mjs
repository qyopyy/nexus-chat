import assert from 'node:assert/strict';
import test from 'node:test';
import {
  HttpError, validateCampaign, httpsUrl, spotifyUri, safeReturnUrl,
  callbackReturn, publicCampaign, randomToken, sha256, pkceChallenge,
  encrypt, decrypt, retryPlan, oauthCookie, THEMES, DESIGN_DEFAULTS,
} from '../supabase/functions/presave/core.mjs';

const campaign = (overrides = {}) => ({
  slug: 'midnight-release', title: 'Midnight', artist: 'Test artist',
  release_at: '2027-01-20T18:00:00+01:00', ...overrides,
});
const rejectsInput = (fn) => assert.throws(fn, (error) => error instanceof HttpError && error.status === 400);

test('campaign input cannot assign ownership, counters, IDs, or server timestamps', () => {
  const result = validateCampaign(campaign({
    id: 'chosen-by-attacker', owner_id: 'somebody-else', views: 99999,
    created_at: '2020-01-01T00:00:00Z', presaves: 99999,
  }));
  for (const key of ['id', 'owner_id', 'views', 'created_at', 'presaves']) {
    assert.equal(Object.hasOwn(result, key), false, key);
  }
  assert.equal(result.release_at, '2027-01-20T17:00:00.000Z');
});

test('campaign validation rejects ambiguous flags, reserved URLs, unsupported layouts, and injected CSS', () => {
  for (const patch of [
    { published: 'false' }, { show_countdown: 'true' }, { slug: 'admin' },
    { slug: '../../other' }, { slug: 'two--hyphens' }, { layout: '<script>' },
    { theme: 'url(https://evil.example)' }, { accent: '#fff;background:url(https://evil.example)' },
    { title: 'x\u0000y' }, { artist: '   ' }, { description: 'x'.repeat(1201) },
  ]) rejectsInput(() => validateCampaign(campaign(patch)));
});

test('all curated and custom themes support complete appearance settings with backward-compatible defaults', () => {
  const defaults = validateCampaign(campaign());
  for (const [key, value] of Object.entries(DESIGN_DEFAULTS)) assert.equal(defaults[key], value, key);
  assert.equal(THEMES.length, 17);
  assert.equal(new Set(THEMES).size, THEMES.length);
  for (const theme of THEMES) {
    const result = validateCampaign(campaign({
      theme, background_url: 'https://images.example/background.jpg?size=large',
      background_overlay: 90, background_motion: false,
      background_color: '#AABBCC', text_color: '#001122', button_style: 'pill', font_style: 'editorial',
    }));
    assert.equal(result.theme, theme);
    assert.equal(result.background_url, 'https://images.example/background.jpg?size=large');
    assert.equal(result.background_overlay, 90);
    assert.equal(result.background_motion, false);
    assert.equal(result.background_color, '#aabbcc');
    assert.equal(result.text_color, '#001122');
    assert.equal(result.button_style, 'pill');
    assert.equal(result.font_style, 'editorial');
    const projection = publicCampaign(result);
    for (const key of Object.keys(DESIGN_DEFAULTS)) assert.equal(projection[key], result[key], key);
  }
  assert.equal(validateCampaign(campaign({ background_overlay: 0, button_style: 'square', font_style: 'mono' })).background_overlay, 0);
});

test('appearance validation rejects malformed images, arbitrary CSS, ambiguous toggles, and unbounded overlays', () => {
  for (const patch of [
    { background_url: 'javascript:alert(1)' }, { background_url: 'http://example.com/cover.jpg' },
    { background_url: 'https://user:password@example.com/cover.jpg' }, { background_url: 'data:image/png;base64,AAA' },
    { background_url: 'https://example.com/";color:red' }, { background_url: 'https://example.com/' + 'a'.repeat(2048) },
    { background_overlay: -1 }, { background_overlay: 91 }, { background_overlay: 55.5 },
    { background_overlay: '55' }, { background_overlay: null }, { background_overlay: false },
    { background_motion: 'false' }, { background_motion: null },
    { background_color: '#fff' }, { background_color: '#123456;color:red' }, { background_color: null },
    { text_color: 'red' }, { text_color: '#f5f5fb;background:url(https://evil.example)' },
    { button_style: 'url(https://evil.example)' }, { button_style: null }, { font_style: 'Comic Sans' },
  ]) rejectsInput(() => validateCampaign(campaign(patch)));
});

test('URL size is checked after Unicode expansion as well as before normalization', () => {
  const url = 'https://example.com/' + 'é'.repeat(400);
  assert.ok(url.length < 2048);
  assert.ok(new URL(url).href.length > 2048);
  rejectsInput(() => httpsUrl(url));
  rejectsInput(() => validateCampaign(campaign({ background_url: url })));
});

test('destinations reject executable schemes, credentials, injection characters, and malformed records', () => {
  for (const url of [
    'javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', '//evil.example',
    'http://example.com', 'https://user:pass@example.com', 'https://example.com/"onclick="x',
    'https://example.com\\@evil.example', 'https://example.com/a b',
  ]) rejectsInput(() => validateCampaign(campaign({ links: [{ label: 'Listen', url }] })));
  for (const links of [{ url: 'https://example.com' }, [null], [{ label: 'Listen' }], [{ label: '', url: 'https://example.com' }]]) {
    rejectsInput(() => validateCampaign(campaign({ links })));
  }
  assert.equal(httpsUrl('https://example.com/track?a=b#time'), 'https://example.com/track?a=b#time');
});

test('Spotify accepts only real-shaped album or track identifiers from the exact provider host', () => {
  const id = '0123456789ABCDEFGHIJKL';
  assert.equal(spotifyUri(`https://open.spotify.com/intl-hu/track/${id}?si=share`), `spotify:track:${id}`);
  assert.equal(spotifyUri(`spotify:album:${id}`), `spotify:album:${id}`);
  for (const url of [
    `https://open.spotify.com.evil.example/track/${id}`, `https://evil.example/track/${id}`,
    `https://user@open.spotify.com/track/${id}`, `https://open.spotify.com:444/track/${id}`,
    `https://open.spotify.com/artist/${id}`, 'spotify:track:short',
  ]) rejectsInput(() => spotifyUri(url));
  rejectsInput(() => validateCampaign(campaign({ release_at: null, spotify_uri: `spotify:track:${id}` })));
});

test('release timestamps must identify an actual instant with an explicit timezone', () => {
  for (const release_at of ['2027-01-20', '2027-01-20T18:00:00', 'tomorrow', '2027-13-01T00:00:00Z', '2027-02-30T00:00:00Z', '2027-02-29T12:00:00Z', '2027-01-20T24:00:00Z', '2027-01-20T12:00:00+14:30', {}]) {
    rejectsInput(() => validateCampaign(campaign({ release_at })));
  }
  assert.equal(validateCampaign(campaign({ release_at: '2028-02-29T12:00:00Z' })).release_at, '2028-02-29T12:00:00.000Z');
});

test('public campaign projection excludes credentials, internal IDs, private metadata, and job data', () => {
  const projected = publicCampaign({
    ...validateCampaign(campaign()), id: 'internal-id', owner_id: 'owner-id',
    refresh_token_ciphertext: 'encrypted-secret', access_token: 'secret',
    error_code: 'private-error', cancel_hash: 'cancel-secret', published: true,
    created_at: 'private-timestamp',
  });
  for (const secret of ['internal-id', 'owner-id', 'encrypted-secret', 'private-error', 'cancel-secret', 'private-timestamp']) {
    assert.equal(JSON.stringify(projected).includes(secret), false, secret);
  }
  assert.equal(Object.hasOwn(projected, 'published'), false);
  assert.equal(projected.slug, 'midnight-release');
});

test('OAuth return URLs cannot redirect to another origin, path, or query-controlled destination', () => {
  const configured = 'https://nexus.example/presave/index.html';
  assert.equal(safeReturnUrl(null, configured), configured);
  assert.equal(safeReturnUrl(configured, configured), configured);
  for (const requested of [
    'https://evil.example/presave/index.html', 'https://nexus.example/api/delete',
    `${configured}?next=https://evil.example`, `${configured}#secret`,
    'https://user@nexus.example/presave/index.html', '/presave/index.html',
  ]) rejectsInput(() => safeReturnUrl(requested, configured));
  assert.throws(() => safeReturnUrl(null, `${configured}?misconfigured=yes`), (error) => error.status === 503);
});

test('cancellation capability is returned only in the fragment and OAuth cookies are protected', () => {
  const token = randomToken();
  const result = new URL(callbackReturn('https://nexus.example/presave/index.html', 'midnight-release', 'success', token));
  assert.equal(result.searchParams.get('slug'), 'midnight-release');
  assert.equal(result.search.includes(token), false);
  assert.equal(new URLSearchParams(result.hash.slice(1)).get('cancel'), token);
  const cookie = oauthCookie(randomToken(), randomToken());
  for (const attribute of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/functions/v1/presave']) assert.ok(cookie.includes(attribute));
  assert.throws(() => oauthCookie(randomToken(), 'bad; injected=value'));
});

test('PKCE challenge matches RFC 7636, and stored OAuth secrets use hashes', async () => {
  assert.equal(await pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  const token = randomToken();
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.match(await sha256(token), /^[a-f0-9]{64}$/);
  assert.notEqual(await sha256(token), token);
  assert.notEqual(randomToken(), token);
});

test('encrypted refresh tokens cannot be decrypted under another authorization purpose, key, or modified payload', async () => {
  const secret = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64');
  const otherSecret = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64');
  const encrypted = await encrypt('refresh-token-secret', secret, 'authorization:alice');
  assert.equal(await decrypt(encrypted, secret, 'authorization:alice'), 'refresh-token-secret');
  assert.equal(encrypted.includes('refresh-token-secret'), false);
  assert.notEqual(await encrypt('refresh-token-secret', secret, 'authorization:alice'), encrypted);
  await assert.rejects(decrypt(encrypted, secret, 'authorization:bob'));
  await assert.rejects(decrypt(encrypted, otherSecret, 'authorization:alice'));
  const parts = encrypted.split('.');
  const bytes = Buffer.from(parts[2], 'base64');
  bytes[0] ^= 1;
  parts[2] = bytes.toString('base64');
  await assert.rejects(decrypt(parts.join('.'), secret, 'authorization:alice'));
  await assert.rejects(encrypt('secret', 'not-a-valid-256-bit-key', 'purpose'), (error) => error.status === 503);
});

test('provider rate limits defer work while permanent failures and exhausted retries stop retrying', () => {
  const now = Date.parse('2027-01-20T12:00:00Z');
  assert.deepEqual(retryPlan(429, 1, '3600', now), { status: 'pending', next_attempt_at: '2027-01-20T13:00:00.000Z' });
  assert.equal(retryPlan(429, 1, '999999999', now).next_attempt_at, '2027-01-21T12:00:00.000Z');
  for (const status of [400, 401, 403]) assert.deepEqual(retryPlan(status, 1, null, now), { status: 'failed', next_attempt_at: null });
  assert.deepEqual(retryPlan(503, 15, null, now), { status: 'failed', next_attempt_at: null });
  assert.equal(retryPlan(404, 1, null, now).status, 'pending');
});
