import { describe, expect, it } from 'bun:test';
import { KeyframeRequests } from '../src/application/keyframe-requests.ts';
import { Lobby } from '../src/application/lobby.ts';
import { PlaySession } from '../src/application/play-session.ts';
import { Presence } from '../src/application/presence.ts';
import { TurnQueue } from '../src/domain/turn-queue.ts';
import { FakeClock, flush, RecordingConsole, RecordingNotifier } from './helpers.ts';

function setup(options: { maxLine?: number; loginRequired?: boolean } = {}) {
  const clock = new FakeClock();
  const notifier = new RecordingNotifier();
  const device = new RecordingConsole();
  const queue = new TurnQueue({ turnMs: 600_000, extensionMs: 300_000 }, clock.read);
  let lobby: Lobby | null = null;
  const session = new PlaySession(queue, device, {
    now: clock.read,
    idleTurnMs: 20_000,
    maxPlayersPerOrigin: 1,
    onIdleRemoved: (id) => lobby?.idleRemoved(id),
  });
  const presence = new Presence({ graceMs: 30_000, now: clock.read, onExpire: (id) => lobby?.expired(id) });
  let persisted = 0;
  lobby = new Lobby({
    session,
    presence,
    notifier,
    keyframes: new KeyframeRequests({ send: () => device.requestKeyframe(), minIntervalMs: 2000, now: clock.read }),
    maxLine: options.maxLine ?? 0,
    loginRequired: options.loginRequired ?? false,
    turnMs: 600_000,
    onPersist: () => persisted++,
    now: clock.read,
  });
  const connect = (resumed = false) => {
    const { playerId } = presence.connect();
    lobby.welcome(playerId, resumed);
    return playerId;
  };
  return { clock, notifier, device, session, presence, lobby, connect, persisted: () => persisted };
}

const join = (lobby: Lobby, id: string, origin = id) => lobby.join(id, { name: id, account: null, origin });

describe('Lobby', () => {
  it('welcomes a player with the line and their position', () => {
    const { notifier, connect } = setup();
    const id = connect();
    const types = notifier.toPlayerLog.filter((e) => e.id === id).map((e) => e.message.type);
    expect(types).toStrictEqual(['queue', 'position']);
  });

  it('joins, broadcasts the line once per burst and saves it', async () => {
    const { notifier, connect, lobby, persisted } = setup();
    const a = connect();
    const b = connect();
    expect(join(lobby, a)).toBeNull();
    expect(join(lobby, b)).toBeNull();
    await flush();
    const queues = notifier.toAllLog.filter((m) => m.type === 'queue');
    expect(queues.length).toBe(1);
    expect(persisted()).toBe(1);
    expect(notifier.sentTo(b, 'position').at(-1)).toStrictEqual({ type: 'position', position: 1 });
  });

  it('refuses joins when the line is full, login is required or the origin has a place', () => {
    const full = setup({ maxLine: 1 });
    const [a, b, c] = [full.connect(), full.connect(), full.connect()];
    join(full.lobby, a);
    join(full.lobby, b);
    expect(join(full.lobby, c)).toBe('line-full');

    const login = setup({ loginRequired: true });
    const d = login.connect();
    expect(join(login.lobby, d)).toBe('login-required');
    const account = { id: 'kick:1', name: 'Dee' };
    expect(login.lobby.join(d, { name: 'ignored', account, origin: 'x' })).toBeNull();
    expect(login.session.snapshot().current?.name).toBe('Dee');
    const e = login.connect();
    expect(login.lobby.join(e, { name: '', account, origin: 'y' })).toBe('account-in-line');

    const origin = setup();
    const [f, g] = [origin.connect(), origin.connect()];
    join(origin.lobby, f, 'same');
    expect(join(origin.lobby, g, 'same')).toBe('origin-full');
  });

  it('warns the idle controller in the last seconds, then removes them', () => {
    const { notifier, connect, lobby, clock } = setup();
    const a = connect();
    const b = connect();
    join(lobby, a);
    join(lobby, b);
    clock.advance(5_000);
    lobby.fastTick();
    expect(notifier.sentTo(a, 'idle')).toStrictEqual([]);
    clock.advance(6_000);
    lobby.fastTick();
    lobby.fastTick();
    expect(notifier.sentTo(a, 'idle').length).toBe(1);
    clock.advance(10_000);
    lobby.tick();
    expect(notifier.sentTo(a, 'kicked')).toStrictEqual([{ type: 'kicked', reason: 'idle' }]);
    lobby.fastTick();
    expect(notifier.sentTo(a, 'idle').at(-1)?.kickAt).toBeNull();
  });

  it('lets only the controller ask for keyframes', () => {
    const { connect, lobby, device, clock } = setup();
    const [a, b] = [connect(), connect()];
    join(lobby, a);
    join(lobby, b);
    lobby.videoStalled(b);
    expect(device.keyframes).toBe(0);
    lobby.videoStalled(a);
    lobby.videoStalled(a);
    expect(device.keyframes).toBe(1);
    clock.advance(2000);
    lobby.videoStalled(a);
    expect(device.keyframes).toBe(2);
  });

  it('freezes turns while the stream is down', () => {
    const { connect, lobby, session } = setup();
    join(lobby, connect());
    lobby.streamHealth(false);
    expect(session.snapshot().paused?.reasons).toStrictEqual(['stream']);
    lobby.streamHealth(true);
    expect(session.snapshot().paused).toBeNull();
  });

  it('removes a disconnected player once presence expires', async () => {
    const { connect, lobby, session, clock } = setup();
    const a = connect();
    join(lobby, a);
    lobby.disconnected(a);
    clock.advance(30_000);
    lobby.tick();
    expect(session.snapshot().current).toBeNull();
  });
});
