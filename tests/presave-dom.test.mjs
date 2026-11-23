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

async function appHarness({ query = '', receipt = null, receiptError = false, signedIn = false, releaseOverrides = {}, uploadError = '' } = {}) {
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
  const saved = [];
  const session = signedIn ? { user: { id: '00000000-0000-4000-8000-000000000001', email: 'creator@example.test' } } : null;
  const release = core.newCampaign({
    slug: 'test-release', title: 'Test release', artist: 'Test artist', published: true,
    spotify_uri: 'spotify:track:0123456789ABCDEFGHIJKL', release_at: new Date(Date.now() + 86400000).toISOString(), ...releaseOverrides,
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
      getSession: async () => ({ data: { session } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    } },
    needsMfa: async () => false,
    uploadArtwork: async (file, userId) => {
      calls.push({ action: 'upload', payload: { name: file.name, size: file.size, type: file.type, userId } });
      if (uploadError) throw new Error(uploadError);
      return 'https://storage.example.test/creator/background.webp';
    },
    api: async (action, payload) => {
      calls.push({ action, payload: structuredClone(payload) });
      if (action === 'config') return { public_url: 'https://nexus.example/public/presave/index.html', spotify_configured: true };
      if (action === 'page') return { campaign: structuredClone(release), spotify_configured: true };
      if (action === 'track') return { ok: true };
      if (action === 'list') return { campaigns: structuredClone(saved), total: saved.length, summary: { campaigns: saved.length } };
      if (action === 'save') {
        const campaign = { ...structuredClone(payload.campaign), id: payload.campaign.id || `campaign-${saved.length + 1}` };
        const index = saved.findIndex((entry) => entry.id === campaign.id);
        if (index < 0) saved.push(campaign); else saved[index] = campaign;
        return { campaign: structuredClone(campaign) };
      }
      if (action === 'duplicate') {
        const original = saved.find((entry) => entry.id === payload.id);
        const campaign = { ...structuredClone(original), id: `campaign-${saved.length + 1}`, slug: original.slug + '-copy', published: false };
        saved.push(campaign);
        return { campaign: structuredClone(campaign) };
      }
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
  const upload = async (id, { type = 'image/webp', size = 100, name = 'scene.webp' } = {}) => {
    const input = window.document.getElementById(id);
    assert.ok(input, `Missing upload ${id}`);
    const file = new window.File(['image'], name, { type });
    Object.defineProperty(file, 'size', { value: size });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new window.Event('change', { bubbles: true }));
    await settle();
  };
  await settle();
  return { window, document: window.document, calls, errors, click, fill, upload, settle, close: () => dom.window.close() };
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

test('appearance edits survive save, reopen and duplication with the same preview as a public page', { skip }, async (t) => {
  const app = await appHarness({ signedIn: true }); t.after(app.close);
  await app.click('[data-action="create"]');
  assert.equal(app.document.querySelectorAll('[name="theme"]').length, 17);
  await app.fill('title', 'Across the stars');
  await app.fill('artist', 'Nexus artist');
  await app.click('[name="theme"][value="galaxy"]');
  await app.fill('background_url', 'https://images.example.test/galaxy.webp');
  await app.fill('background_overlay', '68');
  await app.click('[name="background_motion"]');
  await app.fill('button_style', 'pill');
  await app.fill('font_style', 'editorial');
  await app.fill('background_color', '#17132a');
  await app.fill('text_color', '#faf4ff');
  let preview = app.document.querySelector('#release-preview .release-page');
  assert.equal(preview.dataset.theme, 'galaxy');
  assert.equal(preview.dataset.motion, 'false');
  assert.equal(preview.dataset.buttonStyle, 'pill');
  assert.equal(preview.dataset.fontStyle, 'editorial');
  assert.equal(preview.style.getPropertyValue('--background-shade'), '0.68');
  assert.equal(preview.querySelector('.background-image').getAttribute('src'), 'https://images.example.test/galaxy.webp');
  assert.equal(preview.querySelectorAll('.stars').length, 2);
  await app.click('[data-action="save-draft"]');
  const saved = app.calls.find((call) => call.action === 'save').payload.campaign;
  for (const [key, expected] of Object.entries({ theme: 'galaxy', background_url: 'https://images.example.test/galaxy.webp', background_overlay: 68, background_motion: false, background_color: '#17132a', text_color: '#faf4ff', button_style: 'pill', font_style: 'editorial' })) assert.equal(saved[key], expected, key);
  await app.click('[data-action="navigate"][data-view="campaigns"]');
  await app.click('[data-action="edit"][data-id="campaign-1"]');
  assert.equal(app.document.querySelector('[name="background_overlay"]').value, '68');
  assert.equal(app.document.querySelector('[name="background_motion"]').checked, false);
  assert.equal(app.document.querySelector('[name="background_url"]').value, saved.background_url);
  await app.click('[data-action="navigate"][data-view="campaigns"]');
  await app.click('[data-action="duplicate"][data-id="campaign-1"]');
  preview = app.document.querySelector('#release-preview .release-page');
  assert.equal(preview.dataset.theme, 'galaxy');
  assert.equal(preview.dataset.fontStyle, 'editorial');
  assert.equal(preview.style.getPropertyValue('--background-shade'), '0.68');
  assert.equal(app.document.querySelector('[name="published"]').checked, false);
  assert.deepEqual(app.errors, []);

  const publicPage = await appHarness({ query: '?slug=test-release', releaseOverrides: saved }); t.after(publicPage.close);
  const published = publicPage.document.querySelector('.release-page');
  assert.equal(published.dataset.theme, preview.dataset.theme);
  assert.equal(published.dataset.motion, 'false');
  assert.equal(published.dataset.buttonStyle, 'pill');
  assert.equal(published.querySelector('.background-image').getAttribute('src'), saved.background_url);
  assert.deepEqual(publicPage.errors, []);
});

test('custom colors, responsive full preview and appearance reset leave release content intact', { skip }, async (t) => {
  const app = await appHarness(); t.after(app.close);
  await app.click('[data-action="create"]');
  await app.fill('title', 'Keep my title');
  await app.fill('artist', 'Keep my artist');
  await app.fill('artwork_url', 'https://images.example.test/cover.jpg');
  await app.click('[name="theme"][value="custom"]');
  assert.equal(app.document.querySelector('#custom-palette').hidden, false);
  await app.fill('background_color', '#808080');
  await app.fill('text_color', '#808080');
  assert.match(app.document.querySelector('#contrast-help').textContent, /1.0:1/);
  assert.equal(app.document.querySelector('#contrast-help').classList.contains('contrast-warning'), true);
  await app.fill('text_color', '#000000');
  await app.fill('button_style', 'square');
  await app.click('[data-action="expand-preview"]');
  assert.equal(app.document.querySelector('#confirm-dialog').open, true);
  assert.equal(app.document.querySelector('.full-preview-frame').dataset.size, 'mobile');
  await app.click('[data-action="preview-size"][data-size="desktop"]');
  assert.equal(app.document.querySelector('.full-preview-frame').dataset.size, 'desktop');
  assert.equal(app.document.querySelector('.full-preview-frame .release-title').textContent, 'Keep my title');
  assert.equal(app.document.querySelectorAll('[id="preview-feedback"]').length, 0);
  await app.click('#confirm-dialog [data-close-dialog]');
  await app.click('[data-action="reset-appearance"]');
  assert.equal(app.document.querySelector('[name="title"]').value, 'Keep my title');
  assert.equal(app.document.querySelector('[name="artist"]').value, 'Keep my artist');
  assert.equal(app.document.querySelector('[name="artwork_url"]').value, 'https://images.example.test/cover.jpg');
  assert.equal(app.document.querySelector('[name="theme"]:checked').value, 'midnight');
  assert.equal(app.document.querySelector('[name="background_color"]').value, '#101019');
  assert.equal(app.document.querySelector('[name="button_style"]').value, 'rounded');
  assert.deepEqual(app.errors, []);
});

test('background uploads validate type and size, expose failures, and update the saved design only after success', { skip }, async (t) => {
  const app = await appHarness({ signedIn: true }); t.after(app.close);
  await app.click('[data-action="create"]');
  for (const invalid of [{ type: 'image/svg+xml' }, { size: 0 }, { size: 5 * 1024 * 1024 + 1 }]) {
    await app.upload('background-file', invalid);
    assert.match(app.document.querySelector('#background-upload-status').textContent, /nonempty JPG, PNG, or WebP/);
  }
  assert.equal(app.calls.some((call) => call.action === 'upload'), false);
  await app.upload('background-file');
  assert.equal(app.calls.filter((call) => call.action === 'upload').length, 1);
  assert.equal(app.document.querySelector('[name="background_url"]').value, 'https://storage.example.test/creator/background.webp');
  assert.match(app.document.querySelector('#background-upload-status').textContent, /Save the campaign/);
  assert.equal(app.document.querySelector('#background-file').disabled, false);
  assert.equal(app.calls.some((call) => call.action === 'save'), false);
  await app.click('[data-action="remove-background"]');
  assert.equal(app.document.querySelector('[name="background_url"]').value, '');
  assert.equal(app.document.querySelector('#release-preview .background-image'), null);
  assert.deepEqual(app.errors, []);

  const failure = await appHarness({ signedIn: true, uploadError: 'Storage temporarily unavailable' }); t.after(failure.close);
  await failure.click('[data-action="create"]');
  await failure.fill('background_url', 'https://images.example.test/existing.jpg');
  await failure.upload('background-file');
  assert.match(failure.document.querySelector('#background-upload-status').textContent, /Storage temporarily unavailable/);
  assert.equal(failure.document.querySelector('[name="background_url"]').value, 'https://images.example.test/existing.jpg');
  assert.equal(failure.document.querySelector('#background-file').disabled, false);
  assert.deepEqual(failure.errors, []);
});

test('unsafe backgrounds never enter page markup and unavailable images fall back to the selected theme', { skip }, async (t) => {
  const app = await appHarness({ query: '?slug=test-release', releaseOverrides: { theme: 'galaxy', background_url: 'https://example.test/image\"><script>bad()</script>', background_color: '#fff;position:fixed', button_style: 'pill\" autofocus' } }); t.after(app.close);
  const page = app.document.querySelector('.release-page');
  assert.equal(page.querySelector('.background-image'), null);
  assert.equal(page.querySelector('script'), null);
  assert.equal(page.dataset.buttonStyle, 'rounded');
  assert.equal(page.style.getPropertyValue('--custom-background'), '#101019');
  assert.deepEqual(app.errors, []);

  const broken = await appHarness({ query: '?slug=test-release', releaseOverrides: { theme: 'galaxy', background_url: 'https://images.example.test/broken.webp' } }); t.after(broken.close);
  const image = broken.document.querySelector('.background-image');
  image.dispatchEvent(new broken.window.Event('error'));
  assert.equal(broken.document.querySelector('.background-image'), null);
  assert.equal(broken.document.querySelector('.background-shade'), null);
  assert.equal(broken.document.querySelector('.release-page').dataset.theme, 'galaxy');
  assert.equal(broken.document.querySelector('.release-page').classList.contains('has-background-image'), false);
  assert.deepEqual(broken.errors, []);
});
