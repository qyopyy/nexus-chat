import assert from 'node:assert/strict';
import test from 'node:test';
import { CHUNK_BYTES, MAX_BYTES } from '../public/drop/core.mjs';
import { DropTransfer } from '../public/drop/transfer.mjs';

const LEFT = '11111111-1111-4111-8111-111111111111';
const RIGHT = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const waitFor = async predicate => {
  const until = Date.now() + 2000;
  while (!predicate()) {
    if (Date.now() >= until) assert.fail('Transfer did not reach its expected state');
    await new Promise(resolve => setTimeout(resolve, 2));
  }
};

// This adapter models native RTC signaling and ordered task delivery only. The
// offer/answer handshake, transfer state machine, validation, chunking, consent,
// cancellation, backpressure, and acknowledgements run in production modules.
class Channel extends EventTarget {
  readyState = 'connecting';
  bufferedAmount = 0;
  bufferedAmountLowThreshold = 0;
  sent = [];
  constructor(network, owner) { super(); this.network = network; this.owner = owner; }
  emit(type, details = {}) {
    const event = Object.assign(new Event(type), details);
    this['on' + type]?.(event);
    this.dispatchEvent(event);
  }
  open() { this.readyState = 'open'; this.emit('open'); }
  deliver(data) { if (this.readyState === 'open') this.emit('message', { data }); }
  send(data) {
    if (this.readyState !== 'open') throw new Error('Data channel is closed');
    const copy = typeof data === 'string' ? data : data.slice(0);
    this.sent.push(copy);
    const bytes = typeof copy === 'string' ? new TextEncoder().encode(copy).byteLength : copy.byteLength;
    this.bufferedAmount += bytes;
    this.network?.queue(this, copy, bytes);
  }
  close() {
    if (this.readyState === 'closed') return;
    this.readyState = 'closed';
    this.emit('close');
    if (this.partner && this.partner.readyState !== 'closed') this.partner.close();
  }
}

class Network {
  peers = new Map();
  nextId = 0;
  pending = [];
  hold = () => false;
  delivered = [];
  factory = () => {
    const network = this;
    const id = ++this.nextId;
    const pc = {
      id, localDescription: null, remoteDescription: null, connectionState: 'new', channel: null,
      createDataChannel() { return this.channel = new Channel(network, id); },
      async createOffer() { return { type: 'offer', sdp: String(id) }; },
      async createAnswer() { return { type: 'answer', sdp: String(id) }; },
      async setLocalDescription(description) {
        this.localDescription = { ...description, toJSON: () => ({ ...description }) };
      },
      async setRemoteDescription(description) {
        this.remoteDescription = { ...description };
        const other = network.peers.get(Number(description.sdp));
        if (description.type === 'offer') {
          this.partner = other;
          other.partner = this;
          this.channel = new Channel(network, id);
          this.channel.partner = other.channel;
          other.channel.partner = this.channel;
          this.ondatachannel?.({ channel: this.channel });
        } else {
          setTimeout(() => {
            if (this.connectionState === 'closed' || other.connectionState === 'closed') return;
            this.connectionState = other.connectionState = 'connected';
            other.channel.open();
            this.channel.open();
          }, 0);
        }
      },
      async addIceCandidate() {},
      close() {
        if (this.connectionState === 'closed') return;
        this.connectionState = 'closed';
        this.channel?.close();
        this.onconnectionstatechange?.();
      },
    };
    this.peers.set(id, pc);
    return pc;
  };
  queue(channel, data, bytes) {
    const deliver = () => {
      channel.bufferedAmount -= bytes;
      if (channel.readyState === 'open' && channel.partner?.readyState === 'open') {
        this.delivered.push({ owner: channel.owner, data });
        channel.partner.deliver(data);
      }
      if (channel.bufferedAmount <= channel.bufferedAmountLowThreshold) channel.emit('bufferedamountlow');
    };
    if (this.hold(channel, data)) this.pending.push(deliver);
    else setTimeout(deliver, 0);
  }
  release() { for (const deliver of this.pending.splice(0)) setTimeout(deliver, 0); }
}

function pair(t) {
  const network = new Network();
  const leftReceived = [], rightReceived = [], signals = [];
  let left, right;
  left = new DropTransfer({
    peerFactory: network.factory,
    signal: async (type, payload, to) => { signals.push({ from: LEFT, type, to }); await right.receive(type, structuredClone(payload), LEFT); },
    onReceived: value => leftReceived.push(value),
  });
  right = new DropTransfer({
    peerFactory: network.factory,
    signal: async (type, payload, to) => { signals.push({ from: RIGHT, type, to }); await left.receive(type, structuredClone(payload), RIGHT); },
    onReceived: value => rightReceived.push(value),
  });
  t.after(() => { left.dismiss(); right.dismiss(); });
  return { network, left, right, leftReceived, rightReceived, signals };
}

async function inbound(t, manifest) {
  const received = [], signals = [];
  const transfer = new DropTransfer({
    signal: async (type, payload, to) => { signals.push({ type, payload, to }); },
    onReceived: value => received.push(value),
  });
  const id = crypto.randomUUID();
  await transfer.receive('request', { transfer: id, manifest }, LEFT);
  assert.equal(transfer.active.phase, 'approval');
  await transfer.accept();
  const channel = new Channel();
  transfer.bindChannel(transfer.active, channel);
  channel.open();
  t.after(() => transfer.dismiss());
  return { transfer, channel, received, signals, id };
}
const control = (channel, message) => channel.deliver(JSON.stringify(message));

test('file content and WebRTC negotiation wait for explicit receiver consent', async t => {
  const { left, right, network, rightReceived } = pair(t);
  await left.request(RIGHT, { files: [new File(['Private file'], 'private.txt')] });
  assert.equal(left.active.phase, 'waiting');
  assert.equal(right.active.phase, 'approval');
  assert.equal(network.peers.size, 0);
  assert.equal(network.delivered.length, 0);
  assert.equal(rightReceived.length, 0);
  right.cancel();
  assert.equal(right.active.phase, 'cancelled');
  assert.equal(left.active.phase, 'failed');
  assert.equal(network.peers.size, 0);
});

test('multi-file transfer preserves chunk contents and empty files, then requires a receiver acknowledgement', async t => {
  const { left, right, network, rightReceived } = pair(t);
  const bytes = Uint8Array.from({ length: CHUNK_BYTES * 3 + 17 }, (_, index) => index % 251);
  network.hold = (channel, data) => typeof data === 'string' && JSON.parse(data).type === 'received';
  await left.request(RIGHT, { files: [new File([bytes], 'demo.wav'), new File([], 'empty.txt'), new File(['Last file'], 'readme.txt')] });
  await right.accept();
  await waitFor(() => right.active.phase === 'complete');
  assert.equal(rightReceived.length, 1);
  assert.equal(left.active.phase, 'sending', 'queued bytes are not delivery confirmation');
  assert.equal(left.active.sentAll, true);
  const files = rightReceived[0].files;
  assert.deepEqual(files.map(file => file.name), ['demo.wav', 'empty.txt', 'readme.txt']);
  assert.deepEqual(new Uint8Array(await files[0].blob.arrayBuffer()), bytes);
  assert.equal(files[1].blob.size, 0);
  assert.equal(await files[2].blob.text(), 'Last file');
  assert.equal(files[0].blob.type, 'application/octet-stream');
  network.hold = () => false;
  network.release();
  await waitFor(() => left.active.phase === 'complete');
  assert.equal(left.active.bytes, bytes.length + 9);
  assert.equal(left.active.pc.connectionState, 'closed');
  assert.ok([...network.peers.values()].every(pc => pc.channel.readyState === 'closed'));
});

test('notes and links are delivered as exact text after consent', async t => {
  const { left, right, rightReceived } = pair(t);
  const text = 'A new mix 🎵\nhttps://example.com/listen?name=<demo>&n=2';
  await left.request(RIGHT, { text });
  assert.equal(rightReceived.length, 0);
  await right.accept();
  await waitFor(() => left.active.phase === 'complete');
  assert.equal(rightReceived[0].text, text);
  assert.deepEqual(rightReceived[0].files, []);
});

test('backpressure bounds queued bytes and resumes when the channel drains', async t => {
  const { left, right, network, rightReceived } = pair(t);
  network.hold = () => true;
  const bytes = new Uint8Array(CHUNK_BYTES * 40);
  await left.request(RIGHT, { files: [new File([bytes], 'large.bin')] });
  await right.accept();
  await waitFor(() => left.active.channel?.bufferedAmount > 256 * 1024);
  assert.ok(left.active.channel.bufferedAmount <= 256 * 1024 + CHUNK_BYTES + 100);
  assert.ok(left.active.bytes < bytes.length);
  assert.equal(rightReceived.length, 0);
  network.hold = () => false;
  network.release();
  await waitFor(() => left.active.phase === 'complete');
  assert.equal(rightReceived[0].files[0].blob.size, bytes.length);
});

test('a delivery acknowledgement before every file is sent fails instead of reporting success', async t => {
  const { left, right, network, rightReceived } = pair(t);
  network.hold = () => true;
  await left.request(RIGHT, { files: [new File([new Uint8Array(CHUNK_BYTES * 40)], 'large.bin')] });
  await right.accept();
  await waitFor(() => left.active.channel?.bufferedAmount > 256 * 1024);
  assert.notEqual(left.active.sentAll, true);
  control(left.active.channel, { type: 'received' });
  assert.equal(left.active.phase, 'failed');
  assert.equal(rightReceived.length, 0);
  assert.match(left.active.error, /delivery confirmation/i);
});

test('cancelling while backpressured stops queued content and closes both peers', async t => {
  const { left, right, network, rightReceived } = pair(t);
  network.hold = () => true;
  await left.request(RIGHT, { files: [new File([new Uint8Array(CHUNK_BYTES * 40)], 'large.bin')] });
  await right.accept();
  await waitFor(() => left.active.channel?.bufferedAmount > 256 * 1024);
  const sent = left.active.channel.sent.length;
  left.cancel();
  network.release();
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(left.active.phase, 'cancelled');
  assert.equal(right.active.phase, 'cancelled');
  assert.equal(left.active.channel.sent.length, sent);
  assert.equal(rightReceived.length, 0);
  assert.ok([...network.peers.values()].every(pc => pc.connectionState === 'closed'));
});

test('receiver rejects oversized, unexpected, truncated, reordered, and malformed file data', async t => {
  const cases = [
    channel => channel.deliver(new Uint8Array(1).buffer),
    channel => { control(channel, { type: 'file-start', index: 0 }); channel.deliver(new Uint8Array(CHUNK_BYTES + 1).buffer); },
    channel => { control(channel, { type: 'file-start', index: 0 }); channel.deliver(new Uint8Array(5).buffer); },
    channel => { control(channel, { type: 'file-start', index: 0 }); channel.deliver(new Uint8Array(3).buffer); control(channel, { type: 'file-end', index: 0 }); },
    channel => control(channel, { type: 'file-start', index: 1 }),
    channel => { control(channel, { type: 'file-start', index: 0 }); control(channel, { type: 'file-start', index: 0 }); },
    channel => control(channel, { type: 'complete' }),
    channel => channel.deliver('not JSON'),
    channel => control(channel, { type: 'note', text: 'unexpected' }),
  ];
  for (const [index, inject] of cases.entries()) {
    const { transfer, channel, received, signals } = await inbound(t, { kind: 'files', files: [{ name: 'four.bin', size: 4 }] });
    inject(channel);
    assert.equal(transfer.active.phase, 'failed', 'case ' + index);
    assert.equal(channel.readyState, 'closed', 'case ' + index);
    assert.equal(received.length, 0, 'case ' + index);
    assert.ok(signals.some(signal => signal.type === 'cancel'), 'case ' + index);
    assert.equal(transfer.active.current, null);
  }
});

test('receiver validates note length and does not accept duplicate note payloads', async t => {
  for (const invalid of ['short', 'far too long']) {
    const { transfer, channel, received } = await inbound(t, { kind: 'note', length: 6 });
    control(channel, { type: 'note', text: invalid });
    assert.equal(transfer.active.phase, 'failed');
    assert.equal(received.length, 0);
  }
  const { transfer, channel, received } = await inbound(t, { kind: 'note', length: 6 });
  control(channel, { type: 'note', text: 'a note' });
  control(channel, { type: 'note', text: 'a note' });
  assert.equal(transfer.active.phase, 'failed');
  assert.equal(received.length, 0);
});

test('active transfers bind control messages to both the chosen peer and transfer ID', async t => {
  const { left, right, network } = pair(t);
  await left.request(RIGHT, { text: 'Only to this peer' });
  await left.receive('accept', { transfer: left.active.id }, OTHER);
  await left.receive('accept', { transfer: crypto.randomUUID() }, RIGHT);
  await left.receive('cancel', { transfer: left.active.id }, OTHER);
  assert.equal(left.active.phase, 'waiting');
  assert.equal(network.peers.size, 0);
  assert.equal(right.active.phase, 'approval');
  await right.receive('request', { transfer: crypto.randomUUID(), manifest: { kind: 'note', length: 5 } }, OTHER);
  assert.equal(right.active.peer, LEFT);
  assert.equal(right.active.phase, 'approval');
});

test('disconnecting mid-transfer reports failure and drops partial buffers', async t => {
  const { transfer, channel, received } = await inbound(t, { kind: 'files', files: [{ name: 'partial.bin', size: 8 }] });
  control(channel, { type: 'file-start', index: 0 });
  channel.deliver(new Uint8Array(4).buffer);
  assert.equal(transfer.active.bytes, 4);
  channel.close();
  assert.equal(transfer.active.phase, 'failed');
  assert.equal(transfer.active.current, null);
  assert.deepEqual(transfer.active.received, []);
  assert.equal(received.length, 0);
});

test('request deadlines fail cleanly and a cancelled timer cannot fail a later transfer', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const signals = [];
  const transfer = new DropTransfer({ signal: async type => { signals.push(type); } });
  t.after(() => transfer.dismiss());
  await transfer.request(RIGHT, { text: 'Request with no answer' });
  t.mock.timers.tick(60000);
  assert.equal(transfer.active.phase, 'failed');
  assert.ok(signals.includes('cancel'));
  assert.deepEqual(transfer.active.files, []);
  assert.equal(transfer.active.text, '');
  transfer.dismiss();
  await transfer.request(RIGHT, { text: 'Cancelled' });
  transfer.cancel();
  t.mock.timers.tick(60000);
  assert.equal(transfer.active.phase, 'cancelled');
});

test('receiver keeps the acknowledgement connection open for slow links and eventually cleans it up', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { transfer, channel, received } = await inbound(t, { kind: 'note', length: 4 });
  control(channel, { type: 'note', text: 'Sent' });
  control(channel, { type: 'complete' });
  assert.equal(transfer.active.phase, 'complete');
  assert.equal(received[0].text, 'Sent');
  assert.deepEqual(channel.sent.map(message => JSON.parse(message)), [{ type: 'received' }]);
  t.mock.timers.tick(2000);
  assert.equal(channel.readyState, 'open', 'the acknowledgement must survive a slow round trip');
  t.mock.timers.tick(28000);
  assert.equal(channel.readyState, 'closed');
});

test('late rejected request, acceptance, and ICE sends cannot corrupt a replacement transfer', async t => {
  for (const staleType of ['request', 'accept', 'ice']) {
    const old = deferred();
    let delayed = false;
    const network = new Network();
    const transfer = new DropTransfer({
      peerFactory: network.factory,
      signal: async type => {
        if (type === staleType && !delayed) { delayed = true; return old.promise; }
      },
    });
    t.after(() => transfer.dismiss());
    let pending;
    if (staleType === 'request') {
      pending = transfer.request(RIGHT, { text: 'Old request' }).catch(() => {});
    } else if (staleType === 'accept') {
      await transfer.receive('request', { transfer: crypto.randomUUID(), manifest: { kind: 'note', length: 3 } }, RIGHT);
      pending = transfer.accept();
    } else {
      await transfer.request(RIGHT, { text: 'Old ICE negotiation' });
      await transfer.receive('accept', { transfer: transfer.active.id }, RIGHT);
      transfer.active.pc.onicecandidate({ candidate: { toJSON: () => ({ candidate: 'candidate:test' }) } });
    }
    assert.equal(delayed, true, staleType);
    transfer.dismiss();
    await transfer.request(RIGHT, { text: 'Replacement' });
    const replacementId = transfer.active.id;
    old.reject(new Error('Failure from old ' + staleType));
    await pending;
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(transfer.active.id, replacementId, staleType);
    assert.equal(transfer.active.phase, 'waiting', staleType);
  }
});

test('oversized manifests are declined without allocating a peer connection', async t => {
  const network = new Network(), signals = [];
  const transfer = new DropTransfer({ peerFactory: network.factory, signal: async (type, payload) => { signals.push({ type, payload }); } });
  t.after(() => transfer.dismiss());
  await transfer.receive('request', { transfer: crypto.randomUUID(), manifest: { kind: 'files', files: [{ name: 'too-large.bin', size: MAX_BYTES + 1 }] } }, LEFT);
  assert.equal(transfer.active, null);
  assert.equal(network.peers.size, 0);
  assert.equal(signals[0].type, 'reject');
});
