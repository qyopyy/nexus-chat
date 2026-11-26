import { describe, expect, it } from 'bun:test';
import { GatedConsole, MacroRunner, parseMacro } from '../src/application/macros.ts';
import { NEUTRAL_STATE } from '../src/domain/controller-state.ts';
import { RecordingConsole } from './helpers.ts';

describe('parseMacro', () => {
  it('accepts a list of button steps', () => {
    expect(parseMacro([{ buttons: ['r1', 'r2'], ms: 90 }, { buttons: [], ms: 100 }])).toEqual([
      { buttons: ['r1', 'r2'], ms: 90 },
      { buttons: [], ms: 100 },
    ]);
  });

  it('rejects anything malformed, console-level buttons and out-of-range timing', () => {
    expect(parseMacro(undefined)).toBeNull();
    expect(parseMacro([])).toBeNull();
    expect(parseMacro([{ buttons: ['ps'], ms: 90 }])).toBeNull();
    expect(parseMacro([{ buttons: ['create'], ms: 90 }])).toBeNull();
    expect(parseMacro([{ buttons: ['nope'], ms: 90 }])).toBeNull();
    expect(parseMacro([{ buttons: ['cross'], ms: 1 }])).toBeNull();
    expect(parseMacro([{ buttons: ['cross'], ms: 99_999 }])).toBeNull();
    expect(parseMacro(Array.from({ length: 500 }, () => ({ buttons: ['cross'], ms: 50 })))).toBeNull();
  });
});

describe('MacroRunner', () => {
  it('presses each step in order, then lets go', async () => {
    const device = new RecordingConsole();
    const waits: number[] = [];
    const runner = new MacroRunner(device, async (ms) => void waits.push(ms));
    await runner.run([{ buttons: ['cross'], ms: 50 }, { buttons: ['up', 'left'], ms: 70 }]);
    expect(device.applied.map((s) => Object.entries(s.buttons).filter(([, on]) => on).map(([n]) => n))).toEqual([
      ['cross'],
      ['up', 'left'],
    ]);
    expect(waits).toEqual([50, 70]);
    expect(device.releases).toBe(2);
    expect(runner.running).toBe(false);
  });

  it('drops player input while it plays and refuses a second run', async () => {
    const device = new RecordingConsole();
    let finish!: () => void;
    const runner = new MacroRunner(device, () => new Promise<void>((resolve) => (finish = resolve)));
    const gated = new GatedConsole(device, runner);
    const first = runner.run([{ buttons: ['cross'], ms: 50 }]);
    expect(runner.running).toBe(true);
    const before = device.applied.length;
    gated.apply(NEUTRAL_STATE);
    expect(device.applied.length).toBe(before);
    expect(await runner.run([{ buttons: ['cross'], ms: 50 }])).toBe(false);
    finish();
    await first;
    gated.apply(NEUTRAL_STATE);
    expect(device.applied.length).toBe(before + 1);
  });
});
