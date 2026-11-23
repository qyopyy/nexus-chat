import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_BYTES, MAX_FILES, MAX_NOTE, cleanName, createRoomToken, fileManifest,
  invitationUrl, parseInvitation, roomCipher, SignalGuard, validateManifest,
} from '../public/drop/core.mjs';

const BASE = 'https://nexus.example/public/drop/index.html';
const ME = '11111111-1111-4111-8111-111111111111';
const PEER = '22222222-2222-4222-8222-222222222222';

test('invitations preserve a random fragment capability and reject other origins and pages', () => {
  const token = createRoomToken();
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(token, createRoomToken());
  const url = new URL(invitationUrl(token, BASE + '?old=query#old-fragment'));
  assert.equal(url.origin + url.pathname, BASE);
  assert.equal(url.search, '');
  assert.equal(url.search.includes(token), false);
  assert.equal(new URLSearchParams(url.hash.slice(1)).get('room'), token);
  assert.equal(parseInvitation(url.href, BASE), token);
  assert.equal(parseInvitation(token, BASE), token);
  for (const invalid of [
    'https://evil.example/public/drop/index.html#room=' + token,
    'https://nexus.example/other/index.html#room=' + token,
    'https://user:password@nexus.example/public/drop/index.html#room=' + token,
    'http://nexus.example/public/drop/index.html#room=' + token,
    BASE + '?room=' + token, BASE + '#room=short', 'x'.repeat(42), token + '=',
  ]) assert.throws(() => parseInvitation(invalid, BASE));
  // A canonical 32-byte token has four unused zero bits in its final character.
  assert.throws(() => parseInvitation('A'.repeat(42) + 'B', BASE));
});

test('room signaling roundtrips only with the invitation key and rejects ciphertext tampering', async () => {
  const token = createRoomToken();
  const sender = await roomCipher(token);
  const receiver = await roomCipher(token);
  const stranger = await roomCipher(createRoomToken());
  assert.equal(sender.topic, receiver.topic);
  assert.notEqual(sender.topic, stranger.topic);
  assert.equal(sender.topic.includes(token), false);
  const message = { type: 'offer', payload: { name: 'Studio phone', sdp: 'Private offer' } };
  const envelope = await sender.encrypt(message);
  const second = await sender.encrypt(message);
  assert.notEqual(envelope.iv, second.iv);
  assert.notEqual(envelope.data, second.data);
  assert.equal(JSON.stringify(envelope).includes('Private offer'), false);
  assert.deepEqual(await receiver.decrypt(envelope), message);
  await assert.rejects(stranger.decrypt(envelope));
  const bytes = Buffer.from(envelope.data, 'base64url');
  bytes[0] ^= 1;
  await assert.rejects(receiver.decrypt({ ...envelope, data: bytes.toString('base64url') }));
  await assert.rejects(receiver.decrypt({ ...envelope, iv: 'A'.repeat(16) }));
  for (const invalid of [null, {}, { iv: envelope.iv, data: '?' }, { iv: 'short', data: envelope.data }, { iv: envelope.iv, data: 'A'.repeat(90001) }]) {
    await assert.rejects(receiver.decrypt(invalid));
  }
  await assert.rejects(sender.encrypt({ text: 'x'.repeat(65537) }));
});

test('filename normalization removes path separators, controls, and bidirectional spoofing', () => {
  assert.equal(cleanName('../folder/track\\demo.mp3'), '..foldertrackdemo.mp3');
  assert.equal(cleanName('  release\u202emp3.exe\u0000\n  '), 'releasemp3.exe');
  assert.equal(cleanName(' /\\\t\n '), 'Untitled file');
  assert.equal(cleanName('a'.repeat(500)).length, 180);
  assert.equal(cleanName('🎵 final mix.wav'), '🎵 final mix.wav');
});

test('manifests enforce whole-transfer bounds while supporting empty files and notes', () => {
  const manifest = fileManifest([
    new File([new Uint8Array(3)], 'first.wav'), new File([], 'empty.txt'),
  ]);
  assert.equal(manifest.kind, 'files');
  assert.equal(manifest.total, 3);
  assert.deepEqual(manifest.files.map(file => file.size), [3, 0]);
  assert.equal(validateManifest({ kind: 'files', files: [{ name: 'limit.bin', size: MAX_BYTES }] }).total, MAX_BYTES);
  assert.equal(validateManifest({ kind: 'note', length: MAX_NOTE }).length, MAX_NOTE);
  for (const invalid of [
    null, {}, { kind: 'files', files: [] },
    { kind: 'files', files: Array.from({ length: MAX_FILES + 1 }, () => ({ name: 'file', size: 0 })) },
    { kind: 'files', files: [{ name: 'large', size: MAX_BYTES + 1 }] },
    { kind: 'files', files: [{ name: 'first', size: MAX_BYTES }, { name: 'second', size: 1 }] },
    { kind: 'files', files: [{ name: 'bad', size: -1 }] },
    { kind: 'files', files: [{ name: 'bad', size: 0.5 }] },
    { kind: 'files', files: [{ name: 'bad', size: '5' }] },
    { kind: 'files', files: [{ name: 'bad', size: Number.MAX_SAFE_INTEGER + 1 }] },
    { kind: 'files', files: [null] }, { kind: 'files', files: [{ name: {}, size: 1 }] },
    { kind: 'note', length: 0 }, { kind: 'note', length: MAX_NOTE + 1 },
    { kind: 'note', length: '5' }, { kind: 'note', length: 1.5 },
  ]) assert.throws(() => validateManifest(invalid));
});

test('signaling guard rejects duplicates, stale packets, unknown messages, and malformed peer fields', () => {
  const now = Date.now();
  const guard = new SignalGuard(ME);
  const packet = (overrides = {}) => ({ v: 1, id: crypto.randomUUID(), from: PEER, to: ME, at: now, type: 'hello', payload: {}, ...overrides });
  const first = packet();
  assert.equal(guard.accepts(first, now), true);
  assert.equal(guard.accepts(first, now), false);
  assert.equal(guard.accepts(packet({ to: null }), now), true);
  for (const changes of [
    { v: 2 }, { from: ME }, { from: 'not-a-peer' }, { to: PEER },
    { to: undefined }, { at: now - 120001 }, { at: now + 120001 },
    { at: String(now) }, { type: 'run-code' }, { id: null },
    { id: [crypto.randomUUID()] }, { from: [PEER] },
    { id: { toString: 'not a function' } }, { from: { toString: 'not a function' } },
  ]) {
    assert.doesNotThrow(() => guard.accepts(packet(changes), now));
    assert.equal(guard.accepts(packet(changes), now), false);
  }
  assert.equal(guard.accepts(null, now), false);
});
