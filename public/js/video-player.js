// WHEP playback through the server's signaling proxy, and frozen-picture detection.

const ICE_GATHERING_TIMEOUT_MS = 2000;
/** Playout buffer: smoothness over the last ~0.1 s of latency. */
const PLAYOUT_BUFFER_MS = globalThis.matchMedia?.('(pointer: coarse)').matches ? 50 : 100;

/** Resolves once ICE gathering is done (or after a short timeout: what we have is enough). */
function iceGatheringDone(connection) {
  if (connection.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ICE_GATHERING_TIMEOUT_MS);
    connection.addEventListener('icegatheringstatechange', () => {
      if (connection.iceGatheringState !== 'complete') return;
      clearTimeout(timer);
      resolve();
    });
  });
}

/**
 * One receive-only WebRTC session. `start()` resolves with the HTTP status of the offer
 * (201 = connecting); `onState` reports 'connected' and 'failed'.
 */
export class WhepSession {
  constructor({ route, token, iceServers, kinds, onTrack, onState }) {
    this.route = route;
    this.token = token;
    this.connection = new RTCPeerConnection({ iceServers });
    for (const kind of kinds) this.connection.addTransceiver(kind, { direction: 'recvonly' });
    this.connection.addEventListener('track', (event) => {
      if ('jitterBufferTarget' in event.receiver) event.receiver.jitterBufferTarget = PLAYOUT_BUFFER_MS;
      if ('playoutDelayHint' in event.receiver) event.receiver.playoutDelayHint = PLAYOUT_BUFFER_MS / 1000;
      onTrack(event.track);
    });
    this.connection.addEventListener('connectionstatechange', () => {
      const state = this.connection.connectionState;
      if (state === 'connected') onState('connected');
      if (state === 'failed' || state === 'disconnected') onState('failed');
    });
  }

  async start() {
    await this.connection.setLocalDescription(await this.connection.createOffer());
    await iceGatheringDone(this.connection);
    const response = await fetch(this.route, {
      method: 'POST',
      headers: { 'content-type': 'application/sdp', 'x-video-token': this.token },
      body: this.connection.localDescription.sdp,
    });
    if (response.status === 201) {
      await this.connection.setRemoteDescription({ type: 'answer', sdp: await response.text() });
    }
    return response.status;
  }

  close() {
    this.connection.close();
    fetch(this.route, { method: 'DELETE', headers: { 'x-video-token': this.token } }).catch(() => {});
  }

  /** Inbound video stats, or null. */
  async videoStats() {
    let video = null;
    (await this.connection.getStats()).forEach((report) => {
      if (report.type === 'inbound-rtp' && report.kind === 'video') video = report;
    });
    return video;
  }
}

/**
 * Feed it inbound video stats every few hundred ms; `update()` returns true when the page should
 * ask for a keyframe (the picture froze, or the browser itself asked with a PLI).
 */
export class StallWatch {
  constructor({ stallMs = 700, resendMs = 3000 } = {}) {
    this.stallMs = stallMs;
    this.resendMs = resendMs;
    this.lastRequestAt = Number.NEGATIVE_INFINITY;
    this.frames = null;
    this.plis = 0;
    this.progressAt = 0;
  }

  update(now, { framesDecoded = 0, pliCount = 0 } = {}) {
    if (this.frames === null) {
      this.frames = framesDecoded;
      this.plis = pliCount;
      this.progressAt = now;
      return false;
    }
    const newPli = pliCount > this.plis;
    this.plis = pliCount;
    if (framesDecoded !== this.frames) {
      this.frames = framesDecoded;
      this.progressAt = now;
    }
    const frozen = now - this.progressAt >= this.stallMs;
    if ((!newPli && !frozen) || now - this.lastRequestAt < this.resendMs) return false;
    this.lastRequestAt = now;
    return true;
  }
}
