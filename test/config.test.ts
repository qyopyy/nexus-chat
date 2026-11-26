import { describe, expect, it } from 'bun:test';
import { ConfigError, loadConfig } from '../src/adapters/config/env-config.ts';

function issues(env: Record<string, string>): readonly string[] {
  try {
    loadConfig(env);
    return [];
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    return error.issues;
  }
}

describe('loadConfig', () => {
  it('has safe defaults with every optional feature off', () => {
    const config = loadConfig({});
    expect(config.http.host).toBe('127.0.0.1');
    expect(config.http.port).toBe(3000);
    expect(config.turns.turnMs).toBe(600_000);
    expect(config.turns.blockedButtons).toStrictEqual(['ps', 'create']);
    expect(config.console).toStrictEqual({ kind: 'simulated' });
    expect(config.video).toBeNull();
    expect(config.admin).toBeNull();
    expect(config.kickLogin).toBeNull();
    expect(config.http.trustedProxy).toBe('none');
    expect(config.paused).toBe(false);
    expect(config.keyboardLayout).toBe('gta');
    expect(config.persistence?.file).toBe('state/state.json');
  });

  it('turns features on from their variables', () => {
    const config = loadConfig({
      CONSOLE: 'chiaki',
      CONSOLE_HOST: '192.0.2.10',
      VIDEO: 'webrtc',
      MEDIAMTX_API_USER: 'api',
      MEDIAMTX_API_PASS: 'secret',
      ADMIN_TOKEN: 'a-long-enough-admin-token',
      PUBLIC_URL: 'https://play.example.com',
      TRUSTED_PROXY: 'cloudflare',
      KICK_CLIENT_ID: 'id',
      KICK_CLIENT_SECRET: 'secret',
      STATE_FILE: 'off',
      PAUSED: 'true',
      BLOCKED_BUTTONS: 'none',
      KEYBOARD_LAYOUT: 'Generic',
    });
    expect(config.console).toStrictEqual({ kind: 'chiaki', inputPort: 9370, consoleHost: '192.0.2.10' });
    expect(config.video?.apiUser).toBe('api');
    expect(config.http.trustedProxy).toBe('cloudflare');
    expect(config.admin?.token).toBe('a-long-enough-admin-token');
    expect(config.kickLogin?.clientId).toBe('id');
    expect(config.persistence).toBeNull();
    expect(config.paused).toBe(true);
    expect(config.turns.blockedButtons).toStrictEqual([]);
    expect(config.keyboardLayout).toBe('generic');
  });

  it('reports every invalid variable at once', () => {
    const found = issues({
      PORT: 'abc',
      TURN_MINUTES: '-1',
      CONSOLE: 'xbox',
      BLOCKED_BUTTONS: 'ps,turbo',
      KICK_CLIENT_ID: 'only-the-id',
      ADMIN_TOKEN: 'short',
      PAUSED: 'maybe',
    });
    expect(found.length).toBe(7);
    expect(found.some((issue) => issue.startsWith('PORT'))).toBe(true);
    expect(found.some((issue) => issue.includes('turbo'))).toBe(true);
    expect(found.some((issue) => issue.includes('KICK_CLIENT_ID and KICK_CLIENT_SECRET'))).toBe(true);
  });

  it('ignores variables it does not know, such as ones from older versions', () => {
    expect(issues({ UNKNOWN_SETTING: 'x', OLD_SETTING: 'abc' })).toStrictEqual([]);
  });

  it('refuses the admin API on a public site without a trusted proxy', () => {
    const env = { ADMIN_TOKEN: 'a-long-enough-admin-token', PUBLIC_URL: 'https://play.example.com' };
    expect(issues(env).length).toBe(1);
    expect(issues({ ...env, TRUSTED_PROXY: 'cloudflare' })).toStrictEqual([]);
    expect(issues({ ADMIN_TOKEN: env.ADMIN_TOKEN })).toStrictEqual([]);
    expect(issues({ TRUSTED_PROXY: 'nginx' }).length).toBe(1);
  });

  it('accepts only the keyboard layouts the page knows', () => {
    expect(issues({ KEYBOARD_LAYOUT: 'wasd' })).toStrictEqual([
      'KEYBOARD_LAYOUT must be one of gta, generic (got "wasd")',
    ]);
    expect(issues({ KEYBOARD_LAYOUT: 'gta' })).toStrictEqual([]);
  });

  it('requires PUBLIC_URL for Kick login', () => {
    expect(issues({ KICK_CLIENT_ID: 'id', KICK_CLIENT_SECRET: 's' })).toStrictEqual([
      'KICK_CLIENT_ID needs PUBLIC_URL (the OAuth redirect URL)',
    ]);
  });

  it('requires the console as an IP address when its video goes over WebRTC', () => {
    const env = { CONSOLE: 'chiaki', VIDEO: 'webrtc' };
    expect(issues({ ...env, CONSOLE_HOST: 'console.lan' }).length).toBe(1);
    expect(issues(env).length).toBe(1);
    expect(issues({ ...env, CONSOLE_HOST: '192.0.2.10' })).toStrictEqual([]);
    expect(issues({ CONSOLE: 'chiaki' })).toStrictEqual([]);
  });
});
