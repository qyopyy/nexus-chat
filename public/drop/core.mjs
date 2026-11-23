export const MAX_BYTES = 100 * 1024 * 1024;
export const MAX_FILES = 20;
export const MAX_NOTE = 8000;
export const CHUNK_BYTES = 16 * 1024;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const unit = bytes < 1024 ** 2 ? 'KB' : bytes < 1024 ** 3 ? 'MB' : 'GB';
  const scale = unit === 'KB' ? 1024 : unit === 'MB' ? 1024 ** 2 : 1024 ** 3;
  return `${(bytes / scale).toFixed(bytes / scale >= 10 ? 0 : 1)} ${unit}`;
}

export function cleanName(value, fallback = 'Untitled file', max = 180) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069/\\]/g, '').trim().slice(0, max) || fallback;
}

export function createRoomToken() {
  return toBase64(crypto.getRandomValues(new Uint8Array(32)));
}

export function toBase64(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64(text) {
  return Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
}

export function parseInvitation(value, base) {
  const input = String(value ?? '').trim();
  if (TOKEN.test(input) && toBase64(fromBase64(input)) === input) return input;
  try {
    const url = new URL(input);
    const expected = new URL(base);
    if (url.origin !== expected.origin || url.pathname !== expected.pathname || url.username || url.password) throw new Error();
    const token = new URLSearchParams(url.hash.slice(1)).get('room');
    if (TOKEN.test(token ?? '') && toBase64(fromBase64(token)) === token) return token;
  } catch { /* Report one useful message for every invalid invitation. */ }
  throw new Error('Paste a complete invitation from this Nexus Drop page, or its pairing code.');
}

export function invitationUrl(token, base) {
  parseInvitation(token, base);
  const url = new URL(base);
  url.search = '';
  url.hash = new URLSearchParams({ room: token }).toString();
  return url.href;
}

export function fileManifest(files) {
  const list = Array.from(files ?? []);
  return validateManifest({ kind: 'files', files: list.map(file => ({ name: cleanName(file.name), size: file.size })) });
}

export function validateManifest(value) {
  if (!value || typeof value !== 'object') throw new Error('Invalid transfer request.');
  if (value.kind === 'note') {
    if (!Number.isInteger(value.length) || value.length < 1 || value.length > MAX_NOTE) throw new Error('Notes can contain up to 8,000 characters.');
    return { kind: 'note', length: value.length, files: [], total: 0 };
  }
  if (value.kind !== 'files' || !Array.isArray(value.files) || !value.files.length || value.files.length > MAX_FILES) {
    throw new Error('Choose between 1 and 20 files.');
  }
  const files = value.files.map(file => {
    if (!file || typeof file.name !== 'string' || !Number.isSafeInteger(file.size) || file.size < 0 || file.size > MAX_BYTES) {
      throw new Error('Invalid file details.');
    }
    return { name: cleanName(file.name), size: file.size };
  });
  const total = files.reduce((sum, file) => sum + file.size, 0);
  if (total > MAX_BYTES) throw new Error('Send up to 100 MB per transfer.');
  return { kind: 'files', files, total };
}

export async function roomCipher(token) {
  parseInvitation(token, 'https://nexus.invalid/drop/index.html');
  const bytes = fromBase64(token);
  const key = await crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
  const topic = toBase64(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
  const encoder = new TextEncoder();
  const additionalData = encoder.encode('nexus-drop-signaling-v1');
  return {
    topic: `nexus-drop-v1-${topic}`,
    async encrypt(message) {
      const plain = encoder.encode(JSON.stringify(message));
      if (plain.length > 65536) throw new Error('Pairing message is too large.');
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData }, key, plain);
      return { iv: toBase64(iv), data: toBase64(new Uint8Array(data)) };
    },
    async decrypt(envelope) {
      if (!envelope || typeof envelope.iv !== 'string' || !/^[\w-]{16}$/.test(envelope.iv) || typeof envelope.data !== 'string' || envelope.data.length > 90000 || !/^[\w-]+$/.test(envelope.data)) throw new Error('Invalid pairing message.');
      const data = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(envelope.iv), additionalData }, key, fromBase64(envelope.data));
      return JSON.parse(new TextDecoder().decode(data));
    },
  };
}

// Both local-tab and remote signaling can deliver the same packet. Reject replay,
// stale packets, and messages addressed to a different device before dispatch.
export class SignalGuard {
  seen = new Map();
  constructor(peerId) { this.peerId = peerId; }
  accepts(message, now = Date.now()) {
    if (!message || message.v !== 1 || typeof message.id !== 'string' || typeof message.from !== 'string' || !UUID.test(message.id) || !UUID.test(message.from) || message.from === this.peerId || (message.to !== null && message.to !== this.peerId)) return false;
    if (!Number.isFinite(message.at) || Math.abs(now - message.at) > 120000 || this.seen.has(message.id)) return false;
    if (!['hello', 'welcome', 'bye', 'request', 'accept', 'reject', 'cancel', 'offer', 'answer', 'ice'].includes(message.type)) return false;
    this.seen.set(message.id, now);
    for (const [id, time] of this.seen) if (time < now - 120000 || this.seen.size > 1024) this.seen.delete(id);
    return true;
  }
}
