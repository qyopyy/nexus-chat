import { isIP } from 'node:net';
import { DEFAULT_BLOCKED_BUTTONS } from '../../application/play-session.ts';
import { type Button, isButton } from '../../domain/controller-state.ts';
import type { TrustedProxy } from '../http/client-origin.ts';

/** Raw environment, e.g. `process.env`. */
type Env = Record<string, string | undefined>;

/** Thrown when the environment is invalid; lists every problem at once. */
export class ConfigError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`Invalid configuration:\n${issues.map((issue) => `  - ${issue}`).join('\n')}`);
    this.name = 'ConfigError';
    this.issues = issues;
  }
}

/**
 * Keyboard and mouse layouts the reference page offers (public/js/keymap.js). Gamepads ignore them.
 * `gta` is GTA-style PC controls with mouse look; `generic` names console buttons, for any game.
 */
export const KEYBOARD_LAYOUTS = ['gta', 'generic'] as const;
export type KeyboardLayout = (typeof KEYBOARD_LAYOUTS)[number];

/** The fully validated server configuration. Optional features are `null` when off. */
export type Config = {
  http: { host: string; port: number; publicUrl: string; trustedProxy: TrustedProxy };
  turns: {
    turnMs: number;
    extensionMs: number;
    idleTurnMs: number;
    reconnectGraceMs: number;
    maxLine: number;
    maxPlayersPerIp: number;
    maxConnectionsPerIp: number;
    blockedButtons: readonly Button[];
  };
  console: { kind: 'simulated' } | { kind: 'chiaki'; inputPort: number; consoleHost: string };
  video: {
    mediamtxUrl: string;
    mediamtxApiUrl: string;
    apiUser: string;
    apiPass: string;
    maxSpectators: number;
    hideIpv6: boolean;
    iceServers: { urls: string }[];
  } | null;
  persistence: { file: string } | null;
  admin: { token: string } | null;
  kickLogin: { clientId: string; clientSecret: string } | null;
  kickChannel: string;
  keyboardLayout: KeyboardLayout;
  paused: boolean;
};

/** Collects issues while reading variables, so one run reports every mistake. */
class Reader {
  readonly issues: string[] = [];
  readonly #env: Env;

  constructor(env: Env) {
    this.#env = env;
  }

  /** The trimmed value, or '' when unset. */
  text(name: string, fallback = ''): string {
    const value = this.#env[name]?.trim();
    return value === undefined || value === '' ? fallback : value;
  }

  number(
    name: string,
    fallback: number,
    { min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY, integer = false } = {},
  ): number {
    const raw = this.text(name);
    if (raw === '') return fallback;
    const value = Number(raw);
    if (!Number.isFinite(value) || (integer && !Number.isInteger(value)) || value < min || value > max) {
      const kind = integer ? 'an integer' : 'a number';
      this.issues.push(`${name} must be ${kind} between ${min} and ${max} (got "${raw}")`);
      return fallback;
    }
    return value;
  }

  flag(name: string, fallback = false): boolean {
    const raw = this.text(name).toLowerCase();
    if (raw === '') return fallback;
    if (['1', 'true', 'on', 'yes'].includes(raw)) return true;
    if (['0', 'false', 'off', 'no'].includes(raw)) return false;
    this.issues.push(`${name} must be on or off (got "${raw}")`);
    return fallback;
  }

  choice<T extends string>(name: string, options: readonly T[], fallback: T): T {
    const raw = this.text(name, fallback).toLowerCase();
    if ((options as readonly string[]).includes(raw)) return raw as T;
    this.issues.push(`${name} must be one of ${options.join(', ')} (got "${raw}")`);
    return fallback;
  }

  url(name: string, protocols: readonly string[], fallback = ''): string {
    const raw = this.text(name, fallback);
    if (raw === '') return '';
    const parsed = URL.parse(raw);
    if (!parsed || !protocols.includes(parsed.protocol)) {
      this.issues.push(`${name} must be a ${protocols.join(' or ')} URL (got "${raw}")`);
      return '';
    }
    return raw.replace(/\/+$/, '');
  }

  /** Both set or both unset; one alone is a mistake. */
  pair(a: string, b: string): [string, string] | null {
    const first = this.text(a);
    const second = this.text(b);
    if (!first && !second) return null;
    if (!first || !second) {
      this.issues.push(`${a} and ${b} must be set together`);
      return null;
    }
    return [first, second];
  }
}

const MINUTE = 60_000;

/**
 * Reads and validates the configuration from environment variables. See docs/configuration.md.
 *
 * @throws {ConfigError} listing every invalid or inconsistent variable.
 */
export function loadConfig(env: Env): Config {
  const r = new Reader(env);

  const http = {
    // Loopback by default: a tunnel connects locally. HOST=0.0.0.0 opens it to the network.
    host: r.text('HOST', '127.0.0.1'),
    port: r.number('PORT', 3000, { min: 0, max: 65535, integer: true }),
    publicUrl: r.url('PUBLIC_URL', ['https:', 'http:']),
    trustedProxy: r.choice('TRUSTED_PROXY', ['none', 'cloudflare'] as const, 'none'),
  };

  const blockedRaw = r.text('BLOCKED_BUTTONS', DEFAULT_BLOCKED_BUTTONS.join(','));
  const blockedNames =
    blockedRaw.toLowerCase() === 'none'
      ? []
      : blockedRaw
          .split(',')
          .map((b) => b.trim())
          .filter(Boolean);
  const unknownButtons = blockedNames.filter((b) => !isButton(b));
  if (unknownButtons.length) r.issues.push(`BLOCKED_BUTTONS has unknown button(s): ${unknownButtons.join(', ')}`);

  const turns = {
    turnMs: r.number('TURN_MINUTES', 10, { min: 0.1, max: 24 * 60 }) * MINUTE,
    extensionMs: r.number('EXTENSION_MINUTES', 5, { min: 0.1, max: 24 * 60 }) * MINUTE,
    idleTurnMs: r.number('IDLE_TURN_SECONDS', 20, { min: 5, max: 3600 }) * 1000,
    reconnectGraceMs: r.number('RECONNECT_GRACE_SECONDS', 30, { min: 0, max: 3600 }) * 1000,
    maxLine: r.number('MAX_LINE', 500, { min: 0, integer: true }),
    maxPlayersPerIp: r.number('MAX_PLAYERS_PER_IP', 1, { min: 1, integer: true }),
    maxConnectionsPerIp: r.number('MAX_CONNECTIONS_PER_IP', 6, { min: 0, integer: true }),
    blockedButtons: blockedNames.filter(isButton),
  };

  const consoleKind = r.choice('CONSOLE', ['simulated', 'chiaki'] as const, 'simulated');
  const consoleHost = r.text('CONSOLE_HOST');
  const consoleConfig: Config['console'] =
    consoleKind === 'chiaki'
      ? {
          kind: 'chiaki',
          inputPort: r.number('CHIAKI_INPUT_PORT', 9370, { min: 1, max: 65535, integer: true }),
          consoleHost,
        }
      : { kind: 'simulated' };

  const videoMode = r.choice('VIDEO', ['off', 'webrtc'] as const, 'off');
  const apiCredentials = r.pair('MEDIAMTX_API_USER', 'MEDIAMTX_API_PASS');
  const stun = r.text('STUN_URLS', 'stun:stun.l.google.com:19302');
  const video: Config['video'] =
    videoMode === 'webrtc'
      ? {
          mediamtxUrl: r.url('MEDIAMTX_URL', ['http:'], 'http://127.0.0.1:8889'),
          mediamtxApiUrl: r.url('MEDIAMTX_API_URL', ['http:'], 'http://127.0.0.1:9997'),
          apiUser: apiCredentials?.[0] ?? '',
          apiPass: apiCredentials?.[1] ?? '',
          maxSpectators: r.number('VIDEO_MAX_SPECTATORS', 5, { min: 0, integer: true }),
          hideIpv6: r.flag('VIDEO_HIDE_IPV6'),
          iceServers: stun.toLowerCase() === 'none' ? [] : stun.split(',').map((urls) => ({ urls: urls.trim() })),
        }
      : null;
  // The SDP sanitizer matches ICE candidates by address, so the console must be given as one.
  if (consoleKind === 'chiaki' && video && !isIP(consoleHost)) {
    r.issues.push(
      `CONSOLE_HOST must be the console's IP address with CONSOLE=chiaki and VIDEO=webrtc (got "${consoleHost}")`,
    );
  }

  const stateFile = r.text('STATE_FILE', 'state/state.json');
  const persistence = stateFile.toLowerCase() === 'off' ? null : { file: stateFile };

  const adminToken = r.text('ADMIN_TOKEN');
  if (adminToken && adminToken.length < 16) r.issues.push('ADMIN_TOKEN must be at least 16 characters');
  const admin = adminToken ? { token: adminToken } : null;
  // Fail closed: a public site with no known proxy could be relayed by something that rewrites the
  // Host header and adds no forwarding header, which would make internet requests look local.
  if (admin && http.publicUrl && http.trustedProxy === 'none') {
    r.issues.push('ADMIN_TOKEN with PUBLIC_URL needs TRUSTED_PROXY=cloudflare (see docs/security.md)');
  }

  const kick = r.pair('KICK_CLIENT_ID', 'KICK_CLIENT_SECRET');
  const kickLogin = kick ? { clientId: kick[0], clientSecret: kick[1] } : null;
  if (kickLogin && !http.publicUrl) r.issues.push('KICK_CLIENT_ID needs PUBLIC_URL (the OAuth redirect URL)');
  const kickChannel = r.text('KICK_CHANNEL');
  if (kickChannel && !/^[\w-]{1,64}$/.test(kickChannel))
    r.issues.push(`KICK_CHANNEL is not a channel name (got "${kickChannel}")`);

  const keyboardLayout = r.choice('KEYBOARD_LAYOUT', KEYBOARD_LAYOUTS, 'gta');
  const paused = r.flag('PAUSED');

  if (r.issues.length) throw new ConfigError(r.issues);
  return {
    http,
    turns,
    console: consoleConfig,
    video,
    persistence,
    admin,
    kickLogin,
    kickChannel,
    keyboardLayout,
    paused,
  };
}
