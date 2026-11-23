import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const qaPackage = process.env.NEXUS_DROP_QA_PACKAGE || process.env.PRESAVE_QA_PACKAGE;
let transformSync;
try { ({ transformSync } = createRequire(qaPackage || import.meta.url)('esbuild')); }
catch (error) { if (qaPackage) throw error; }
const skip = !transformSync && 'Install esbuild in an isolated directory and set NEXUS_DROP_QA_PACKAGE (or PRESAVE_QA_PACKAGE) to its package.json.';
const row = { id: 'drop-1', path: 'owner/mix.wav', name: 'mix.wav' };
let compiled;

async function harness({ blocked = false, signedError = null, claimError = null, inboxError = null } = {}) {
  compiled ||= transformSync(await readFile(new URL('../src/lib/nexusDrop.ts', import.meta.url), 'utf8'), { loader: 'ts', format: 'cjs', target: 'es2022' }).code;
  const events = [];
  let releaseUrl;
  const waitingForUrl = new Promise((resolve) => { releaseUrl = resolve; });
  const tab = {
    closed: false, opener: {},
    location: { replace(url) { events.push(['navigate', url]); } },
    close() { this.closed = true; events.push(['close']); },
  };
  const table = {
    update(value) { events.push(['claim', value]); return this; },
    select() { return this; }, eq() { return this; },
    is() { return this; }, gt() { return this; }, order() { return this; },
    limit: async () => ({ data: [{ id: 'other', from_device: 'other-device' }, { id: 'self', from_device: 'this-device' }], error: inboxError }),
    then(resolve) { return Promise.resolve({ error: claimError }).then(resolve); },
  };
  const supabase = {
    from: () => table,
    storage: { from: () => ({ createSignedUrl: async () => {
      events.push(['sign', tab.opener]);
      await waitingForUrl;
      return { data: signedError ? null : { signedUrl: 'https://storage.example/signed/mix.wav' }, error: signedError };
    } }) },
  };
  const module = { exports: {} };
  runInNewContext(compiled, {
    module, exports: module.exports, Date,
    window: { open(...args) { events.push(['open', ...args]); return blocked ? null : tab; } },
    require(name) {
      if (name === './supabase') return { supabase, errorText: (error) => error?.message || 'Something went wrong' };
      if (name === './storageUpload') return { xhrStorageUpload: async () => {} };
      if (name === './malwareGuard') return { scanUpload: async () => ({ ok: true }) };
      if (name === '@/store/app') return { useApp: { getState: () => ({ userId: 'owner' }) } };
      if (name === './handset') return { thisDeviceId: () => 'this-device' };
      throw new Error(`Unexpected import ${name}`);
    },
  });
  return { api: module.exports, events, tab, releaseUrl };
}

test('Drop reserves and detaches a tab synchronously, then navigates before claiming', { skip }, async () => {
  const app = await harness();
  const task = app.api.openAndClaimDrop(row);
  assert.deepEqual(app.events, [['open', 'about:blank', '_blank'], ['sign', null]]);
  assert.equal(app.tab.opener, null);
  app.releaseUrl();
  assert.equal(await task, 'https://storage.example/signed/mix.wav');
  assert.deepEqual(app.events.map(([event]) => event), ['open', 'sign', 'navigate', 'claim']);
  assert.equal(app.tab.closed, false);
});

test('a blocked tab reports the problem without requesting a URL or claiming the Drop', { skip }, async () => {
  const app = await harness({ blocked: true });
  await assert.rejects(app.api.openAndClaimDrop(row), /Allow pop-ups.*still in your inbox/);
  assert.deepEqual(app.events, [['open', 'about:blank', '_blank']]);
});

test('a signed URL failure closes the unused tab and keeps the Drop unclaimed', { skip }, async () => {
  const app = await harness({ signedError: { message: 'File is unavailable' } });
  const task = app.api.openAndClaimDrop(row);
  app.releaseUrl();
  await assert.rejects(task, /File is unavailable/);
  assert.deepEqual(app.events.map(([event]) => event), ['open', 'sign', 'close']);
});

test('closing the reserved tab during preparation never consumes the Drop', { skip }, async () => {
  const app = await harness();
  const task = app.api.openAndClaimDrop(row);
  app.tab.closed = true;
  app.releaseUrl();
  await assert.rejects(task, /tab was closed.*still in your inbox/);
  assert.equal(app.events.some(([event]) => event === 'claim' || event === 'navigate'), false);
});

test('a failed inbox acknowledgement leaves the download open and explains what failed', { skip }, async () => {
  const app = await harness({ claimError: { message: 'Network unavailable' } });
  const task = app.api.openAndClaimDrop(row);
  app.releaseUrl();
  await assert.rejects(task, /download opened.*couldn't update your inbox: Network unavailable/);
  assert.equal(app.tab.closed, false);
  assert.equal(app.events.some(([event]) => event === 'close'), false);
});

test('the Drop inbox surfaces service errors and filters this device only after a successful query', { skip }, async () => {
  const failed = await harness({ inboxError: { message: 'Inbox unavailable' } });
  await assert.rejects(failed.api.incomingDrops(), /Inbox unavailable/);
  const app = await harness();
  assert.deepEqual((await app.api.incomingDrops()).map((drop) => drop.id), ['other']);
});
