import { afterAll, describe, expect, it } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readJsonFile, SaveScheduler, writeJsonFileAtomic } from '../src/adapters/persistence/state-file.ts';
import { captureState, parseState, restoreState, type StateParts } from '../src/application/line-snapshot.ts';
import { LoginSessions } from '../src/application/login-sessions.ts';
import { PlaySession } from '../src/application/play-session.ts';
import { Presence } from '../src/application/presence.ts';
import { TurnQueue } from '../src/domain/turn-queue.ts';
import { FakeClock, RecordingConsole } from './helpers.ts';

const MIN = 60_000;

function server(clock: FakeClock) {
  const queue = new TurnQueue({ turnMs: 10 * MIN, extensionMs: 5 * MIN }, clock.read);
  const session = new PlaySession(queue, new RecordingConsole(), { now: clock.read });
  const expired: string[] = [];
  const presence = new Presence({ graceMs: 30_000, now: clock.read, onExpire: (id) => expired.push(id) });
  const logins = new LoginSessions({ ttlMs: 7 * 24 * 60 * MIN, now: clock.read });
  const parts: StateParts = { session, presence, logins };
  return { parts, session, presence, logins, expired };
}

describe('state snapshot', () => {
  it('restores the line, resume tokens and logins', () => {
    const clock = new FakeClock();
    const before = server(clock);
    const a = before.presence.connect();
    const b = before.presence.connect();
    before.session.join(a.playerId, 'Ana', '1.1.1.1');
    before.session.join(b.playerId, 'Bo', '2.2.2.2');
    const cookie = before.logins.create({ id: 'kick:1', name: 'Ana' });
    clock.advance(3 * MIN);
    const saved = JSON.parse(JSON.stringify(captureState(before.parts, clock.now)));
    // Nothing secret in the clear.
    expect(!JSON.stringify(saved).includes(a.resumeToken)).toBe(true);
    expect(!JSON.stringify(saved).includes(cookie)).toBe(true);

    clock.advance(MIN);
    const restarted = server(clock);
    const parsed = parseState(saved, { now: clock.now, maxAgeMs: 10 * MIN });
    expect(parsed).not.toBeNull();
    const restored = restoreState(parsed!, restarted.parts, { now: clock.now, graceMs: 90_000 });
    expect(restored).toStrictEqual([a.playerId, b.playerId]);
    const { current, waiting } = restarted.session.snapshot();
    expect(current?.name).toBe('Ana');
    // 10 min turn - 3 min played - 1 min of downtime.
    expect(current!.endsAt - clock.now).toBe(6 * MIN);
    expect(waiting[0]?.name).toBe('Bo');
    expect(restarted.session.originOf(b.playerId)).toBe('2.2.2.2');
    expect(restarted.presence.resume(b.resumeToken)).toBe(b.playerId);
    expect(restarted.logins.get(cookie)).toStrictEqual({ id: 'kick:1', name: 'Ana' });
  });

  it('loads a save with fields it does not use, and drops them on the next save', () => {
    const clock = new FakeClock();
    const before = server(clock);
    const a = before.presence.connect();
    const b = before.presence.connect();
    before.session.join(a.playerId, 'Ana');
    before.session.join(b.playerId, 'Bo');
    const saved = JSON.parse(JSON.stringify(captureState(before.parts, clock.now)));
    saved.current.extra = 'a';
    saved.waiting[0].extra = 'b';
    saved.unknown = { nested: true };

    const restarted = server(clock);
    const parsed = parseState(saved, { now: clock.now, maxAgeMs: 10 * MIN });
    expect(parsed).not.toBeNull();
    expect(restoreState(parsed!, restarted.parts, { now: clock.now, graceMs: 90_000 })).toStrictEqual([
      a.playerId,
      b.playerId,
    ]);
    expect(restarted.session.snapshot().waiting[0]?.name).toBe('Bo');
    // The next save does not carry the unknown fields.
    const next = JSON.stringify(captureState(restarted.parts, clock.now));
    for (const field of ['"extra"', '"unknown"']) expect(next).not.toContain(field);
  });

  it('drops restored players who never come back', () => {
    const clock = new FakeClock();
    const before = server(clock);
    const a = before.presence.connect();
    before.session.join(a.playerId, 'Ana');
    const parsed = parseState(captureState(before.parts, clock.now), { now: clock.now, maxAgeMs: MIN })!;
    const restarted = server(clock);
    restoreState(parsed, restarted.parts, { now: clock.now, graceMs: 90_000 });
    clock.advance(90_000);
    restarted.presence.tick();
    expect(restarted.expired).toStrictEqual([a.playerId]);
  });

  it('does not count downtime for a turn frozen at save time', () => {
    const clock = new FakeClock();
    const before = server(clock);
    const a = before.presence.connect();
    before.session.join(a.playerId, 'Ana');
    before.session.pause('stream');
    const saved = captureState(before.parts, clock.now);
    expect(saved.current?.frozen).toBe(true);
    clock.advance(5 * MIN);
    const restarted = server(clock);
    restoreState(parseState(saved, { now: clock.now, maxAgeMs: 10 * MIN })!, restarted.parts, {
      now: clock.now,
      graceMs: 1,
    });
    expect(restarted.session.snapshot().current!.endsAt - clock.now).toBe(10 * MIN);
  });

  it('keeps logins but not the line of an old save', () => {
    const clock = new FakeClock();
    const before = server(clock);
    const a = before.presence.connect();
    before.session.join(a.playerId, 'Ana');
    before.logins.create({ id: 'kick:1', name: 'Ana' });
    const saved = captureState(before.parts, clock.now);
    const parsed = parseState(saved, { now: clock.now + 11 * MIN, maxAgeMs: 10 * MIN });
    expect(parsed?.current).toBeNull();
    expect(parsed?.waiting).toStrictEqual([]);
    expect(parsed?.logins.length).toBe(1);
  });

  it('rejects other versions and malformed lines', () => {
    const clock = new FakeClock();
    const saved = captureState(server(clock).parts, clock.now);
    const opts = { now: clock.now, maxAgeMs: MIN };
    expect(parseState({ ...saved, version: 1 }, opts)).toBeNull();
    expect(parseState({ ...saved, waiting: [{ id: 'x' }] }, opts)).toBeNull();
    expect(parseState(null, opts)).toBeNull();
    const dup = { id: 'a', name: 'A', resumeHash: 'h' };
    expect(parseState({ ...saved, waiting: [dup, dup] }, opts)).toBeNull();
  });
});

describe('state file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'playgta-test-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('writes atomically with owner-only permissions and reads it back', () => {
    const file = join(dir, 'nested', 'state.json');
    writeJsonFileAtomic(file, { ok: 1 });
    expect(readJsonFile(file)).toStrictEqual({ ok: 1 });
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(() => readFileSync(`${file}.tmp`)).toThrow();
  });

  it('treats missing as empty and corrupt as empty (logged)', () => {
    const logs: string[] = [];
    expect(readJsonFile(join(dir, 'missing.json'), { log: (l) => logs.push(l) })).toBeUndefined();
    expect(logs.length).toBe(0);
    const corrupt = join(dir, 'corrupt.json');
    writeFileSync(corrupt, '{not json');
    expect(readJsonFile(corrupt, { log: (l) => logs.push(l) })).toBeUndefined();
    expect(logs.length).toBe(1);
  });

  it('coalesces saves and never throws on a failing one', () => {
    let saves = 0;
    const logs: string[] = [];
    const scheduler = new SaveScheduler({
      save: () => {
        saves++;
        throw new Error('disk full');
      },
      intervalMs: 60_000,
      log: (l) => logs.push(l),
    });
    scheduler.schedule();
    scheduler.schedule();
    scheduler.flush();
    expect(saves).toBe(1);
    expect(logs[0]!).toMatch(/disk full/);
  });
});
