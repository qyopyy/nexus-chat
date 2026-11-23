import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import * as core from '../public/drop/core.mjs';

const qaPackage = process.env.NEXUS_DROP_QA_PACKAGE || process.env.DROP_QA_PACKAGE || process.env.PRESAVE_QA_PACKAGE;
let transformSync;
try { ({ transformSync } = createRequire(qaPackage || import.meta.url)('esbuild')); }
catch (error) { if (qaPackage) throw error; }
const skip = !transformSync && 'Install esbuild and set NEXUS_DROP_QA_PACKAGE to the isolated package.json.';
let compiled;
const tick = () => new Promise(resolve => setTimeout(resolve, 5));

async function eventually(predicate, message) {
  const until = Date.now() + 2000;
  while (!predicate() && Date.now() < until) await tick();
  assert.ok(predicate(), message);
}

async function environment({ cipher = core.roomCipher, status = 'TIMED_OUT' } = {}) {
  compiled ||= transformSync(await readFile(new URL('../public/drop/room.mjs', import.meta.url), 'utf8'), { format: 'cjs', target: 'es2022' }).code;
  const localChannels = new Set();
  const intervals = new Set();
  const clients = [];
  let holdRemote = false;
  const pendingSends = [];
  class LocalChannel {
    constructor(name) { this.name = name; this.closed = false; localChannels.add(this); }
    postMessage(value) {
      if (this.closed) throw new Error('Closed BroadcastChannel');
      for (const other of localChannels) if (other !== this && other.name === this.name && !other.closed) {
        queueMicrotask(() => { if (!other.closed) other.onmessage?.({ data: structuredClone(value) }); });
      }
    }
    close() { this.closed = true; localChannels.delete(this); }
  }
  const createClient = () => {
    const client = {
      sends: [], removed: 0, disconnected: false,
      channel() {
        const channel = {
          on() { return this; },
          subscribe(callback) { this.callback = callback; callback(status); return this; },
          async send(value) {
            client.sends.push(value);
            if (holdRemote) return new Promise(resolve => pendingSends.push(resolve));
            return status === 'SUBSCRIBED' ? 'ok' : 'timed out';
          },
        };
        client.lastChannel = channel;
        return channel;
      },
      async removeChannel() { client.removed++; },
      realtime: { disconnect() { client.disconnected = true; } },
    };
    clients.push(client);
    return client;
  };
  const module = { exports: {} };
  runInNewContext(compiled, {
    module, exports: module.exports, crypto, Date, Map, Array, Promise, setTimeout, clearTimeout,
    BroadcastChannel: LocalChannel,
    setInterval(callback) { const id = { callback }; intervals.add(id); return id; },
    clearInterval(id) { intervals.delete(id); },
    require(name) {
      if (name === './core.mjs') return { ...core, roomCipher: cipher };
      if (name === '../presave/vendor/supabase.mjs') return { createClient };
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  const makeRoom = token => {
    const observed = { peers: [], signals: [], status: [] };
    const room = new module.exports.DropRoom({ token, name: 'Local device', kind: 'desktop',
      config: { supabaseUrl: 'https://pairing.invalid', supabaseKey: 'test-public-key' },
      onPeers: peers => { observed.peers = peers; },
      onSignal: (...signal) => { observed.signals.push(signal); },
      onStatus: value => { observed.status.push(value); },
    });
    return { room, observed };
  };
  return {
    makeRoom, localChannels, intervals, clients,
    holdRemote() { holdRemote = true; },
    releaseRemote() { holdRemote = false; for (const resolve of pendingSends.splice(0)) resolve('ok'); },
  };
}

test('same-browser devices discover and signal through encrypted local broadcast when Supabase is offline', { skip }, async () => {
  const env = await environment();
  const token = core.createRoomToken();
  const a = env.makeRoom(token), b = env.makeRoom(token);
  try {
    await Promise.all([a.room.start(), b.room.start()]);
    await eventually(() => a.observed.peers.length === 1 && b.observed.peers.length === 1, 'Both local devices should discover each other');
    assert.equal(a.observed.peers[0].id, b.room.id);
    assert.equal(a.observed.peers[0].local, true);
    assert.equal(b.observed.peers[0].local, true);
    assert.equal(a.room.remoteReady, false);
    assert.ok(a.observed.status.includes('offline'));
    await a.room.send('request', { transfer: crypto.randomUUID(), manifest: { kind: 'note', length: 4 } }, b.room.id);
    await eventually(() => b.observed.signals.length === 1, 'Directed local signaling should work without Supabase');
    assert.equal(b.observed.signals[0][0], 'request');
    assert.equal(b.observed.signals[0][2], a.room.id);
    assert.equal(env.clients.reduce((sum, client) => sum + client.sends.length, 0), 0);
    await a.room.close();
    await eventually(() => b.observed.peers.length === 0, 'Leaving should remove the local device');
  } finally {
    await Promise.all([a.room.close(), b.room.close()]);
  }
  assert.equal(env.localChannels.size, 0);
  assert.equal(env.intervals.size, 0);
  assert.ok(env.clients.every(client => client.removed === 1 && client.disconnected));
});

test('a different invitation cannot discover or receive the local room traffic', { skip }, async () => {
  const env = await environment();
  const a = env.makeRoom(core.createRoomToken()), b = env.makeRoom(core.createRoomToken());
  try {
    await Promise.all([a.room.start(), b.room.start()]);
    await tick();
    assert.equal(a.observed.peers.length, 0);
    assert.equal(b.observed.peers.length, 0);
    await assert.rejects(a.room.send('request', { transfer: crypto.randomUUID() }, b.room.id), /offline/);
    assert.equal(b.observed.signals.length, 0);
  } finally { await Promise.all([a.room.close(), b.room.close()]); }
});

test('leaving while cryptography initializes never creates a late channel or heartbeat', { skip }, async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const env = await environment({ cipher: async token => { await gate; return core.roomCipher(token); } });
  const app = env.makeRoom(core.createRoomToken());
  const starting = app.room.start();
  await app.room.close();
  release();
  await starting;
  assert.equal(app.room.closed, true);
  assert.equal(env.localChannels.size, 0);
  assert.equal(env.clients.length, 0);
  assert.equal(env.intervals.size, 0);
  assert.deepEqual(app.observed.status, []);
});

test('leaving while the first announcement encrypts cannot resurrect a channel or heartbeat', { skip }, async () => {
  let release, first = true;
  const gate = new Promise(resolve => { release = resolve; });
  const env = await environment({ cipher: async token => {
    const real = await core.roomCipher(token);
    return { ...real, async encrypt(message) { if (first) { first = false; await gate; } return real.encrypt(message); } };
  } });
  const app = env.makeRoom(core.createRoomToken());
  const starting = app.room.start();
  await eventually(() => env.localChannels.size === 1, 'The room should reach announcement preparation');
  const settledStart = starting.catch(error => assert.match(error.message, /closed/));
  await app.room.close();
  release();
  await settledStart;
  assert.equal(env.localChannels.size, 0);
  assert.equal(env.intervals.size, 0);
  assert.equal(app.room.closed, true);
});

test('closing latches immediately while remote departure delivery is pending', { skip }, async () => {
  const env = await environment({ status: 'SUBSCRIBED' });
  const app = env.makeRoom(core.createRoomToken());
  await app.room.start();
  env.holdRemote();
  const closing = app.room.close();
  try {
    assert.equal(app.room.closed, true, 'Late subscribe/signal callbacks must observe that this room is closing');
    const count = app.observed.status.length;
    env.clients[0].lastChannel.callback('SUBSCRIBED');
    assert.equal(app.observed.status.length, count);
    await assert.rejects(app.room.send('hello'), /closed|Join a room/);
  } finally {
    // Encryption may finish after close() starts; release the fake remote ack
    // after it has had a turn, then clean up even if the regression assertion fails.
    await tick();
    env.releaseRemote();
    await closing;
  }
  assert.equal(env.localChannels.size, 0);
  assert.equal(env.intervals.size, 0);
});
