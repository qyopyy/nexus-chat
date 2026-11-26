import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const config = readFileSync(join(import.meta.dirname, '../mediamtx/mediamtx.yml'), 'utf8');
const value = (key: string) => config.match(new RegExp(`^${key}:\\s*(.*?)\\s*(#.*)?$`, 'm'))?.[1];

describe('mediamtx/mediamtx.yml', () => {
  // MediaMTX turns these on by default and binds them on every interface; a new MediaMTX release
  // can add one (MoQ in 1.21), so each must be off here by name.
  it.each(['rtmp', 'hls', 'srt', 'moq', 'playback'])('turns off the unused %s server', (key) => {
    expect(value(key)).toBe('false');
  });

  it('keeps every TCP listener on loopback', () => {
    for (const key of ['apiAddress', 'rtspAddress', 'webrtcAddress']) {
      expect(value(key)).toMatch(/^127\.0\.0\.1:\d+$/);
    }
  });
});
