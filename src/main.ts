/**
 * Composition root: reads the configuration, builds every component, wires them together and
 * starts the HTTP/WebSocket server. No business logic lives here.
 */
import { join } from 'node:path';
import { type Config, ConfigError, loadConfig } from './adapters/config/env-config.ts';
import { ChiakiConsole } from './adapters/console/chiaki-console.ts';
import { SimulatedConsole } from './adapters/console/simulated-console.ts';
import { AdminApi, type AdminBackend } from './adapters/http/admin-api.ts';
import { GatedConsole, MacroRunner } from './application/macros.ts';
import { AuthApi } from './adapters/http/auth-api.ts';
import { createHttpServer, type RequestHandler } from './adapters/http/http-server.ts';
import { KickOAuth } from './adapters/kick/kick-oauth.ts';
import { StreamHealth } from './adapters/mediamtx/stream-health.ts';
import { WhepProxy } from './adapters/mediamtx/whep-proxy.ts';
import { readJsonFile, SaveScheduler, writeJsonFileAtomic } from './adapters/persistence/state-file.ts';
import { PlayerGateway } from './adapters/ws/player-gateway.ts';
import { APP_NAME } from './app-info.ts';
import { KeyframeRequests } from './application/keyframe-requests.ts';
import { captureState, parseState, restoreState, type StateParts } from './application/line-snapshot.ts';
import { Lobby } from './application/lobby.ts';
import { LoginSessions } from './application/login-sessions.ts';
import { PlaySession } from './application/play-session.ts';
import type { ConsoleAdapter } from './application/ports.ts';
import { Presence } from './application/presence.ts';
import { RateLimiter } from './application/rate-limiter.ts';
import { VideoAccess } from './application/video-access.ts';
import { TurnQueue } from './domain/turn-queue.ts';

const PUBLIC_DIR = join(import.meta.dirname, '..', 'public');
const SIMULATOR_FRAME_MS = 50;
const LOGIN_TTL_MS = 7 * 86_400_000;
/** An older save restores logins, but not the line. */
const MAX_RESTORE_AGE_MS = 10 * 60_000;
/** Restored players must reconnect within this time. */
const RESTORE_GRACE_MS = 90_000;
/** MediaMTX path the console video is published on. */
const VIDEO_PATH = 'console';

function readConfig(): Config {
  try {
    return loadConfig(process.env);
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
}

function createConsole(config: Config): { device: ConsoleAdapter; simulator: SimulatedConsole | null } {
  if (config.console.kind === 'chiaki')
    return { device: new ChiakiConsole({ port: config.console.inputPort }), simulator: null };
  const simulator = new SimulatedConsole();
  return { device: simulator, simulator };
}

function main(): void {
  const config = readConfig();
  const { device: rawDevice, simulator } = createConsole(config);
  // Admin macros (cheat codes) take over the console; players' input is ignored while one plays.
  const macros = new MacroRunner(rawDevice);
  const device = new GatedConsole(rawDevice, macros);
  const consoleHost = config.console.kind === 'chiaki' ? config.console.consoleHost : '';

  // ---------- domain and application ----------
  const queue = new TurnQueue({ turnMs: config.turns.turnMs, extensionMs: config.turns.extensionMs });
  let lobby: Lobby | null = null;
  const session = new PlaySession(queue, device, {
    blockedButtons: config.turns.blockedButtons,
    idleTurnMs: config.turns.idleTurnMs,
    maxPlayersPerOrigin: config.turns.maxPlayersPerIp,
    onIdleRemoved: (id) => lobby?.idleRemoved(id),
  });
  const presence = new Presence({ graceMs: config.turns.reconnectGraceMs, onExpire: (id) => lobby?.expired(id) });
  let saver: SaveScheduler | null = null;
  const logins = new LoginSessions({ ttlMs: LOGIN_TTL_MS, onChange: () => saver?.schedule() });
  const keyframes = new KeyframeRequests({
    send: device.requestKeyframe ? () => device.requestKeyframe?.() : null,
    minIntervalMs: 2000,
  });

  // The gateway implements the lobby's Notifier; the lobby needs the notifier first, so the
  // notifier forwards to the gateway once it exists.
  let gateway: PlayerGateway | null = null;
  lobby = new Lobby({
    session,
    presence,
    keyframes,
    notifier: {
      toPlayer: (id, message) => gateway?.toPlayer(id, message),
      toAll: (message) => gateway?.toAll(message),
    },
    maxLine: config.turns.maxLine,
    loginRequired: config.kickLogin !== null,
    turnMs: config.turns.turnMs,
    onPersist: () => saver?.schedule(),
  });
  const live = lobby;

  // ---------- persistence ----------
  if (config.persistence) {
    const { file } = config.persistence;
    const parts: StateParts = { session, presence, logins };
    const raw = readJsonFile(file);
    const saved = raw === undefined ? null : parseState(raw, { now: Date.now(), maxAgeMs: MAX_RESTORE_AGE_MS });
    if (raw !== undefined && !saved) console.warn(`Ignoring ${file}: not a saved state this version understands.`);
    if (saved) {
      const restored = restoreState(saved, parts, { now: Date.now(), graceMs: RESTORE_GRACE_MS });
      live.expectReturning(restored);
      console.log(`Restored ${restored.length} player(s) and ${saved.logins.length} login(s) from ${file}.`);
    }
    saver = new SaveScheduler({
      save: () => writeJsonFileAtomic(file, captureState(parts, Date.now())),
      intervalMs: 5000,
    });
  }
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
      saver?.flush();
      process.exit(0);
    });
  }

  // ---------- video ----------
  const isConnected = (id: string) => gateway?.isConnected(id) ?? false;
  const resolvePlayer = (token: string) => gateway?.playerForVideoToken(token) ?? null;
  const videoHandlers: RequestHandler[] = [];
  const proxies: WhepProxy[] = [];
  if (config.video) {
    const video = config.video;
    const access = new VideoAccess(
      {
        isController: (id) => session.isController(id),
        isConnected,
        // With a public restream, spectator slots go to the next players in line, so their video
        // is already running when their turn starts; everyone else watches the restream.
        ...(config.kickChannel && {
          isUpcoming: (id: string) => {
            const position = session.positionOf(id);
            return position >= 1 && position <= video.maxSpectators;
          },
        }),
      },
      video.maxSpectators,
    );
    const proxy = new WhepProxy({
      upstream: video.mediamtxUrl,
      resolvePlayer,
      blockedCandidateAddresses: [consoleHost],
      hideIpv6: video.hideIpv6,
      route: '/api/video',
      path: VIDEO_PATH,
      access,
      onSession: () => live.videoSessionStarted(),
    });
    proxies.push(proxy);
    videoHandlers.push((req, res) => proxy.handle(req, res));
    // Access is checked when a stream is requested; this takes it back once a turn ends.
    setInterval(() => void proxy.revokeIneligible(), 2000).unref();
    // While the console video is down the screen is black, so turns stop counting.
    new StreamHealth({
      apiUrl: video.mediamtxApiUrl,
      authorization: video.apiUser
        ? `Basic ${Buffer.from(`${video.apiUser}:${video.apiPass}`).toString('base64')}`
        : undefined,
      path: VIDEO_PATH,
      onChange: (up) => {
        console.log(up ? 'Video stream is back: turns resume.' : 'Video stream is down: turns paused.');
        live.streamHealth(up);
      },
    }).start();
  }

  // ---------- HTTP and WebSocket ----------
  const auth = new AuthApi({
    provider: config.kickLogin ? new KickOAuth(config.kickLogin) : null,
    sessions: logins,
    sessionTtlSeconds: LOGIN_TTL_MS / 1000,
    publicUrl: config.http.publicUrl,
  });
  const backend: AdminBackend = {
    state: () => ({
      ...session.snapshot(),
      connected: gateway?.connectedCount ?? 0,
      serverNow: Date.now(),
    }),
    kick: (id) => live.kick(id),
    skipTurn: () => live.skipTurn(),
    setPaused: (reason, paused) => live.setPaused(reason, paused),
    runMacro: (steps) => {
      if (macros.running) return 'busy';
      void macros.run(steps).catch((error) => console.warn('macro failed', error));
      return 'started';
    },
  };
  const admin = config.admin ? new AdminApi({ token: config.admin.token, backend }) : null;
  const httpLimiter = new RateLimiter({ capacity: 60, perSecond: 30 });
  const server = createHttpServer({
    publicDir: PUBLIC_DIR,
    auth,
    admin,
    video: videoHandlers,
    paused: config.paused,
    limiter: httpLimiter,
    videoLimiter: new RateLimiter({ capacity: 3, perSecond: 0.5 }),
    hsts: config.http.publicUrl.startsWith('https:'),
    trustedProxy: config.http.trustedProxy,
    overlay: () => live.overlay(),
    clientConfig: () => ({
      name: APP_NAME,
      login: auth.enabled ? 'kick' : 'none',
      console: config.console.kind,
      video: config.video ? 'webrtc' : 'off',
      iceServers: config.video?.iceServers ?? [],
      kickChannel: config.kickChannel,
      videoSpectators: config.video?.maxSpectators ?? 0,
      turnMinutes: config.turns.turnMs / 60_000,
      extensionMinutes: config.turns.extensionMs / 60_000,
      keyboardLayout: config.keyboardLayout,
    }),
  });
  gateway = new PlayerGateway({
    server,
    lobby: live,
    presence,
    accountOf: (req) => auth.accountOf(req),
    httpLimiter,
    trustedProxy: config.http.trustedProxy,
    maxConnectionsPerIp: config.turns.maxConnectionsPerIp,
    publicUrl: config.http.publicUrl,
    paused: config.paused,
    onDisconnect: (id) => {
      for (const proxy of proxies) void proxy.disconnect(id);
    },
  });

  // ---------- clocks ----------
  setInterval(() => live.tick(), 1000).unref();
  setInterval(() => live.fastTick(), 250).unref();
  if (simulator) {
    setInterval(() => {
      simulator.step(SIMULATOR_FRAME_MS);
      if (gateway && gateway.socketCount > 0) gateway.toAll({ type: 'frame', ...simulator.frame() });
    }, SIMULATOR_FRAME_MS).unref();
  }

  // Last resort: a bug in one visitor's message must not take the whole line down.
  process.on('unhandledRejection', (error) => console.error('Unhandled rejection:', error));
  process.on('uncaughtException', (error) => console.error('Uncaught exception:', error));

  server.listen(config.http.port, config.http.host, () => {
    const target = simulator ? 'simulated console' : 'chiaki-ng';
    const host = config.http.host === '127.0.0.1' ? 'localhost' : config.http.host;
    console.log(
      `${APP_NAME} listening on http://${host}:${config.http.port} (${target}${config.paused ? ', PAUSED' : ''})`,
    );
    console.log(admin ? 'Admin API on (local only): bun run admin status' : 'Admin API off (set ADMIN_TOKEN).');
  });
}

main();
