import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import * as core from '../public/presave/core.mjs';

let JSDOM, VirtualConsole, transformSync;
try {
  const require = createRequire(process.env.PRESAVE_QA_PACKAGE || import.meta.url);
  ({ JSDOM, VirtualConsole } = require('jsdom'));
  ({ transformSync } = require('esbuild'));
} catch (error) {
  if (process.env.PRESAVE_QA_PACKAGE) throw error;
}
const skip = !JSDOM && 'Install jsdom and esbuild in an isolated directory and set PRESAVE_QA_PACKAGE to its package.json (see tests/README.md).';
let compiledApp;

async function appHarness({ query = '', receipt = null, receiptError = false } = {}) {
  if (!compiledApp) compiledApp = transformSync(await readFile(new URL('../public/presave/app.mjs', import.meta.url), 'utf8'), { format: 'cjs', target: 'es2022', sourcefile: 'public/presave/app.mjs' }).code;
  const html = await readFile(new URL('../public/presave/index.html', import.meta.url), 'utf8');
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error) => errors.push(error.message));
  const dom = new JSDOM(html, {
    url: `https://nexus.example/public/presave/index.html${query}`,
    runScripts: 'outside-only', virtualConsole,
  });
  const { window } = dom;
  const calls = [];
  const release = core.newCampaign({
    slug: 'test-release', title: 'Test release', artist: 'Test artist', published: true,
    spotify_uri: 'spotify:track:0123456789ABCDEFGHIJKL', release_at: new Date(Date.now() + 86400000).toISOString(),
  });
  window.scrollTo = () => {};
  window.HTMLElement.prototype.scrollIntoView = () => {};
  window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new window.Event('close')); };
  window.structuredClone = structuredClone;
  window.NEXUS_PRESAVE_CONFIG = { supabaseUrl: 'https://example.supabase.co', supabaseKey: 'test-only-public-key' };
  window.fetch = async () => { throw new Error('Unexpected network request: DOM tests must stay offline'); };
  window.addEventListener('error', (event) => { errors.push(event.error?.message || event.message); event.preventDefault(); });
  const auth = {
    configured: true,
    client: { auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    } },
    needsMfa: async () => false,
    uploadArtwork: async () => { throw new Error('Unexpected upload'); },
    api: async (action, payload) => {
      calls.push({ action, payload: structuredClone(payload) });
      if (action === 'config') return { public_url: 'https://nexus.example/public/presave/index.html', spotify_configured: true };
      if (action === 'page') return { campaign: structuredClone(release), spotify_configured: true };
      if (action === 'track') return { ok: true };
      if (action === 'receipt') {
        if (receiptError) throw Object.assign(new Error('Receipt not found'), { status: 404 });
        return receipt;
      }
      throw new Error(`Unexpected API action: ${action}`);
    },
  };
  window.require = (name) => {
    if (name === './core.mjs') return core;
    if (name === './auth.mjs') return auth;
    throw new Error(`Unexpected module: ${name}`);
  };
  window.eval(`${compiledApp}\n//# sourceURL=nexus-presave-dom-test.js`);
  const settle = async () => { for (let i = 0; i < 3; i += 1) await new Promise((resolve) => setTimeout(resolve, 0)); };
  const click = async (selector) => {
    const element = window.document.querySelector(selector);
    assert.ok(element, `Missing click target ${selector}`);
    element.click();
    await settle();
  };
  const fill = async (name, value) => {
    const input = window.document.querySelector(`#campaign-form [name="${name}"]`);
    assert.ok(input, `Missing campaign field ${name}`);
    input.value = value;
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    await settle();
  };
  await settle();
  return { window, document: window.document, calls, errors, click, fill, settle, close: () => dom.window.close() };
}

test('real dashboard and editor wire live previews, input validation, and signed-out save to authentication', { skip }, async (t) => {
  const app = await appHarness(); t.after(app.close);
  assert.equal(app.document.querySelector('h1').textContent, 'Your campaigns');
  await app.click('[data-action="create"]');
  assert.ok(app.document.querySelector('#campaign-form'));
  await app.fill('artist', 'Demo artist');
  await app.fill('title', '<script>alert("unsafe")</script>');
  assert.equal(app.document.querySelector('#release-preview .release-title').textContent, '<script>alert("unsafe")</script>');
  assert.equal(app.document.querySelector('#release-preview script'), null);
  await app.fill('accent', '#a3e6c5');
  assert.equal(app.document.querySelector('#release-preview .release-page').style.getPropertyValue('--campaign-accent'), '#a3e6c5');
  await app.fill('title', '');
  await app.click('[data-action="save-draft"]');
  assert.match(app.document.querySelector('#error-title').textContent, /release title/i);
  assert.equal(app.document.querySelector('#auth-dialog').open, false);
  await app.fill('title', 'Midnight');
  await app.click('[data-action="save-draft"]');
  assert.equal(app.document.querySelector('#auth-dialog').open, true);
  assert.equal(app.document.querySelector('#auth-form').dataset.mode, 'login');
  assert.equal(app.document.querySelector('#campaign-form [name="title"]').value, 'Midnight');
  assert.equal(app.calls.some((call) => call.action === 'save'), false);
  assert.deepEqual(app.errors, []);
});

test('real template selection applies the chosen look and unsaved navigation requires an explicit discard', { skip }, async (t) => {
  const app = await appHarness(); t.after(app.close);
  await app.click('[data-action="navigate"][data-view="templates"]');
  await app.click('[data-action="template"][data-template="2"]');
  assert.equal(app.document.querySelector('#campaign-form [name="theme"]:checked').value, 'aurora');
  assert.equal(app.document.querySelector('#campaign-form [name="layout"]').value, 'split');
  assert.equal(app.document.querySelector('#release-preview .release-page').dataset.theme, 'aurora');
  assert.equal(app.document.querySelector('#campaign-form [name="title"]').value, '');
  await app.fill('title', 'Unsaved release');
  await app.click('[data-action="navigate"][data-view="campaigns"]');
  assert.equal(app.document.querySelector('#confirm-dialog').open, true);
  await app.click('#confirm-dialog [data-confirm="no"]');
  assert.equal(app.document.querySelector('#campaign-form [name="title"]').value, 'Unsaved release');
  await app.click('[data-action="navigate"][data-view="campaigns"]');
  await app.click('#confirm-dialog [data-confirm="yes"]');
  assert.equal(app.document.querySelector('h1').textContent, 'Your campaigns');
  assert.equal(app.document.querySelector('#campaign-form'), null);
  assert.deepEqual(app.errors, []);
});

test('user-controlled success query and bogus cancellation capability cannot manufacture a confirmed pre-save', { skip }, async () => {
  const token = 'x'.repeat(43);
  for (const query of ['?slug=test-release&presave=success', `?slug=test-release&presave=success#cancel=${token}`]) {
    const app = await appHarness({ query, receiptError: true });
    try {
      const feedback = app.document.querySelector('#public-feedback').textContent;
      assert.match(feedback, /can.t verify|couldn.t verify/i);
      assert.doesNotMatch(feedback, /authorization is registered|was saved to your/i);
      assert.equal(app.document.querySelector('[data-action="cancel-presave"]'), null);
      assert.equal(app.window.location.hash, '');
      assert.deepEqual(app.errors, []);
    } finally { app.close(); }
  }
});

test('verified receipt status controls public confirmation and pending-only cancellation controls', { skip }, async () => {
  const token = 'y'.repeat(43);
  for (const status of ['pending', 'saved']) {
    const app = await appHarness({ query: `?slug=test-release&presave=success#cancel=${token}`, receipt: { status } });
    try {
      const call = app.calls.find((entry) => entry.action === 'receipt');
      assert.equal(call.payload.token, token);
      assert.equal(call.payload.slug, 'test-release');
      const feedback = app.document.querySelector('#public-feedback').textContent;
      assert.match(feedback, status === 'pending' ? /authorization is registered/i : /was saved to your Spotify library/i);
      assert.equal(Boolean(app.document.querySelector('[data-action="cancel-presave"]')), status === 'pending');
      assert.equal(app.window.location.hash, '');
      assert.equal(app.window.sessionStorage.getItem('nexus-presave-cancel:test-release'), token);
      assert.deepEqual(app.errors, []);
    } finally { app.close(); }
  }
});
