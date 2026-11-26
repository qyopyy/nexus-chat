import { describe, expect, it } from 'bun:test';
import {
  formatClock,
  lineSummary,
  reconnectDelay,
  statusText,
  turnLeftMs,
  videoEligible,
} from '../public/js/line-view.js';
import { sanitizeOffer, stripIpv6Candidates } from '../src/adapters/mediamtx/sdp.ts';
import { LoginSessions } from '../src/application/login-sessions.ts';
import { Presence } from '../src/application/presence.ts';
import { ConnectionLimit, RateLimiter } from '../src/application/rate-limiter.ts';
import { VideoAccess } from '../src/application/video-access.ts';
import { FakeClock } from './helpers.ts';

describe('Presence', () => {
  it('lets a player resume within the grace period, once', () => {
    const clock = new FakeClock();
    const expired: string[] = [];
    const presence = new Presence({ graceMs: 30_000, now: clock.read, onExpire: (id) => expired.push(id) });
    const { playerId, resumeToken } = presence.connect();
    expect(presence.resume(resumeToken), 'still connected').toBeNull();
    presence.disconnect(playerId);
    expect(presence.resume('wrong')).toBeNull();
    expect(presence.resume(resumeToken)).toBe(playerId);
    presence.disconnect(playerId);
    clock.advance(30_000);
    presence.tick();
    expect(expired).toStrictEqual([playerId]);
    expect(presence.resume(resumeToken)).toBeNull();
  });
});

describe('LoginSessions', () => {
  it('expires sessions and caps their number', () => {
    const clock = new FakeClock();
    const sessions = new LoginSessions({ ttlMs: 1000, max: 2, now: clock.read });
    const first = sessions.create({ id: 'kick:1', name: 'A' });
    sessions.create({ id: 'kick:2', name: 'B' });
    sessions.create({ id: 'kick:3', name: 'C' });
    expect(sessions.get(first), 'oldest dropped').toBeNull();
    expect(sessions.saved().length).toBe(2);
    clock.advance(1000);
    expect(sessions.saved()).toStrictEqual([]);
  });
});

describe('limits', () => {
  it('refills a token bucket over time', () => {
    const clock = new FakeClock();
    const limiter = new RateLimiter({ capacity: 2, perSecond: 1, now: clock.read });
    expect(limiter.take('ip')).toBe(true);
    expect(limiter.take('ip')).toBe(true);
    expect(limiter.take('ip')).toBe(false);
    expect(limiter.take('other')).toBe(true);
    clock.advance(1000);
    expect(limiter.take('ip')).toBe(true);
  });

  it('caps open connections per origin', () => {
    const limit = new ConnectionLimit(2);
    expect(limit.tryOpen('ip')).toBe(true);
    expect(limit.tryOpen('ip')).toBe(true);
    expect(limit.tryOpen('ip')).toBe(false);
    limit.close('ip');
    expect(limit.tryOpen('ip')).toBe(true);
    expect(new ConnectionLimit(0).tryOpen('ip')).toBe(true);
  });
});

describe('VideoAccess', () => {
  it('always admits the controller and caps spectators', () => {
    const access = new VideoAccess({ isController: (id) => id === 'ctl', isConnected: (id) => id !== 'gone' }, 1);
    expect(access.admit('gone')).toBe('unknown');
    access.register('ctl', 'u0');
    expect(access.admit('a')).toBe('granted');
    access.register('a', 'u1');
    expect(access.admit('b')).toBe('full');
    expect(access.admit('ctl')).toBe('granted');
    expect(access.release('a')).toBe('u1');
    expect(access.admit('b')).toBe('granted');
  });

  it('revokes sessions of players who are no longer upcoming', () => {
    let upcoming = new Set(['a']);
    const access = new VideoAccess(
      { isController: () => false, isConnected: () => true, isUpcoming: (id) => upcoming.has(id) },
      5,
    );
    access.register('a', 'u1');
    expect(access.revocable()).toStrictEqual([]);
    upcoming = new Set();
    expect(access.revocable()).toStrictEqual(['a']);
  });
});

describe('SDP sanitizing', () => {
  const candidate = (n: number, address: string) => `a=candidate:${n} 1 udp 1 ${address} 5000 typ host`;
  const kept = (addresses: string[], blocked: string[] = []) =>
    addresses.filter((address, i) =>
      sanitizeOffer(['v=0', candidate(i, address)].join('\r\n'), blocked).includes('candidate'),
    );

  it('keeps public addresses and mDNS names', () => {
    expect(kept(['198.51.100.4', '2001:db8::1', '0f1e2d3c-aaaa-bbbb.local'])).toStrictEqual([
      '198.51.100.4',
      '2001:db8::1',
      '0f1e2d3c-aaaa-bbbb.local',
    ]);
  });

  it('drops loopback, private, link-local, shared and multicast ranges', () => {
    const local = ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.20', '169.254.1.1', '100.64.0.1', '224.0.0.1'];
    const local6 = ['::1', '::', 'fe80::1', 'fd00::1', 'ff02::1', '::ffff:192.168.1.20', '::ffff:127.0.0.1'];
    expect(kept([...local, ...local6])).toStrictEqual([]);
  });

  it('drops host names that are not mDNS, and the blocked console address in any spelling', () => {
    expect(kept(['router.home', 'example.com', 'evil.local.example.com'])).toStrictEqual([]);
    expect(kept(['198.51.100.9', '::ffff:198.51.100.9'], ['198.51.100.9'])).toStrictEqual([]);
  });

  it('keeps at most 16 candidates and strips IPv6 on request', () => {
    const many = ['v=0', ...Array.from({ length: 20 }, (_, i) => candidate(i, `198.51.100.${i + 1}`))].join('\r\n');
    expect(sanitizeOffer(many, []).split('a=candidate').length - 1).toBe(16);
    const mixed = ['v=0', candidate(1, '198.51.100.4'), candidate(2, '2001:db8::1')].join('\r\n');
    expect(!stripIpv6Candidates(mixed).includes('2001:db8::1')).toBe(true);
    expect(stripIpv6Candidates(mixed).includes('198.51.100.4')).toBe(true);
  });
});

describe('line view', () => {
  const queue = { current: { name: 'Ana', endsAt: 100_000 }, waiting: [], total: 7, paused: null };

  it('summarizes the line and your place in it', () => {
    expect(lineSummary(queue)).toBe('Playing: Ana · 7 waiting');
    expect(lineSummary({ current: null, total: 0, paused: null })).toBe('Nobody is playing · 0 waiting');
    const base = { position: null, controlling: false, reconnecting: false, notice: '' };
    expect(statusText(base)).toBe('Join the line to play.');
    expect(statusText({ ...base, position: 1 })).toBe('You are next.');
    expect(statusText({ ...base, position: 4 })).toBe('You are #4 in line.');
    expect(statusText({ ...base, position: 0, controlling: true, pausedReasons: ['admin'] })).toBe(
      'Paused by the host. You are in control.',
    );
  });

  it('counts the turn down, frozen while paused', () => {
    expect(turnLeftMs(queue, 40_000)).toBe(60_000);
    expect(turnLeftMs({ ...queue, paused: { remainingMs: 5000 } }, 40_000)).toBe(5000);
    expect(formatClock(61_500)).toBe('1:01');
  });

  it('gives direct video to the controller and the next spectators only with a restream', () => {
    expect(videoEligible({ restream: false, controller: false, position: null, videoSpectators: 0 })).toBe(true);
    expect(videoEligible({ restream: true, controller: false, position: 3, videoSpectators: 2 })).toBe(false);
    expect(videoEligible({ restream: true, controller: false, position: 2, videoSpectators: 2 })).toBe(true);
    expect(reconnectDelay(10, () => 0.5) <= 20_000).toBe(true);
  });
});
