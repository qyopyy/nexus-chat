import { describe, expect, it } from 'bun:test';
import { stickFromOffset } from '../public/js/touch-pad.js';
import { MONEY_PRESET, parseMacroText } from '../public/js/admin-macro.js';

describe('touch stick', () => {
  it('is centered inside the dead zone and for no movement', () => {
    expect(stickFromOffset(0, 0, 56)).toEqual([0, 0]);
    expect(stickFromOffset(3, 2, 56)).toEqual([0, 0]);
  });

  it('reaches full deflection at the radius and never exceeds it', () => {
    const [x, y] = stickFromOffset(56, 0, 56);
    expect(x).toBeCloseTo(1);
    expect(y).toBeCloseTo(0);
    const [bx, by] = stickFromOffset(400, 400, 56);
    expect(Math.hypot(bx, by)).toBeCloseTo(1);
  });

  it('points the way the finger moved (up and left are negative)', () => {
    const [x, y] = stickFromOffset(-30, -30, 56);
    expect(x).toBeLessThan(0);
    expect(y).toBeLessThan(0);
  });
});

describe('admin macro text', () => {
  it('parses the money preset into 24 taps and gaps', () => {
    const parsed = parseMacroText(MONEY_PRESET);
    expect('steps' in parsed && parsed.steps.length).toBe(24);
  });

  it('names the bad line and never allows console buttons', () => {
    expect(parseMacroText('cross 90\nps 90')).toEqual({ error: 'Line 2: unknown or blocked button "ps".' });
    expect(parseMacroText('cross 5')).toHaveProperty('error');
    expect(parseMacroText('')).toHaveProperty('error');
  });
});
