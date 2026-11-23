import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import * as core from '../public/drop/core.mjs';

const qaPackage = process.env.NEXUS_DROP_QA_PACKAGE || process.env.PRESAVE_QA_PACKAGE;
let JSDOM, VirtualConsole, transformSync;
try {
  const require = createRequire(qaPackage || import.meta.url);
  ({ JSDOM, VirtualConsole } = require('jsdom'));
  ({ transformSync } = require('esbuild'));
} catch (error) { if (qaPackage) throw error; }
const skip = !JSDOM && 'Install jsdom/esbuild and set NEXUS_DROP_QA_PACKAGE to the isolated package.json.';
const PEER = '11111111-1111-4111-8111-111111111111';
let compiled;

async function harness({ supported = true, deferStart = false } = {}) {
  compiled ||= transformSync(await readFile(new URL('../public/drop/app.mjs', import.meta.url), 'utf8'), { format: 'cjs', target: 'es2022' }).code;
  const errors = [], rooms = [], transfers = [], objectUrls = [], revoked = [], copies = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM(await readFile(new URL('../public/drop/index.html', import.meta.url), 'utf8'), {
    url: 'https://nexus.example/drop/index.html', runScripts: 'outside-only', virtualConsole,
  });
  const { window } = dom;
  Object.defineProperty(window, 'isSecureContext', { value: supported });
  Object.defineProperty(window, 'crypto', { value: crypto });
  window.RTCPeerConnection = supported ? function () {} : undefined;
  window.matchMedia = () => ({ matches: true });
  window.HTMLElement.prototype.scrollIntoView = () => {};
  Object.defineProperty(window.navigator, 'clipboard', { value: { writeText: async value => { copies.push(value); } } });
  window.URL.createObjectURL = () => { const url = `blob:https://nexus.example/${objectUrls.length}`; objectUrls.push(url); return url; };
  window.URL.revokeObjectURL = url => revoked.push(url);
  window.addEventListener('error', event => { errors.push(event.error?.message || event.message); event.preventDefault(); });

  class RoomAdapter {
    constructor(options) { this.options = options; this.closed = false; this.closeCount = 0; rooms.push(this); }
    async start() {
      this.options.onStatus('offline');
      if (deferStart) await new Promise(resolve => { this.releaseStart = resolve; });
    }
    async close() { this.closed = true; this.closeCount++; }
    async rename() {}
    async send() {}
    peers(peers) { this.options.onPeers(peers); }
  }
  class TransferAdapter {
    constructor(options) { this.options = options; this.current = null; this.accepted = 0; this.cancelled = 0; this.requests = []; transfers.push(this); }
    change(current) { this.current = current; this.options.onChange(current); }
    async request(peer, content) {
      this.requests.push({ peer, content });
      const manifest = content.files ? core.fileManifest(content.files) : core.validateManifest({ kind: 'note', length: content.text.length });
      this.change({ id: crypto.randomUUID(), direction: 'outgoing', peer, phase: 'waiting', manifest, bytes: 0, progress: 0 });
    }
    async accept() { this.accepted++; this.change({ ...this.current, phase: 'connecting' }); }
    cancel() { this.cancelled++; if (this.current) this.change({ ...this.current, phase: 'cancelled' }); }
    dismiss() { if (this.current && !['complete', 'failed', 'cancelled'].includes(this.current.phase)) this.cancel(); this.change(null); }
    receive() {}
    offer(manifest = core.validateManifest({ kind: 'note', length: 4 })) {
      this.change({ id: crypto.randomUUID(), direction: 'incoming', peer: PEER, phase: 'approval', manifest, bytes: 0, progress: 0 });
    }
    received(content) { this.options.onReceived({ peer: PEER, ...content }); }
  }
  window.require = name => {
    if (name === './room.mjs') return { DropRoom: RoomAdapter };
    if (name === './transfer.mjs') return { DropTransfer: TransferAdapter };
    if (name === './core.mjs') return core;
    throw new Error(`Unexpected import: ${name}`);
  };
  window.eval(`${compiled}\n//# sourceURL=nexus-drop-dom-test.js`);
  const settle = async () => { for (let i = 0; i < 3; i++) await new Promise(resolve => setTimeout(resolve, 0)); };
  const click = async selector => {
    const node = window.document.querySelector(selector);
    assert.ok(node, `Missing target: ${selector}`);
    node.click();
    await settle();
  };
  const create = async () => { await click('#create-room'); return { room: rooms.at(-1), transfer: transfers.at(-1) }; };
  const peer = (room = rooms.at(-1), name = 'Other computer') => room.peers([{ id: PEER, name, kind: 'desktop' }]);
  const chooseFiles = async files => {
    const input = window.document.querySelector('#file-input');
    Object.defineProperty(input, 'files', { configurable: true, value: files });
    input.dispatchEvent(new window.Event('change', { bubbles: true }));
    await settle();
  };
  await settle();
  return { window, document: window.document, errors, rooms, transfers, objectUrls, revoked, copies, create, peer, chooseFiles, settle, click, close: () => dom.window.close() };
}

test('Drop room UI requires a selected device and explicit recipient acceptance', { skip }, async t => {
  const app = await harness(); t.after(app.close);
  assert.equal(app.document.querySelector('#send').disabled, true);
  const { room, transfer } = await app.create();
  assert.equal(app.document.querySelector('#room-controls').hidden, false);
  assert.match(app.document.querySelector('#room-link').value, /#room=/);
  assert.match(app.document.querySelector('#connection').textContent, /local tabs only/i);
  app.peer(room);
  await app.click('#note-mode');
  const note = app.document.querySelector('#note-input');
  note.value = 'Please review this'; note.dispatchEvent(new app.window.Event('input', { bubbles: true }));
  assert.equal(app.document.querySelector('#send').disabled, true);
  await app.click('[data-peer]');
  assert.equal(app.document.querySelector('#send').disabled, false);
  await app.click('#send');
  assert.equal(transfer.requests.length, 1);
  assert.equal(transfer.requests[0].content.text, 'Please review this');
  assert.match(app.document.querySelector('#transfer-panel').textContent, /recipient must accept/);
  assert.equal(app.document.querySelector('#send').disabled, true);
  await app.click('[data-action="cancel"]');
  await app.click('[data-action="dismiss"]');
  transfer.offer();
  assert.equal(transfer.accepted, 0);
  assert.ok(app.document.querySelector('[data-action="accept"]'));
  await app.click('[data-action="accept"]');
  assert.equal(transfer.accepted, 1);
  assert.equal(app.document.querySelector('[data-action="accept"]'), null);
  assert.deepEqual(app.errors, []);
});

test('leaving a room while start is pending ignores its late peer/status callbacks and permits a clean next join', { skip }, async t => {
  const app = await harness({ deferStart: true }); t.after(app.close);
  const first = await app.create();
  await app.click('#leave-room');
  assert.equal(first.room.closed, true);
  assert.equal(app.document.querySelector('#room-controls').hidden, true);
  assert.equal(app.window.location.hash, '');
  first.room.options.onStatus('online');
  app.peer(first.room, 'Stale device');
  assert.equal(app.document.querySelector('[data-peer]'), null);
  assert.doesNotMatch(app.document.querySelector('#connection').textContent, /Room connected/);
  first.room.releaseStart(); await app.settle();
  const second = await app.create();
  assert.notEqual(second.room, first.room);
  app.peer(first.room, 'Old room');
  app.peer(second.room, 'Current room');
  assert.match(app.document.querySelector('#devices').textContent, /Current room/);
  assert.doesNotMatch(app.document.querySelector('#devices').textContent, /Old room/);
  second.room.releaseStart(); await app.settle();
  await app.click('#leave-room');
  assert.equal(second.room.closeCount, 1);
  assert.deepEqual(app.errors, []);
});

test('file names, device names, notes, and failure strings render as text rather than markup', { skip }, async t => {
  const app = await harness(); t.after(app.close);
  const { room, transfer } = await app.create();
  app.peer(room, '<img src=x onerror=alert(1)>');
  await app.chooseFiles([new app.window.File(['demo'], 'mix<img onerror=alert(1)>.wav', { lastModified: 1 })]);
  assert.equal(app.document.querySelector('#devices img'), null);
  assert.equal(app.document.querySelector('#selected-files img'), null);
  assert.match(app.document.querySelector('#selected-files strong').textContent, /<img/);
  transfer.offer(core.validateManifest({ kind: 'files', files: [{ name: '<svg onload=alert(1)>.wav', size: 4 }] }));
  assert.equal(app.document.querySelector('#transfer-panel svg'), null);
  transfer.change({ ...transfer.current, phase: 'failed', error: '<img src=x onerror=alert(1)>' });
  assert.equal(app.document.querySelector('#transfer-panel img'), null);
  transfer.received({ text: '<script>alert("note")</script>' });
  transfer.received({ files: [{ name: '<img onerror=alert(1)>.wav', size: 4, blob: new Blob(['demo']) }] });
  assert.equal(app.document.querySelector('#received-items script'), null);
  assert.equal(app.document.querySelector('#received-items img'), null);
  assert.equal(app.document.querySelector('#received-items pre').textContent, '<script>alert("note")</script>');
  assert.equal(app.document.querySelector('#received-items a').getAttribute('download'), '<img onerror=alert(1)>.wav');
  assert.deepEqual(app.errors, []);
});

test('keyboard focus stays on Cancel through transfer progress updates', { skip }, async t => {
  const app = await harness(); t.after(app.close);
  const { transfer } = await app.create();
  transfer.offer(core.validateManifest({ kind: 'files', files: [{ name: 'mix.wav', size: 100 }] }));
  transfer.change({ ...transfer.current, phase: 'receiving', bytes: 20, progress: .2 });
  app.document.querySelector('[data-action="cancel"]').focus();
  for (const progress of [.3, .5, .9]) {
    transfer.change({ ...transfer.current, bytes: progress * 100, progress });
    assert.equal(app.document.activeElement.dataset.action, 'cancel');
  }
  await app.click('[data-action="cancel"]');
  assert.equal(transfer.cancelled, 1);
  assert.equal(app.document.activeElement.dataset.action, 'dismiss');
});

test('received data stays bounded and object URLs are revoked when cleared', { skip }, async t => {
  const app = await harness(); t.after(app.close);
  const { transfer } = await app.create();
  transfer.received({ files: [{ name: 'already-received.bin', size: core.MAX_BYTES, blob: new Blob(['small test adapter payload']) }] });
  transfer.offer(core.validateManifest({ kind: 'files', files: [{ name: 'next.bin', size: 1 }] }));
  await app.click('[data-action="accept"]');
  assert.equal(transfer.accepted, 0);
  assert.match(app.document.querySelector('#toast').textContent, /Download and clear/);
  await app.click('#clear-received');
  assert.deepEqual(app.revoked, app.objectUrls);
  assert.equal(app.document.querySelector('#received-panel').hidden, true);
  await app.click('[data-action="accept"]');
  assert.equal(transfer.accepted, 1);
  transfer.dismiss();
  for (let i = 0; i < 40; i++) transfer.received({ text: `Note ${i}` });
  transfer.offer();
  await app.click('[data-action="accept"]');
  assert.equal(transfer.accepted, 1, 'The 41st received item needs an explicit clear first');
});

test('pagehide cleanup leaves a ready-to-join UI on back/forward restoration and revokes received files', { skip }, async t => {
  const app = await harness(); t.after(app.close);
  const { room, transfer } = await app.create();
  app.peer(room);
  transfer.received({ files: [{ name: 'mix.wav', size: 4, blob: new Blob(['demo']) }] });
  app.window.dispatchEvent(new app.window.PageTransitionEvent('pagehide', { persisted: true }));
  await app.settle();
  app.window.dispatchEvent(new app.window.PageTransitionEvent('pageshow', { persisted: true }));
  assert.equal(room.closed, true);
  assert.equal(app.document.querySelector('#room-controls').hidden, true);
  assert.equal(app.document.querySelector('#start-controls').hidden, false);
  assert.equal(app.document.querySelector('#send').disabled, true);
  assert.equal(app.document.querySelector('[data-peer]'), null);
  assert.equal(app.document.querySelector('#received-panel').hidden, true);
  assert.equal(app.window.location.hash, '');
  assert.deepEqual(app.revoked, app.objectUrls);
  await app.create();
  assert.equal(app.rooms.length, 2);
  assert.deepEqual(app.errors, []);
});

test('unsupported browsers expose an explanation and cannot create a misleading sharing room', { skip }, async t => {
  const app = await harness({ supported: false }); t.after(app.close);
  assert.equal(app.document.querySelector('#support-error').hidden, false);
  assert.match(app.document.querySelector('#support-error').textContent, /HTTPS.*WebRTC/);
  assert.equal(app.document.querySelector('#create-room').disabled, true);
  assert.equal(app.document.querySelector('#join-form button').disabled, true);
  await app.click('#create-room');
  assert.equal(app.rooms.length, 0);
});
