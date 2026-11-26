import { describe, expect, it } from 'bun:test';
import { BUTTON_ORDER, decodeInput, encodeInput, INPUT_FRAME_BYTES } from '../public/js/input-codec.js';
import { toChiakiPacket } from '../src/adapters/console/chiaki-console.ts';
import { BUTTONS, NEUTRAL_STATE, parseControllerState } from '../src/domain/controller-state.ts';

describe('input codec', () => {
  it('uses the same button order as the server', () => {
    expect([...BUTTON_ORDER]).toStrictEqual([...BUTTONS]);
  });

  it('round-trips a controller state in 15 bytes', () => {
    const frame = encodeInput({ buttons: { cross: true, r3: true }, sticks: { lx: -1, ry: 0.5 }, triggers: { r2: 1 } });
    expect(frame.byteLength).toBe(INPUT_FRAME_BYTES);
    const decoded = decodeInput(frame)!;
    expect(decoded.buttons.cross).toBe(true);
    expect(decoded.buttons.r3).toBe(true);
    expect(decoded.buttons.circle).toBe(false);
    expect(decoded.sticks.lx).toBe(-1);
    expect(Math.abs(decoded.sticks.ry - 0.5) < 0.001).toBe(true);
    expect(decoded.triggers.r2).toBe(1);
  });

  it('clamps out-of-range values and rejects other frames', () => {
    const decoded = decodeInput(encodeInput({ sticks: { lx: 9 }, triggers: { l2: -3 } }))!;
    expect(decoded.sticks.lx).toBe(1);
    expect(decoded.triggers.l2).toBe(0);
    expect(decodeInput(new Uint8Array(14))).toBeNull();
    expect(decodeInput(new Uint8Array(15))).toBeNull();
  });
});

describe('controller state', () => {
  it('turns untrusted input into a bounded state', () => {
    const state = parseControllerState({ buttons: { cross: 'yes', l2: true }, sticks: { lx: 4, ly: 'x' }, extra: 1 })!;
    expect(state.buttons.cross).toBe(false);
    expect(state.triggers.l2).toBe(1);
    expect(state.sticks.lx).toBe(1);
    expect(state.sticks.ly).toBe(0);
    expect(parseControllerState('nope')).toBeNull();
  });

  it('maps to the chiaki-ng packet', () => {
    expect(toChiakiPacket(NEUTRAL_STATE)).toStrictEqual({ v: 1, buttons: 0, l2: 0, r2: 0, lx: 0, ly: 0, rx: 0, ry: 0 });
    const packet = toChiakiPacket(parseControllerState({ buttons: { cross: true, ps: true }, sticks: { lx: -1 } })!);
    expect(packet.buttons).toBe(1 | (1 << 15));
    expect(packet.lx).toBe(-32767);
  });
});
