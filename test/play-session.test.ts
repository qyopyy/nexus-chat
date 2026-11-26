import { describe, expect, it } from 'bun:test';
import { PlaySession } from '../src/application/play-session.ts';
import { TurnQueue } from '../src/domain/turn-queue.ts';
import { FakeClock, RecordingConsole } from './helpers.ts';

function setup(options: { idleTurnMs?: number; maxPlayersPerOrigin?: number } = {}) {
  const clock = new FakeClock();
  const device = new RecordingConsole();
  const removed: string[] = [];
  const queue = new TurnQueue({ turnMs: 600_000, extensionMs: 300_000 }, clock.read);
  const session = new PlaySession(queue, device, {
    now: clock.read,
    idleTurnMs: options.idleTurnMs ?? 20_000,
    maxPlayersPerOrigin: options.maxPlayersPerOrigin ?? 1,
    onIdleRemoved: (id) => removed.push(id),
  });
  return { clock, device, session, removed };
}

const pressCross = { buttons: { cross: true } };

describe('PlaySession', () => {
  it('forwards input from the controller only', () => {
    const { session, device } = setup();
    session.join('a', 'A');
    session.join('b', 'B');
    expect(session.input('b', pressCross)).toBe(false);
    expect(session.input('a', pressCross)).toBe(true);
    expect(device.applied.length).toBe(1);
    expect(device.applied[0]?.buttons.cross).toBe(true);
  });

  it('never lets blocked buttons through', () => {
    const { session, device } = setup();
    session.join('a', 'A');
    session.input('a', { buttons: { ps: true, create: true, options: true } });
    expect(device.applied[0]?.buttons.ps).toBe(false);
    expect(device.applied[0]?.buttons.create).toBe(false);
    expect(device.applied[0]?.buttons.options).toBe(true);
  });

  it('cleans player names', () => {
    const { session } = setup();
    session.join('a', '  \u0007Ana  ');
    session.join('b', '');
    const { current, waiting } = session.snapshot();
    expect(current?.name).toBe('Ana');
    expect(waiting[0]?.name).toBe('Anonymous');
  });

  it('limits places per origin', () => {
    const { session } = setup({ maxPlayersPerOrigin: 1 });
    expect(session.join('a', 'A', '1.2.3.4')).toBe(0);
    expect(session.join('b', 'B', '1.2.3.4')).toBe('origin-full');
    expect(session.join('c', 'C', '5.6.7.8')).toBe(1);
    session.leave('a');
    expect(session.join('b', 'B', '1.2.3.4')).toBe(1);
  });

  it('releases the console when input goes silent', () => {
    const { session, device, clock } = setup();
    session.join('a', 'A');
    session.input('a', pressCross);
    clock.advance(500);
    expect(session.releaseIfInputStale()).toBe(false);
    clock.advance(300);
    expect(session.releaseIfInputStale()).toBe(true);
    expect(device.releases).toBe(1);
    expect(session.releaseIfInputStale()).toBe(false);
  });

  it('releases the console when control changes hands', () => {
    const { session, device } = setup();
    session.join('a', 'A');
    session.join('b', 'B');
    session.skipTurn();
    expect(device.releases).toBe(1);
    expect(session.controllerId()).toBe('b');
  });

  describe('idle kick', () => {
    it('removes an idle controller when someone is waiting', () => {
      const { session, clock, removed } = setup({ idleTurnMs: 20_000 });
      session.join('a', 'A');
      session.join('b', 'B');
      expect(session.idleKickAt()).toBe(clock.now + 20_000);
      clock.advance(19_999);
      expect(session.tick()).toBe(false);
      clock.advance(1);
      expect(session.tick()).toBe(true);
      expect(removed).toStrictEqual(['a']);
      expect(session.controllerId()).toBe('b');
    });

    it('never kicks when nobody is waiting', () => {
      const { session, clock, removed } = setup();
      session.join('a', 'A');
      expect(session.idleKickAt()).toBeNull();
      clock.advance(120_000);
      session.tick();
      expect(removed).toStrictEqual([]);
    });

    it('counts activity, but not stick drift', () => {
      const { session, clock } = setup({ idleTurnMs: 20_000 });
      session.join('a', 'A');
      session.join('b', 'B');
      clock.advance(10_000);
      session.input('a', { sticks: { lx: 0.1 } });
      expect(session.idleKickAt()).toBe(clock.now + 10_000);
      session.input('a', { sticks: { lx: 0.9 } });
      expect(session.idleKickAt()).toBe(clock.now + 20_000);
    });

    it('gives the next controller a fresh idle clock', () => {
      const { session, clock } = setup({ idleTurnMs: 20_000 });
      session.join('a', 'A');
      session.join('b', 'B');
      session.join('c', 'C');
      clock.advance(15_000);
      session.leave('a');
      expect(session.idleKickAt()).toBe(clock.now + 20_000);
    });

    it('does not count paused time', () => {
      const { session, clock } = setup({ idleTurnMs: 20_000 });
      session.join('a', 'A');
      session.join('b', 'B');
      clock.advance(5_000);
      session.pause('stream');
      expect(session.idleKickAt()).toBeNull();
      clock.advance(60_000);
      session.resume('stream');
      expect(session.idleKickAt()).toBe(clock.now + 15_000);
    });
  });

  it('kicks a player on admin request', () => {
    const { session } = setup();
    session.join('a', 'A');
    session.join('b', 'B');
    expect(session.kick('b')).toBe(true);
    expect(session.kick('b')).toBe(false);
    expect(session.snapshot().waiting.length).toBe(0);
  });
});
