import { describe, expect, it } from 'bun:test';
import { parseArgs, renderOverlay, renderSlate, toastText } from '../scripts/kick-overlay.ts';
import { type OverlayState, overlayEvents, shortUrl } from '../src/application/overlay-state.ts';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

const state = (over: Partial<OverlayState> = {}): OverlayState => ({
  playing: 'Ana',
  remainingMs: 60_000,
  paused: false,
  next: null,
  last: null,
  waiting: 0,
  turnMs: 600_000,
  ...over,
});

describe('overlay state', () => {
  it('announces turns and joins once each', () => {
    const before = state({ waiting: 1, next: 'Bo', last: 'Bo' });
    expect(overlayEvents(null, before)).toStrictEqual([]);
    const joined = state({ waiting: 2, next: 'Bo', last: 'Cy' });
    expect(overlayEvents(before, joined)).toStrictEqual([{ kind: 'joined', name: 'Cy' }]);
    const turn = state({ playing: 'Bo', waiting: 1, next: 'Cy', last: 'Cy' });
    expect(overlayEvents(joined, turn)).toStrictEqual([{ kind: 'turn', name: 'Bo' }]);
    expect(overlayEvents(turn, turn)).toStrictEqual([]);
  });

  it('shortens links for the broadcast', () => {
    expect(shortUrl('https://www.example.com/play/')).toBe('example.com/play');
    expect(shortUrl('not a url')).toBe('');
  });
});

describe('overlay renderer', () => {
  it('parses its arguments', () => {
    expect(parseArgs(['out.png'])).toStrictEqual({ output: 'out.png', mode: { kind: 'live' }, once: false });
    expect(parseArgs(['out.png', '--standby', '123', '--once']).mode).toStrictEqual({ kind: 'standby', until: 123 });
    expect(parseArgs(['out.png', '--paused']).mode).toStrictEqual({ kind: 'paused' });
    expect(() => parseArgs(['out.png', '--standby'])).toThrow();
    expect(() => parseArgs(['out.png', '--nope'])).toThrow();
    expect(toastText({ kind: 'turn', name: 'Cy' })).toBe("Cy's turn!");
    expect(toastText({ kind: 'joined', name: 'Cy' })).toBe('Cy joined the line');
  });

  it('draws PNGs for every mode', () => {
    for (const png of [
      renderOverlay(state({ next: 'Bo', waiting: 3 }), { text: 'Hi', until: 10 }, 'example.com', 'Live', 0),
      renderOverlay(null, null, '', 'Live', 0),
      renderSlate({ kind: 'standby', until: 60_000 }, 'example.com', 'Live', 0),
      renderSlate({ kind: 'paused' }, '', 'Live', 0),
    ]) {
      expect(png.subarray(0, 4)).toStrictEqual(PNG);
    }
  });
});
