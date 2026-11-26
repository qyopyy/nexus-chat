import { describe, expect, it } from 'bun:test';
import { TurnQueue } from '../src/domain/turn-queue.ts';
import { FakeClock } from './helpers.ts';

const MIN = 60_000;

function setup() {
  const clock = new FakeClock();
  const queue = new TurnQueue({ turnMs: 10 * MIN, extensionMs: 5 * MIN }, clock.read);
  return { clock, queue };
}

describe('TurnQueue', () => {
  it('gives control to the first player and lines up the rest', () => {
    const { queue } = setup();
    expect(queue.join({ id: 'a', name: 'A' })).toBe(0);
    expect(queue.join({ id: 'b', name: 'B' })).toBe(1);
    expect(queue.join({ id: 'c', name: 'C' })).toBe(2);
    expect(queue.controllerId()).toBe('a');
    expect(queue.ids()).toStrictEqual(['a', 'b', 'c']);
  });

  it('keeps the place of a player who joins twice', () => {
    const { queue } = setup();
    queue.join({ id: 'a', name: 'A' });
    queue.join({ id: 'b', name: 'B' });
    expect(queue.join({ id: 'b', name: 'B' })).toBe(1);
    expect(queue.snapshot().waiting.length).toBe(1);
  });

  it('passes the turn when it expires and someone is waiting', () => {
    const { clock, queue } = setup();
    queue.join({ id: 'a', name: 'A' });
    queue.join({ id: 'b', name: 'B' });
    clock.advance(10 * MIN - 1);
    expect(queue.tick()).toBe(false);
    clock.advance(1);
    expect(queue.tick()).toBe(true);
    expect(queue.controllerId()).toBe('b');
  });

  it('extends the turn when nobody is waiting', () => {
    const { clock, queue } = setup();
    queue.join({ id: 'a', name: 'A' });
    const endsAt = queue.snapshot().current!.endsAt;
    clock.advance(10 * MIN);
    expect(queue.tick()).toBe(true);
    expect(queue.controllerId()).toBe('a');
    expect(queue.snapshot().current!.endsAt).toBe(endsAt + 5 * MIN);
  });

  it('hands control to the next player when the controller leaves', () => {
    const { queue } = setup();
    queue.join({ id: 'a', name: 'A' });
    queue.join({ id: 'b', name: 'B' });
    queue.leave('a');
    expect(queue.controllerId()).toBe('b');
    queue.leave('b');
    expect(queue.controllerId()).toBeNull();
  });

  it('freezes the clock while paused, for every reason until all are lifted', () => {
    const { clock, queue } = setup();
    queue.join({ id: 'a', name: 'A' });
    queue.join({ id: 'b', name: 'B' });
    clock.advance(4 * MIN);
    expect(queue.pause('stream')).toBe(true);
    expect(queue.pause('stream')).toBe(false);
    queue.pause('admin');
    clock.advance(60 * MIN);
    expect(queue.tick()).toBe(false);
    expect(queue.snapshot().paused?.remainingMs).toBe(6 * MIN);
    queue.resume('stream');
    expect(queue.pausedAt()).not.toBeNull();
    queue.resume('admin');
    expect(queue.pausedAt()).toBeNull();
    clock.advance(6 * MIN - 1);
    expect(queue.tick()).toBe(false);
    clock.advance(1);
    expect(queue.tick()).toBe(true);
    expect(queue.controllerId()).toBe('b');
  });

  it('restores a saved line with the controller time left', () => {
    const { queue, clock } = setup();
    queue.restore({ player: { id: 'a', name: 'A' }, remainingMs: 2 * MIN }, [{ id: 'b', name: 'B' }]);
    expect(queue.snapshot().current?.endsAt).toBe(clock.now + 2 * MIN);
    expect(queue.ids()).toStrictEqual(['a', 'b']);
    queue.restore(null, [{ id: 'c', name: 'C' }]);
    expect(queue.controllerId()).toBe('c');
  });
});
