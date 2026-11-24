import assert from 'node:assert/strict';
import test from 'node:test';
import { createPresaveHandler } from '../supabase/functions/presave/handler.mjs';
import { domainName, safeReturnUrl } from '../supabase/functions/presave/core.mjs';
import { checkDomain, dnsRecords, isApex, vercelProject, VERCEL_A, VERCEL_CNAME } from '../supabase/functions/presave/domains.mjs';
import { pathSlug, shareLink, vanityUrl } from '../public/presave/core.mjs';

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const CAMPAIGN = '33333333-3333-4333-8333-333333333333';
const OTHER = '44444444-4444-4444-8444-444444444444';
const ENDPOINT = 'https://example.supabase.co/functions/v1/presave';
const ENV = {
  SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-only-service-key',
  SPOTIFY_CLIENT_ID: 'test-client', PRESAVE_TOKEN_KEY: Buffer.alloc(32, 7).toString('base64'),
  PRESAVE_CRON_SECRET: 'test-only-scheduler-secret-at-least-32-chars',
  PRESAVE_PUBLIC_URL: 'https://nexus.example/presave/index.html',
};
const jwt = (sub = ALICE) => `test.${Buffer.from(JSON.stringify({ sub, aal: 'aal1' })).toString('base64url')}.sig`;
const request = (body, token) => new Request(ENDPOINT, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body),
});

function database(tables, rpcImpl = {}) {
  const filtersOf = [];
  class Query {
    constructor(table) { this.table = table; this.op = 'select'; this.filters = []; this.max = Infinity; }
    select() { return this; }
    eq(k, v) { this.filters.push((r) => r[k] === v); return this; }
    neq(k, v) { this.filters.push((r) => r[k] !== v); return this; }
    in(k, v) { this.filters.push((r) => v.includes(r[k])); return this; }
    limit(n) { this.max = n; return this; }
    upsert(value, options) { this.op = 'upsert'; this.value = value; this.conflict = options?.onConflict; return this; }
    update(value) { this.op = 'update'; this.value = value; return this; }
    delete() { this.op = 'delete'; return this; }
    async run(single) {
      const rows = tables[this.table] ||= [];
      let hit = rows.filter((r) => this.filters.every((f) => f(r)));
      if (this.op === 'upsert') {
        const index = rows.findIndex((r) => r[this.conflict] === this.value[this.conflict]);
        if (index >= 0) rows[index] = { ...rows[index], ...structuredClone(this.value) }; else rows.push(structuredClone(this.value));
        hit = [rows[index >= 0 ? index : rows.length - 1]];
      }
      if (this.op === 'update') hit.forEach((r) => Object.assign(r, structuredClone(this.value)));
      if (this.op === 'delete') tables[this.table] = rows.filter((r) => !hit.includes(r));
      hit = hit.slice(0, this.max);
      return { data: structuredClone(single ? hit[0] ?? null : hit), error: null };
    }
    maybeSingle() { return this.run(true); }
    single() { return this.run(true); }
    then(a, b) { return this.run(false).then(a, b); }
  }
  void filtersOf;
  return {
    tables,
    auth: { getUser: async (token) => ({ data: { user: token === jwt(ALICE) ? { id: ALICE } : token === jwt(BOB) ? { id: BOB } : null }, error: null }) },
    from: (t) => new Query(t),
    rpc: async (name, args) => {
      if (rpcImpl[name]) return rpcImpl[name](args, tables);
      if (name === 'presave_rate_limit') return { data: true, error: null };
      throw new Error(`Unexpected RPC ${name}`);
    },
  };
}
const world = () => ({ presave_campaigns: [{ id: CAMPAIGN, owner_id: ALICE, slug: 'test-release' }, { id: OTHER, owner_id: BOB, slug: 'bobs' }], presave_domains: [], profile_domains: [] });

// A DNS-over-HTTPS double: zone = { 'name|TYPE': ['value', …] }
const dns = (zone) => async (url) => {
  const query = new URL(url).searchParams;
  const type = query.get('type');
  const code = { A: 1, CNAME: 5, TXT: 16 }[type];
  const values = zone[`${query.get('name')}|${type}`] ?? [];
  return new Response(JSON.stringify({ Answer: values.map((data) => ({ type: code, data })) }), { status: 200 });
};

test('domainName normalizes input and rejects hosts that must never be claimed', () => {
  assert.equal(domainName('https://WWW.Music.Example.com/path?x=1'), 'music.example.com');
  assert.equal(domainName('example.com.'), 'example.com');
  for (const bad of ['localhost', 'nexus', '1.2.3.4', 'a b.com', 'x.com:8080', '', '-a.com']) assert.throws(() => domainName(bad), bad);
});

test('dnsRecords gives an A record for apex domains and a CNAME for subdomains', () => {
  assert.deepEqual(dnsRecords('yourname.com', 'tok').route, { type: 'A', name: '@', value: VERCEL_A });
  assert.deepEqual(dnsRecords('music.yourname.com', 'tok').route, { type: 'CNAME', name: 'music', value: VERCEL_CNAME });
  assert.deepEqual(dnsRecords('me.yourname.co.uk', 'tok').route, { type: 'CNAME', name: 'me', value: VERCEL_CNAME });
  assert.equal(isApex('yourname.co.uk'), true);
  assert.deepEqual(dnsRecords('music.yourname.com', 'tok').txt, { type: 'TXT', name: '_nexus-presave.music.yourname.com', value: 'nexus-presave-verify=tok' });
});

test('checkDomain moves pending → verified → live only with the right proof and routing', async () => {
  const proof = { '_nexus-presave.music.example.com|TXT': ['"nexus-presave-verify=abc"'] };
  assert.equal((await checkDomain({ domain: 'music.example.com', token: 'abc', fetchImpl: dns({}) })).status, 'pending');
  assert.equal((await checkDomain({ domain: 'music.example.com', token: 'abc', fetchImpl: dns({ '_nexus-presave.music.example.com|TXT': ['"nexus-presave-verify=other"'] }) })).status, 'pending');
  const unrouted = await checkDomain({ domain: 'music.example.com', token: 'abc', fetchImpl: dns(proof) });
  assert.equal(unrouted.status, 'verified');
  assert.match(unrouted.note, /CNAME music/);
  const routed = dns({ ...proof, 'music.example.com|CNAME': ['cname.vercel-dns.com.'] });
  assert.equal((await checkDomain({ domain: 'music.example.com', token: 'abc', fetchImpl: routed })).status, 'verified'); // no hosting hook configured
  const live = await checkDomain({ domain: 'music.example.com', token: 'abc', fetchImpl: routed, vercel: { add: async () => ({ ok: true }) } });
  assert.deepEqual(live, { status: 'live', note: null });
  const failed = await checkDomain({ domain: 'music.example.com', token: 'abc', fetchImpl: routed, vercel: { add: async () => ({ ok: false, note: 'nope' }) } });
  assert.deepEqual(failed, { status: 'verified', note: 'nope' });
});

test('vercelProject is off without credentials and sends team scope when set', async () => {
  assert.equal(vercelProject(() => undefined, fetch), null);
  const seen = [];
  const project = vercelProject((k) => ({ VERCEL_TOKEN: 't', VERCEL_PROJECT_ID: 'prj', VERCEL_TEAM_ID: 'team_1' })[k], async (url, init) => { seen.push([url, init.method]); return new Response('{}', { status: 200 }); });
  assert.deepEqual(await project.add('music.example.com'), { ok: true });
  await project.remove('music.example.com');
  assert.deepEqual(seen, [
    ['https://api.vercel.com/v10/projects/prj/domains?teamId=team_1', 'POST'],
    ['https://api.vercel.com/v9/projects/prj/domains/music.example.com?teamId=team_1', 'DELETE'],
  ]);
});

test('safeReturnUrl only accepts the configured page or the same path on a connected custom host', () => {
  const configured = ENV.PRESAVE_PUBLIC_URL;
  assert.equal(safeReturnUrl(null, configured), configured);
  assert.equal(safeReturnUrl('https://nexus.example/presave/index.html', configured), configured);
  assert.equal(safeReturnUrl('https://music.example.com/presave/index.html', configured, ['music.example.com']), 'https://music.example.com/presave/index.html');
  assert.throws(() => safeReturnUrl('https://music.example.com/presave/index.html', configured, []), 'host not connected');
  assert.throws(() => safeReturnUrl('https://music.example.com/presave/index.html', configured, ['other.example.com']), 'different host connected');
  for (const bad of [
    'https://evil.example/presave/index.html',
    'https://music.example.com/other', // wrong path
    'http://music.example.com/presave/index.html', // not https
    'https://music.example.com:8443/presave/index.html',
    'https://music.example.com/presave/index.html?x=1',
    'https://user:pw@music.example.com/presave/index.html',
  ]) assert.throws(() => safeReturnUrl(bad, configured, ['music.example.com']), bad);
});

test('domain actions need the campaign owner and never expose another creator’s campaign', async () => {
  const db = database(world());
  const handler = createPresaveHandler({ db, env: ENV, fetchImpl: dns({}) });
  for (const action of ['domain_get', 'domain_set', 'domain_verify', 'domain_remove']) {
    assert.equal((await handler(request({ action, id: CAMPAIGN, domain: 'music.example.com' }))).status, 401, action);
    assert.equal((await handler(request({ action, id: OTHER, domain: 'music.example.com' }, jwt(ALICE)))).status, 404, action);
  }
});

test('domain_set creates a pending claim with a fresh proof token and shows the DNS records', async () => {
  const db = database(world());
  const handler = createPresaveHandler({ db, env: ENV, fetchImpl: dns({}) });
  const response = await handler(request({ action: 'domain_set', id: CAMPAIGN, domain: 'https://Music.Example.com/' }, jwt()));
  assert.equal(response.status, 200);
  const { domain } = await response.json();
  assert.equal(domain.domain, 'music.example.com');
  assert.equal(domain.status, 'pending');
  assert.equal(domain.records.route.type, 'CNAME');
  assert.match(domain.records.txt.value, /^nexus-presave-verify=[a-f0-9]{32}$/);
  assert.equal(db.tables.presave_domains[0].owner_id, ALICE);
  // saving the same domain again keeps the proof token; a new domain restarts verification
  const token = db.tables.presave_domains[0].token;
  await handler(request({ action: 'domain_set', id: CAMPAIGN, domain: 'music.example.com' }, jwt()));
  assert.equal(db.tables.presave_domains[0].token, token);
  await handler(request({ action: 'domain_set', id: CAMPAIGN, domain: 'other.example.com' }, jwt()));
  assert.notEqual(db.tables.presave_domains[0].token, token);
  assert.equal(db.tables.presave_domains.length, 1);
});

test('a domain already live on another page or a Nexus profile cannot be claimed', async () => {
  const tables = world();
  tables.presave_domains.push({ campaign_id: OTHER, owner_id: BOB, domain: 'taken.example.com', token: 'x'.repeat(32), status: 'live' });
  tables.profile_domains.push({ user_id: BOB, domain: 'profile.example.com', status: 'verified' });
  const handler = createPresaveHandler({ db: database(tables), env: ENV, fetchImpl: dns({}) });
  for (const domain of ['taken.example.com', 'profile.example.com']) {
    const response = await handler(request({ action: 'domain_set', id: CAMPAIGN, domain }, jwt()));
    assert.equal(response.status, 409, domain);
    assert.equal((await response.json()).code, 'domain_taken');
  }
  // a merely pending claim by someone else does not block you
  tables.presave_domains.push({ campaign_id: OTHER, owner_id: BOB, domain: 'free.example.com', token: 'y'.repeat(32), status: 'pending' });
  assert.equal((await handler(request({ action: 'domain_set', id: CAMPAIGN, domain: 'free.example.com' }, jwt()))).status, 200);
});

test('domain_verify upgrades the claim when DNS proves ownership and routing', async () => {
  const tables = world();
  const db = database(tables);
  const zone = {};
  const handler = createPresaveHandler({ db, env: { ...ENV, VERCEL_TOKEN: 't', VERCEL_PROJECT_ID: 'p' }, fetchImpl: async (url, init) => {
    if (String(url).startsWith('https://api.vercel.com')) return new Response('{}', { status: 200 });
    return dns(zone)(url, init);
  } });
  await handler(request({ action: 'domain_set', id: CAMPAIGN, domain: 'music.example.com' }, jwt()));
  let result = await (await handler(request({ action: 'domain_verify', id: CAMPAIGN }, jwt()))).json();
  assert.equal(result.domain.status, 'pending');
  zone['_nexus-presave.music.example.com|TXT'] = [`"nexus-presave-verify=${tables.presave_domains[0].token}"`];
  result = await (await handler(request({ action: 'domain_verify', id: CAMPAIGN }, jwt()))).json();
  assert.equal(result.domain.status, 'verified');
  zone['music.example.com|CNAME'] = ['cname.vercel-dns.com.'];
  result = await (await handler(request({ action: 'domain_verify', id: CAMPAIGN }, jwt()))).json();
  assert.equal(result.domain.status, 'live');
  assert.ok(tables.presave_domains[0].verified_at);
});

test('removing a domain deletes the row and only releases hosting for proven domains', async () => {
  const tables = world();
  const calls = [];
  const handler = createPresaveHandler({ db: database(tables), env: { ...ENV, VERCEL_TOKEN: 't', VERCEL_PROJECT_ID: 'p' }, fetchImpl: async (url, init) => { calls.push(init?.method ?? 'GET'); return new Response('{}', { status: 200 }); } });
  tables.presave_domains.push({ campaign_id: CAMPAIGN, owner_id: ALICE, domain: 'music.example.com', token: 'z'.repeat(32), status: 'pending' });
  assert.equal((await handler(request({ action: 'domain_remove', id: CAMPAIGN }, jwt()))).status, 200);
  assert.deepEqual(calls, []); // a pending claimant never owned the hosting entry
  tables.presave_domains.push({ campaign_id: CAMPAIGN, owner_id: ALICE, domain: 'music.example.com', token: 'z'.repeat(32), status: 'live' });
  await handler(request({ action: 'domain_remove', id: CAMPAIGN }, jwt()));
  assert.deepEqual(calls, ['DELETE']);
  assert.equal(tables.presave_domains.length, 0);
});

test('the public page can be found by host name, and unknown hosts are a 404', async () => {
  const db = database(world(), {
    presave_slug_by_domain: ({ p_domain }) => ({ data: p_domain === 'music.example.com' ? 'test-release' : null, error: null }),
    presave_public: ({ p_slug }) => ({ data: p_slug === 'test-release' ? { slug: 'test-release', title: 'Release' } : null, error: null }),
  });
  const handler = createPresaveHandler({ db, env: ENV, fetchImpl: dns({}) });
  const found = await handler(request({ action: 'page', domain: 'https://WWW.music.example.com' }));
  assert.equal(found.status, 200);
  assert.equal((await found.json()).campaign.slug, 'test-release');
  assert.equal((await handler(request({ action: 'page', domain: 'nobody.example.com' }))).status, 404);
  assert.equal((await handler(request({ action: 'page', domain: 'localhost' }))).status, 404);
});

test('clean /p/<slug> endings only appear on the Nexus site and parse back safely', () => {
  assert.equal(vanityUrl('my-song', 'https://nexus.example/presave/index.html?x=1#y'), 'https://nexus.example/p/my-song');
  assert.equal(shareLink('my-song', 'https://nexus.example/presave/index.html'), 'https://nexus.example/p/my-song');
  assert.equal(shareLink('my-song', 'https://host.example/public/presave/index.html'), 'https://host.example/public/presave/index.html?slug=my-song');
  assert.equal(pathSlug('/p/my-song'), 'my-song');
  assert.equal(pathSlug('/p/my-song/'), 'my-song');
  for (const bad of ['/p/', '/p/ab', '/p/My-Song', '/p/a/b', '/p/-x-', '/presave/index.html', '/', null]) assert.equal(pathSlug(bad), null, String(bad));
});
