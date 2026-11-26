import type { IncomingMessage, ServerResponse } from 'node:http';
import type { VideoAccess } from '../../application/video-access.ts';
import { PayloadTooLarge, readText } from '../http/http-util.ts';
import { sanitizeOffer, stripIpv6Candidates } from './sdp.ts';

const MAX_OFFER_BYTES = 16 * 1024;
const UPSTREAM_TIMEOUT_MS = 10_000;
/** A private per-socket secret; player ids are public because the queue broadcasts them. */
const VIDEO_TOKEN_HEADER = 'x-video-token';

type WhepProxyOptions = {
  /** Media server WebRTC HTTP base, e.g. http://127.0.0.1:8889 */
  upstream: string;
  /** Our route browsers post their offer to, e.g. /api/video */
  route: string;
  /** Media server path the stream is published on (from configuration, never from a browser). */
  path: string;
  access: VideoAccess;
  /** Maps a video token to the player id, or null. */
  resolvePlayer(token: string): string | null;
  /** Addresses viewers may never offer as ICE candidates (e.g. the console). */
  blockedCandidateAddresses?: readonly string[];
  hideIpv6?: boolean;
  upstreamTimeoutMs?: number;
  /** Called once a player's session is set up (e.g. to ask the console for a keyframe). */
  onSession?: (playerId: string) => void;
};

/**
 * WHEP signaling relay: browsers talk only to our server, which checks who may watch and forwards
 * the SDP offer to the local media server. Media itself flows directly over WebRTC.
 */
export class WhepProxy {
  readonly #o: Required<WhepProxyOptions>;

  constructor(options: WhepProxyOptions) {
    this.#o = {
      blockedCandidateAddresses: [],
      hideIpv6: false,
      upstreamTimeoutMs: UPSTREAM_TIMEOUT_MS,
      onSession: () => {},
      ...options,
      upstream: options.upstream.replace(/\/$/, ''),
    };
  }

  /** Returns false when the request is not for this route. */
  async handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    if (new URL(req.url ?? '/', 'http://localhost').pathname !== this.#o.route) return false;
    if (req.method !== 'POST' && req.method !== 'DELETE') {
      res.writeHead(405, { allow: 'POST, DELETE' }).end();
      return true;
    }
    const header = req.headers[VIDEO_TOKEN_HEADER];
    const playerId = typeof header === 'string' && header ? this.#o.resolvePlayer(header) : null;
    if (!playerId) {
      res.writeHead(401).end('Not connected');
      return true;
    }
    if (req.method === 'POST') await this.#offer(req, res, playerId);
    else {
      await this.disconnect(playerId);
      res.writeHead(204).end();
    }
    return true;
  }

  /** Ends the sessions of players no longer allowed to watch. */
  async revokeIneligible(): Promise<void> {
    await Promise.all(this.#o.access.revocable().map((id) => this.disconnect(id)));
  }

  /** Tears down whatever session a player left open. */
  async disconnect(playerId: string): Promise<void> {
    const session = this.#o.access.release(playerId);
    if (session) await this.#teardown(session);
  }

  async #offer(req: IncomingMessage, res: ServerResponse, playerId: string): Promise<void> {
    const { access } = this.#o;
    const admission = access.admit(playerId);
    if (admission === 'unknown') return void res.writeHead(401).end('Not connected');
    if (admission === 'full') return void res.writeHead(429).end('No free video slot');

    // Reserve before any await so two concurrent offers cannot both take the last slot.
    const replaced = access.reserve(playerId);
    if (replaced) await this.#teardown(replaced);
    const fail = (status: number, text: string) => {
      access.release(playerId);
      res.writeHead(status).end(text);
    };

    let offer: string;
    try {
      offer = await readText(req, MAX_OFFER_BYTES);
    } catch (error) {
      if (error instanceof PayloadTooLarge) return fail(413, 'Offer too large');
      throw error;
    }
    const sanitized = sanitizeOffer(offer, this.#o.blockedCandidateAddresses.filter(Boolean));
    const clean = (sdp: string) => (this.#o.hideIpv6 ? stripIpv6Candidates(sdp) : sdp);

    let upstream: Response;
    let answer: string;
    try {
      upstream = await fetch(`${this.#o.upstream}/${this.#o.path}/whep`, {
        method: 'POST',
        headers: { 'content-type': 'application/sdp' },
        body: clean(sanitized),
        signal: AbortSignal.timeout(this.#o.upstreamTimeoutMs),
      });
      answer = await upstream.text();
    } catch {
      return fail(503, 'Video server unavailable');
    }
    if (upstream.status === 404) return fail(503, 'Stream offline');
    if (!upstream.ok) return fail(502, 'Video server error');

    const location = upstream.headers.get('location');
    const session = location ? new URL(location, this.#o.upstream).href : '';
    if (access.admit(playerId) === 'unknown') {
      // The player disconnected during the handshake: do not leave an orphan stream.
      access.release(playerId);
      if (session) await this.#teardown(session);
      return void res.writeHead(410).end('Player disconnected');
    }
    // A concurrent offer from the same player may have registered first: replace it cleanly.
    const superseded = access.register(playerId, session);
    if (superseded) await this.#teardown(superseded);
    res.writeHead(201, { 'content-type': 'application/sdp' }).end(clean(answer));
    this.#o.onSession(playerId);
  }

  async #teardown(sessionUrl: string): Promise<void> {
    try {
      await fetch(sessionUrl, { method: 'DELETE', signal: AbortSignal.timeout(this.#o.upstreamTimeoutMs) });
    } catch {
      // The media server also drops the session on its own once ICE times out.
    }
  }
}
