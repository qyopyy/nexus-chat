import { createClient } from '../presave/vendor/supabase.mjs';
import { roomCipher, SignalGuard, cleanName } from './core.mjs';

export class DropRoom {
  peers = new Map();
  closed = false;
  remoteReady = false;
  constructor({ token, name, kind, onPeers, onSignal, onStatus, config = window.NEXUS_DROP_CONFIG ?? window.NEXUS_PRESAVE_CONFIG ?? {} }) {
    Object.assign(this, { token, name: cleanName(name, 'My device', 32), kind, onPeers, onSignal, onStatus, config });
    this.id = crypto.randomUUID();
    this.guard = new SignalGuard(this.id);
  }

  async start() {
    this.cipher = await roomCipher(this.token);
    if (this.closed) return;
    if (typeof BroadcastChannel !== 'undefined') {
      this.local = new BroadcastChannel(this.cipher.topic);
      this.local.onmessage = event => void this.receive(event.data, true);
    }
    this.onStatus('connecting');
    if (this.config.supabaseUrl && this.config.supabaseKey) {
      this.client = createClient(this.config.supabaseUrl, this.config.supabaseKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        realtime: { params: { eventsPerSecond: 20 } },
      });
      this.channel = this.client.channel(this.cipher.topic, { config: { broadcast: { self: false, ack: true } } });
      this.channel.on('broadcast', { event: 'signal' }, event => void this.receive(event.payload));
      this.channel.subscribe(status => {
        if (this.closed) return;
        this.remoteReady = status === 'SUBSCRIBED';
        if (this.remoteReady) {
          this.onStatus('online');
          this.announce().catch(() => this.onStatus('offline'));
        } else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) this.onStatus('offline');
      });
    } else this.onStatus('local');
    await this.announce();
    if (this.closed) return;
    this.heartbeat = setInterval(() => {
      if (this.closed) return;
      this.announce().catch(() => {});
      for (const [id, peer] of this.peers) if (Date.now() - peer.lastSeen > 45000) this.peers.delete(id);
      this.onPeers(Array.from(this.peers.values()));
    }, 15000);
  }

  async send(type, payload = {}, to = null) {
    if (this.closed || !this.cipher) throw new Error('Join a room before sending.');
    const message = { v: 1, id: crypto.randomUUID(), from: this.id, to, at: Date.now(), type, payload };
    const envelope = await this.cipher.encrypt(message);
    if (this.closed) throw new Error('This room has closed.');
    this.local?.postMessage(envelope);
    if (this.remoteReady) {
      const result = await this.channel.send({ type: 'broadcast', event: 'signal', payload: envelope });
      if (result !== 'ok' && !this.peers.get(to)?.local) throw new Error('The pairing service is unavailable. Reconnect and try again.');
    } else if (to && !this.peers.get(to)?.local) throw new Error('The pairing service is offline. Reconnect to reach another device.');
  }

  announce() { return this.send('hello', { name: this.name, kind: this.kind }); }

  async receive(envelope, local = false) {
    if (this.closed || !this.cipher) return;
    let message;
    try { message = await this.cipher.decrypt(envelope); }
    catch { return; }
    if (this.closed) return;
    if (local && this.peers.has(message?.from)) this.peers.get(message.from).local = true;
    if (!this.guard.accepts(message)) return;
    const { from, type, payload } = message;
    if (type === 'hello' || type === 'welcome') {
      if (!payload || typeof payload.name !== 'string' || payload.name.length > 100 || !['desktop', 'phone', 'tablet'].includes(payload.kind)) return;
      if (!this.peers.has(from) && this.peers.size >= 16) return;
      this.peers.set(from, { id: from, name: cleanName(payload.name, 'Another device', 32), kind: payload.kind, lastSeen: Date.now(), local: local || Boolean(this.peers.get(from)?.local) });
      this.onPeers(Array.from(this.peers.values()));
      if (type === 'hello') this.send('welcome', { name: this.name, kind: this.kind }, from).catch(() => {});
    } else if (type === 'bye') {
      this.peers.delete(from);
      this.onPeers(Array.from(this.peers.values()));
    } else if (this.peers.has(from)) {
      this.peers.get(from).lastSeen = Date.now();
      try { await this.onSignal(type, payload, from); }
      catch { this.onStatus('offline'); }
    }
  }

  async rename(name) {
    this.name = cleanName(name, 'My device', 32);
    await this.announce();
  }

  async close() {
    if (this.closed) return;
    const wasRemoteReady = this.remoteReady;
    // Stop new work synchronously, before asynchronous departure encryption or
    // a remote acknowledgement can race a reconnect/leave operation.
    this.closed = true;
    this.remoteReady = false;
    clearInterval(this.heartbeat);
    this.peers.clear();
    const bounded = promise => new Promise(resolve => {
      const timer = setTimeout(resolve, 1000);
      Promise.resolve(promise).then(() => { clearTimeout(timer); resolve(); }, () => { clearTimeout(timer); resolve(); });
    });
    try {
      if (this.cipher) {
        const envelope = await this.cipher.encrypt({ v: 1, id: crypto.randomUUID(), from: this.id, to: null, at: Date.now(), type: 'bye', payload: {} });
        this.local?.postMessage(envelope);
        if (wasRemoteReady) await bounded(this.channel.send({ type: 'broadcast', event: 'signal', payload: envelope }));
      }
    } catch { /* Best-effort departure; heartbeat expiry also removes peers. */ }
    finally {
      this.local?.close();
      try { if (this.channel) await bounded(this.client.removeChannel(this.channel)); }
      finally { this.client?.realtime.disconnect(); }
    }
  }
}
