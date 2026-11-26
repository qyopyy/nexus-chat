import type { LoginSessions, SavedLogin } from './login-sessions.ts';
import type { PlaySession, RestoredPlayer } from './play-session.ts';
import type { Presence } from './presence.ts';

/**
 * Bumped whenever the saved shape changes incompatibly; other versions are ignored on load. Fields
 * this version no longer uses (older saves may still carry them) are ignored, not rejected.
 */
const STATE_VERSION = 2;

/** A player in the saved line. `resumeHash` is the SHA-256 of their resume token. */
type SavedPlayer = RestoredPlayer & { resumeHash: string };

/**
 * What survives a restart: the players in line, in order, with the controller's time left, and the
 * login sessions. Secrets only as hashes.
 */
type SavedState = {
  version: typeof STATE_VERSION;
  /** Epoch ms of the save. */
  savedAt: number;
  /** `frozen`: the turn clock was paused at the save, so the downtime does not count. */
  current: (SavedPlayer & { remainingMs: number; frozen?: boolean }) | null;
  waiting: SavedPlayer[];
  logins: SavedLogin[];
};

/** The live objects a snapshot reads from and restores into. */
export type StateParts = {
  session: PlaySession;
  presence: Presence;
  logins: LoginSessions;
};

/** Captures everything worth saving. Players nobody can reconnect as are left out. */
export function captureState(parts: StateParts, now: number): SavedState {
  const { session, presence, logins } = parts;
  const { current, waiting, paused } = session.snapshot();
  const save = (id: string, name: string): SavedPlayer | null => {
    const resumeHash = presence.resumeHashOf(id);
    if (!resumeHash) return null;
    const origin = session.originOf(id);
    return { id, name, resumeHash, ...(origin !== undefined && { origin }) };
  };
  const controller = current && save(current.id, current.name);
  const remainingMs = current ? Math.max(0, paused?.remainingMs ?? current.endsAt - now) : 0;
  return {
    version: STATE_VERSION,
    savedAt: now,
    current: controller && { ...controller, remainingMs, ...(paused && { frozen: true }) },
    waiting: waiting.flatMap((p) => save(p.id, p.name) ?? []),
    logins: logins.saved(),
  };
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 256;
const isTime = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

function isPlayer(v: unknown): v is SavedPlayer {
  return (
    isObject(v) &&
    isText(v.id) &&
    typeof v.name === 'string' &&
    isText(v.resumeHash) &&
    (v.origin === undefined || isText(v.origin))
  );
}

function isLogin(v: unknown): v is SavedLogin {
  return isObject(v) && isText(v.hash) && isText(v.id) && typeof v.name === 'string' && isTime(v.expiresAt);
}

/**
 * Validates a loaded file. Returns null (restore nothing) for another version or any malformed
 * field: a half-restored line would be worse than an empty one. A save older than `maxAgeMs` (or
 * from the future) keeps its logins but not its line.
 */
export function parseState(raw: unknown, { now, maxAgeMs }: { now: number; maxAgeMs: number }): SavedState | null {
  if (!isObject(raw) || raw.version !== STATE_VERSION || !isTime(raw.savedAt)) return null;
  const { current, waiting, logins } = raw;
  const currentOk =
    current === null ||
    (isPlayer(current) &&
      isTime((current as Record<string, unknown>).remainingMs) &&
      [undefined, true, false].includes((current as Record<string, unknown>).frozen as boolean | undefined));
  if (!currentOk || !Array.isArray(waiting) || !waiting.every(isPlayer)) return null;
  if (!Array.isArray(logins) || !logins.every(isLogin)) return null;
  // Each restored player needs their own presence entry, or they would never leave the line.
  const players: SavedPlayer[] = [...(isPlayer(current) ? [current] : []), ...waiting];
  if (new Set(players.map((p) => p.id)).size !== players.length) return null;
  if (new Set(players.map((p) => p.resumeHash)).size !== players.length) return null;

  const saved: SavedState = {
    version: STATE_VERSION,
    savedAt: raw.savedAt,
    current: current as SavedState['current'],
    waiting,
    logins,
  };
  const fresh = saved.savedAt <= now && now - saved.savedAt <= maxAgeMs;
  return fresh ? saved : { ...saved, current: null, waiting: [] };
}

/**
 * Rebuilds a saved state on a fresh server. Restored players are disconnected until their
 * browser reconnects with its resume token, and leave the line if that takes longer than `graceMs`.
 *
 * @returns the ids of the restored players.
 */
export function restoreState(
  saved: SavedState,
  parts: StateParts,
  { now, graceMs }: { now: number; graceMs: number },
): string[] {
  const { current, waiting } = saved;
  const downMs = current?.frozen ? 0 : Math.max(0, now - saved.savedAt);
  const players = [...(current ? [current] : []), ...waiting];
  parts.session.restore(current && { ...current, remainingMs: Math.max(0, current.remainingMs - downMs) }, waiting);
  for (const player of players) parts.presence.restore(player.id, player.resumeHash, graceMs);
  parts.logins.restore(saved.logins);
  return players.map((p) => p.id);
}
