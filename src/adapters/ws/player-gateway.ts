import { randomUUID } from 'node:crypto';
import type { IncomingMessage, Server } from 'node:http';
import { type WebSocket, WebSocketServer } from 'ws';
import { decodeInput } from '../../../public/js/input-codec.js';
import type { Lobby, Notifier } from '../../application/lobby.ts';
import type { Account } from '../../application/login-sessions.ts';
import type { Logger } from '../../application/ports.ts';
import type { Presence } from '../../application/presence.ts';
import { ConnectionLimit, type RateLimiter } from '../../application/rate-limiter.ts';
import { clientOrigin, type TrustedProxy } from '../http/client-origin.ts';

/** Browsers send controller frames up to ~125/s plus heartbeats and pings. */
const MAX_MESSAGES_PER_SECOND = 300;
/** Joining or leaving at most once per this interval per socket. */
const LINE_CHANGE_MIN_MS = 1000;
/** A client that reads slower than we send is dropped before its backlog fills memory. */
const MAX_BUFFERED_BYTES = 1024 * 1024;
/** Open WebSockets across all visitors; past it, new ones are refused until some close. */
const DEFAULT_MAX_SOCKETS = 1000;

type PlayerGatewayOptions = {
  server: Server;
  lobby: Lobby;
  presence: Presence;
  /** Reads the logged-in account from the upgrade request's cookie. */
  accountOf(req: IncomingMessage): Account | null;
  /** Shared with the HTTP server: upgrades spend from the same per-visitor budget. */
  httpLimiter: RateLimiter;
  maxConnectionsPerIp: number;
  /** Cap on open sockets across all visitors. */
  maxSockets?: number;
  /** Whose forwarding header identifies visitors. */
  trustedProxy: TrustedProxy;
  /** With a public URL only its exact origin may open a socket; otherwise Origin must match Host. */
  publicUrl: string;
  /** While paused nobody may connect. */
  paused: boolean;
  /** Called when a player's last socket closes (e.g. to end their video sessions). */
  onDisconnect?: (playerId: string) => void;
  log?: Logger;
};

/**
 * The WebSocket adapter: authenticates the upgrade, maps sockets to player identities, applies
 * per-connection limits and decodes messages into {@link Lobby} calls. Implements the lobby's
 * {@link Notifier} port.
 */
export class PlayerGateway implements Notifier {
  readonly #o: PlayerGatewayOptions;
  readonly #wss: WebSocketServer;
  readonly #sockets = new Map<string, WebSocket>();
  /** Video token → player id. Tokens go only to their own socket; player ids are public. */
  readonly #videoTokens = new Map<string, string>();
  readonly #connectionLimit: ConnectionLimit;
  readonly #log: Logger;

  constructor(options: PlayerGatewayOptions) {
    this.#o = options;
    this.#log = options.log ?? console.warn;
    this.#connectionLimit = new ConnectionLimit(options.maxConnectionsPerIp);
    this.#wss = new WebSocketServer({
      server: options.server,
      path: '/ws',
      maxPayload: 4096,
      verifyClient: ({ origin, req }, done) => {
        if (options.paused) return done(false, 503, 'Paused');
        if (this.#wss.clients.size >= (options.maxSockets ?? DEFAULT_MAX_SOCKETS)) return done(false, 503, 'Full');
        if (!options.httpLimiter.take(clientOrigin(req, options.trustedProxy))) {
          return done(false, 429, 'Too many requests');
        }
        // Cross-site WebSocket hijacking: another page must not open our socket from a visitor's
        // browser. Browsers always send Origin; tools without one cannot borrow cookies anyway.
        done(this.#sameSite(origin, req));
      },
    });
    // Without these listeners `ws` errors (e.g. an oversized frame) would crash the process.
    this.#wss.on('error', (error) => this.#log(`WebSocket server error: ${error.message}`));
    this.#wss.on('connection', (socket, req) => this.#connected(socket, req));
  }

  /** True while the player has an open socket. */
  isConnected(playerId: string): boolean {
    return this.#sockets.has(playerId);
  }

  /** The player a video token belongs to, or null. */
  playerForVideoToken(token: string): string | null {
    return this.#videoTokens.get(token) ?? null;
  }

  /** How many players have an open socket. */
  get connectedCount(): number {
    return this.#sockets.size;
  }

  /** How many sockets are open (players and spectators). */
  get socketCount(): number {
    return this.#wss.clients.size;
  }

  toPlayer(playerId: string, message: object | string): void {
    const socket = this.#sockets.get(playerId);
    if (socket && socket.readyState === socket.OPEN) {
      socket.send(typeof message === 'string' ? message : JSON.stringify(message));
    }
  }

  toAll(message: object | string): void {
    const data = typeof message === 'string' ? message : JSON.stringify(message);
    for (const client of this.#wss.clients) {
      if (client.readyState !== client.OPEN) continue;
      if (client.bufferedAmount > MAX_BUFFERED_BYTES) client.terminate();
      else client.send(data);
    }
  }

  #sameSite(origin: string | undefined, req: IncomingMessage): boolean {
    if (!origin) return true;
    const url = URL.parse(origin);
    if (!url) return false;
    if (this.#o.publicUrl) return url.origin === URL.parse(this.#o.publicUrl)?.origin;
    return url.host === req.headers.host;
  }

  #connected(socket: WebSocket, req: IncomingMessage): void {
    const { lobby, presence } = this.#o;
    // ws closes the socket after emitting; we only need to keep the process alive.
    socket.on('error', (error) => this.#log(`WebSocket client error: ${error.message}`));
    const origin = clientOrigin(req, this.#o.trustedProxy);
    if (!this.#connectionLimit.tryOpen(origin)) {
      socket.close(1008, 'too-many-connections');
      return;
    }
    socket.on('close', () => this.#connectionLimit.close(origin));

    const resumeParam = new URL(req.url ?? '/', 'http://localhost').searchParams.get('resume') ?? '';
    const resumedId = resumeParam ? presence.resume(resumeParam) : null;
    const { playerId, resumeToken } = resumedId
      ? { playerId: resumedId, resumeToken: resumeParam }
      : presence.connect();
    // Read once: logging in reloads the page, so a new login always comes with a new socket.
    const account = this.#o.accountOf(req);
    const videoToken = randomUUID();
    this.#sockets.set(playerId, socket);
    this.#videoTokens.set(videoToken, playerId);

    socket.send(JSON.stringify({ type: 'hello', id: playerId, videoToken, resumeToken, resumed: resumedId !== null }));
    lobby.welcome(playerId, resumedId !== null);

    const state = { windowStart: Date.now(), messages: 0, lastLineChange: 0 };
    socket.on('message', (data, isBinary) => {
      const now = Date.now();
      if (now - state.windowStart >= 1000) {
        state.windowStart = now;
        state.messages = 0;
      }
      if (++state.messages > MAX_MESSAGES_PER_SECOND) {
        socket.close(1008, 'rate-limit');
        return;
      }
      const bytes = Array.isArray(data) ? Buffer.concat(data) : Buffer.isBuffer(data) ? data : Buffer.from(data);
      if (isBinary) {
        // Hot path: the 15-byte controller frame.
        const frame = decodeInput(bytes);
        if (frame) lobby.input(playerId, frame);
        return;
      }
      const message = parseMessage(bytes.toString());
      if (!message) return;
      switch (message.type) {
        case 'join': {
          if (now - state.lastLineChange < LINE_CHANGE_MIN_MS) break;
          state.lastLineChange = now;
          const rejected = lobby.join(playerId, { name: stringField(message, 'name'), account, origin });
          if (rejected) this.toPlayer(playerId, { type: 'join-rejected', reason: rejected });
          break;
        }
        case 'leave':
          if (now - state.lastLineChange < LINE_CHANGE_MIN_MS) break;
          state.lastLineChange = now;
          lobby.leave(playerId);
          break;
        case 'ping':
          this.toPlayer(playerId, { type: 'pong', t: typeof message.t === 'number' ? message.t : 0 });
          break;
        case 'video-stalled':
          lobby.videoStalled(playerId);
          break;
      }
    });

    socket.on('close', () => {
      this.#videoTokens.delete(videoToken);
      if (this.#sockets.get(playerId) !== socket) return;
      this.#sockets.delete(playerId);
      lobby.disconnected(playerId);
      this.#o.onDisconnect?.(playerId);
    });
  }
}

/** A JSON message object, or null for anything else (JSON.parse also accepts numbers, arrays...). */
function parseMessage(text: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function stringField(message: Record<string, unknown>, key: string): string {
  const value = message[key];
  return typeof value === 'string' ? value : '';
}
