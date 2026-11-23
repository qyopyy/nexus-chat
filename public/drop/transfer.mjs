import { CHUNK_BYTES, MAX_NOTE, UUID, fileManifest, validateManifest } from './core.mjs';

// One consented transfer per device bounds memory and makes simultaneous offers
// deterministic. The reliable, ordered data channel carries bytes, not signaling.
export class DropTransfer {
  active = null;
  constructor({ signal, onChange = () => {}, onReceived = () => {}, peerFactory = options => new RTCPeerConnection(options), rtcConfig = {} }) {
    this.signal = signal;
    this.onChange = onChange;
    this.onReceived = onReceived;
    this.peerFactory = peerFactory;
    this.rtcConfig = rtcConfig;
  }

  emit() {
    const a = this.active;
    this.onChange(a ? { id: a.id, peer: a.peer, direction: a.direction, manifest: a.manifest, phase: a.phase, bytes: a.bytes, progress: a.manifest.total ? Math.min(1, a.bytes / a.manifest.total) : a.phase === 'complete' ? 1 : 0, error: a.error ?? '' } : null);
  }

  deadline(ms, message) {
    if (!this.active) return;
    clearTimeout(this.active.timer);
    const active = this.active;
    active.timer = setTimeout(() => { if (this.active === active) this.fail(message); }, ms);
    active.timer.unref?.();
  }

  async request(peer, content) {
    if (this.active) throw new Error('Finish or dismiss the current transfer first.');
    if (!UUID.test(peer)) throw new Error('Choose a device in your room.');
    const files = Array.from(content.files ?? []);
    const text = String(content.text ?? '');
    const manifest = files.length ? fileManifest(files) : validateManifest({ kind: 'note', length: text.length });
    const a = this.active = { id: crypto.randomUUID(), peer, direction: 'outgoing', manifest, files, text, bytes: 0, phase: 'waiting', candidates: [] };
    this.emit();
    this.deadline(60000, 'The other device did not respond. Try sending again.');
    try { await this.signal('request', { transfer: a.id, manifest }, peer); }
    catch (error) { if (this.active === a) this.fail(error.message); throw error; }
  }

  async receive(type, payload, from) {
    if (!payload || typeof payload.transfer !== 'string' || typeof from !== 'string' || !UUID.test(payload.transfer) || !UUID.test(from)) return;
    if (type === 'request') {
      if (this.active) {
        await this.signal('reject', { transfer: payload.transfer, reason: 'This device is busy. Try again in a moment.' }, from);
        return;
      }
      let manifest;
      try { manifest = validateManifest(payload.manifest); }
      catch { await this.signal('reject', { transfer: payload.transfer, reason: 'The transfer request is invalid or exceeds 100 MB.' }, from); return; }
      this.active = { id: payload.transfer, peer: from, direction: 'incoming', manifest, bytes: 0, phase: 'approval', candidates: [], received: [], nextIndex: 0 };
      this.emit();
      this.deadline(60000, 'This request expired. Ask the sender to try again.');
      return;
    }
    const a = this.active;
    if (!a || a.id !== payload.transfer || a.peer !== from || ['complete', 'failed', 'cancelled'].includes(a.phase)) return;
    try {
      if (type === 'reject' || type === 'cancel') {
        this.finish(type === 'cancel' ? 'cancelled' : 'failed', type === 'cancel' ? 'The other device cancelled this transfer.' : String(payload.reason ?? 'The transfer was declined.').slice(0, 160));
      } else if (type === 'accept' && a.direction === 'outgoing' && a.phase === 'waiting') {
        a.phase = 'connecting';
        const pc = this.connection(a);
        this.bindChannel(a, pc.createDataChannel('nexus-drop-v1', { ordered: true }));
        this.emit();
        this.deadline(30000, 'Could not connect directly. Try the same Wi-Fi network, or use the cloud inbox in Phone Link.');
        await pc.setLocalDescription(await pc.createOffer());
        if (this.active === a && a.phase === 'connecting') await this.signal('offer', { transfer: a.id, description: pc.localDescription.toJSON() }, a.peer);
      } else if (type === 'offer' && a.direction === 'incoming' && a.phase === 'connecting' && !a.pc) {
        if (payload.description?.type !== 'offer' || typeof payload.description.sdp !== 'string' || payload.description.sdp.length > 60000) throw new Error('Invalid connection offer.');
        const pc = this.connection(a);
        pc.ondatachannel = event => { if (!a.channel && this.active === a) this.bindChannel(a, event.channel); else event.channel.close(); };
        await pc.setRemoteDescription(payload.description);
        await this.flushCandidates(a);
        await pc.setLocalDescription(await pc.createAnswer());
        if (this.active === a && a.phase === 'connecting') await this.signal('answer', { transfer: a.id, description: pc.localDescription.toJSON() }, a.peer);
      } else if (type === 'answer' && a.direction === 'outgoing' && a.pc && !a.pc.remoteDescription) {
        if (payload.description?.type !== 'answer' || typeof payload.description.sdp !== 'string' || payload.description.sdp.length > 60000) throw new Error('Invalid connection answer.');
        await a.pc.setRemoteDescription(payload.description);
        await this.flushCandidates(a);
      } else if (type === 'ice' && ['connecting', 'sending', 'receiving'].includes(a.phase)) {
        const c = payload.candidate;
        if (!c || typeof c.candidate !== 'string' || c.candidate.length > 4096) return;
        if (a.pc?.remoteDescription) await a.pc.addIceCandidate(c);
        else if (a.candidates.length < 128) a.candidates.push(c);
      }
    } catch (error) { if (this.active === a) this.fail(error.message || 'The connection was interrupted.'); }
  }

  async accept() {
    const a = this.active;
    if (!a || a.direction !== 'incoming' || a.phase !== 'approval') return;
    a.phase = 'connecting';
    this.emit();
    this.deadline(30000, 'Could not connect directly. Try the same Wi-Fi network, or use the cloud inbox in Phone Link.');
    try { await this.signal('accept', { transfer: a.id }, a.peer); }
    catch (error) { if (this.active === a) this.fail(error.message); }
  }

  connection(a) {
    const pc = a.pc = this.peerFactory(this.rtcConfig);
    pc.onicecandidate = event => {
      if (event.candidate && this.active === a && !['failed', 'cancelled', 'complete'].includes(a.phase)) {
        this.signal('ice', { transfer: a.id, candidate: event.candidate.toJSON() }, a.peer).catch(() => { if (this.active === a) this.fail('Pairing connection was lost.'); });
      }
    };
    pc.onconnectionstatechange = () => {
      if (this.active !== a || ['failed', 'cancelled', 'complete'].includes(a.phase)) return;
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') this.fail('The device disconnected. Send again to retry.');
    };
    return pc;
  }

  async flushCandidates(a) {
    for (const candidate of a.candidates.splice(0)) await a.pc.addIceCandidate(candidate);
  }

  bindChannel(a, channel) {
    a.channel = channel;
    channel.binaryType = 'arraybuffer';
    channel.bufferedAmountLowThreshold = 64 * 1024;
    channel.onopen = () => {
      if (this.active !== a || a.phase !== 'connecting') return channel.close();
      a.phase = a.direction === 'outgoing' ? 'sending' : 'receiving';
      this.emit();
      this.deadline(60000, 'The transfer stopped responding. Send again to retry.');
      if (a.direction === 'outgoing') this.sendContent(a).catch(error => { if (this.active === a && a.phase !== 'cancelled') this.fail(error.message); });
    };
    channel.onmessage = event => {
      if (this.active !== a || !['sending', 'receiving'].includes(a.phase)) return;
      try { this.data(a, event.data); }
      catch (error) { this.fail(error.message); }
    };
    channel.onerror = () => { if (this.active === a && !['complete', 'failed', 'cancelled'].includes(a.phase)) this.fail('The transfer connection failed.'); };
    channel.onclose = () => { if (this.active === a && !['complete', 'failed', 'cancelled'].includes(a.phase)) this.fail('The transfer ended before all data arrived.'); };
  }

  async writable(a) {
    if (this.active !== a || a.phase !== 'sending' || a.channel?.readyState !== 'open') throw new Error('The transfer is no longer connected.');
    if (a.channel.bufferedAmount <= 256 * 1024) return;
    await new Promise((resolve, reject) => {
      const channel = a.channel;
      const cleanup = () => { clearTimeout(timer); channel.removeEventListener('bufferedamountlow', drained); channel.removeEventListener('close', closed); channel.removeEventListener('error', closed); };
      const drained = () => { cleanup(); resolve(); };
      const closed = () => { cleanup(); reject(new Error('The connection closed during transfer.')); };
      const timer = setTimeout(() => { cleanup(); reject(new Error('The transfer stalled. Send again to retry.')); }, 30000);
      channel.addEventListener('bufferedamountlow', drained, { once: true });
      channel.addEventListener('close', closed, { once: true });
      channel.addEventListener('error', closed, { once: true });
      if (channel.bufferedAmount <= channel.bufferedAmountLowThreshold) drained();
    });
  }

  async sendContent(a) {
    const control = async value => { await this.writable(a); a.channel.send(JSON.stringify(value)); };
    if (a.manifest.kind === 'note') await control({ type: 'note', text: a.text });
    else for (let i = 0; i < a.files.length; i++) {
      await control({ type: 'file-start', index: i });
      const file = a.files[i];
      for (let offset = 0; offset < file.size; offset += CHUNK_BYTES) {
        await this.writable(a);
        const buffer = await file.slice(offset, offset + CHUNK_BYTES).arrayBuffer();
        if (this.active !== a || a.phase !== 'sending') throw new Error('Transfer cancelled.');
        a.channel.send(buffer);
        a.bytes += buffer.byteLength;
        this.progress(a);
      }
      await control({ type: 'file-end', index: i });
    }
    // Delivery is successful only after the receiver validates and acknowledges.
    a.sentAll = true;
    await control({ type: 'complete' });
    if (this.active !== a || a.phase !== 'sending') return;
    this.deadline(30000, 'The receiver did not confirm delivery. Check the other device before retrying.');
  }

  progress(a) {
    const now = Date.now();
    if (!a.lastProgress || now - a.lastProgress > 100) {
      a.lastProgress = now;
      this.emit();
      this.deadline(60000, 'The transfer stopped responding. Send again to retry.');
    }
  }

  data(a, data) {
    if (data instanceof ArrayBuffer) {
      if (a.direction !== 'incoming' || a.manifest.kind !== 'files' || !a.current || !data.byteLength || data.byteLength > CHUNK_BYTES || a.current.bytes + data.byteLength > a.manifest.files[a.nextIndex].size) throw new Error('Received unexpected file data.');
      a.current.chunks.push(data);
      a.current.bytes += data.byteLength;
      a.bytes += data.byteLength;
      this.progress(a);
      return;
    }
    if (typeof data !== 'string' || data.length > 50000) throw new Error('Invalid transfer message.');
    const message = JSON.parse(data);
    if (!message || typeof message !== 'object') throw new Error('Invalid transfer message.');
    if (a.direction === 'outgoing') {
      if (message.type !== 'received' || !a.sentAll) throw new Error('Invalid delivery confirmation.');
      this.finish('complete');
      return;
    }
    if (message.type === 'file-start') {
      if (a.manifest.kind !== 'files' || a.current || message.index !== a.nextIndex || a.nextIndex >= a.manifest.files.length) throw new Error('Invalid file order.');
      a.current = { chunks: [], bytes: 0 };
    } else if (message.type === 'file-end') {
      if (!a.current || message.index !== a.nextIndex || a.current.bytes !== a.manifest.files[a.nextIndex].size) throw new Error('The file was incomplete. Send it again.');
      a.received.push({ ...a.manifest.files[a.nextIndex], blob: new Blob(a.current.chunks, { type: 'application/octet-stream' }) });
      a.current = null;
      a.nextIndex++;
    } else if (message.type === 'note') {
      if (a.manifest.kind !== 'note' || a.note !== undefined || typeof message.text !== 'string' || message.text.length !== a.manifest.length || message.text.length > MAX_NOTE) throw new Error('Invalid note.');
      a.note = message.text;
    } else if (message.type === 'complete') {
      if (a.current || (a.manifest.kind === 'files' && a.nextIndex !== a.manifest.files.length) || (a.manifest.kind === 'note' && a.note === undefined)) throw new Error('The transfer is incomplete.');
      this.onReceived({ id: a.id, peer: a.peer, files: a.received, text: a.note });
      a.channel.send(JSON.stringify({ type: 'received' }));
      this.finish('complete', '', false);
    } else throw new Error('Unknown transfer message.');
    this.emit();
  }

  finish(phase, error = '', close = true) {
    const a = this.active;
    if (!a) return;
    clearTimeout(a.timer);
    a.phase = phase;
    a.error = error;
    a.current = null;
    a.files = [];
    a.text = '';
    a.received = [];
    a.note = undefined;
    if (close) { a.channel?.close(); a.pc?.close(); }
    else { const timer = setTimeout(() => { a.channel?.close(); a.pc?.close(); }, 30000); timer.unref?.(); }
    this.emit();
  }

  fail(message) {
    const a = this.active;
    if (!a || ['complete', 'failed', 'cancelled'].includes(a.phase)) return;
    this.signal('cancel', { transfer: a.id }, a.peer).catch(() => {});
    this.finish('failed', String(message || 'The transfer failed. Please try again.').slice(0, 200));
  }

  cancel() {
    const a = this.active;
    if (!a) return;
    if (!['complete', 'failed', 'cancelled'].includes(a.phase)) this.signal(a.phase === 'approval' ? 'reject' : 'cancel', { transfer: a.id, reason: 'The transfer was declined.' }, a.peer).catch(() => {});
    this.finish('cancelled', 'Transfer cancelled.');
  }

  dismiss() {
    if (this.active && !['complete', 'failed', 'cancelled'].includes(this.active.phase)) this.cancel();
    this.active?.channel?.close();
    this.active?.pc?.close();
    this.active = null;
    this.emit();
  }
}
