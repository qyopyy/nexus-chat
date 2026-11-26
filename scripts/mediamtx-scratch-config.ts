// Turns mediamtx/mediamtx.yml into a scratch config for tests that can run next to a live
// MediaMTX: every listener moves to the given ports and RTSP ingest is on. Lines are rewritten by
// key, and the result is rejected if a live port is still in it, so a config edit can never make
// a test bind the production ports.
import { createHash } from 'node:crypto';

const LIVE_PORTS = [8554, 8889, 9997, 8189] as const;

interface ScratchPorts {
  rtsp: number;
  webrtc: number;
  api: number;
  iceUdp: number;
}

/** Rewrites `key: [host]:port` at the start of a line, keeping the host and any comment. */
function setPort(config: string, key: string, port: number): { config: string; found: boolean } {
  const line = new RegExp(`^(\\s*${key}:\\s*["']?)([^\\s"'#]*):\\d+(["']?)`, 'm');
  if (!line.test(config)) return { config, found: false };
  return {
    config: config.replace(line, (_m, head: string, host: string, tail: string) => `${head}${host}:${port}${tail}`),
    found: true,
  };
}

/** A copy of `source` with every listener on the scratch ports. Throws if a live port remains. */
export function scratchMediaMtxConfig(source: string, ports: ScratchPorts): string {
  let config = source;
  const keys = [
    ['webrtcAddress', ports.webrtc],
    ['apiAddress', ports.api],
    ['webrtcLocalUDPAddress', ports.iceUdp],
  ] as const;
  for (const [key, port] of keys) {
    const result = setPort(config, key, port);
    if (!result.found) throw new Error(`mediamtx.yml has no ${key}: line to move off the live port`);
    config = result.config;
  }
  const rtsp = setPort(config, 'rtspAddress', ports.rtsp);
  config = rtsp.config;
  if (/^rtsp:\s*\S+/m.test(config)) config = config.replace(/^rtsp:\s*\S+.*$/m, 'rtsp: true');
  else config += '\nrtsp: true\n';
  if (!rtsp.found) config = config.replace(/^rtsp: true$/m, `rtsp: true\nrtspAddress: 127.0.0.1:${ports.rtsp}`);
  if (!/^rtspTransports:/m.test(config)) config = config.replace(/^rtsp: true$/m, 'rtsp: true\nrtspTransports: [tcp]');

  const leftovers = config
    .split('\n')
    .map((line) => line.replace(/#.*/, ''))
    .filter((line) => LIVE_PORTS.some((port) => new RegExp(`:${port}\\b`).test(line)));
  if (leftovers.length) throw new Error(`scratch MediaMTX config still uses a live port: ${leftovers.join(' | ')}`);
  return config;
}

/** The API user in mediamtx/mediamtx.yml (authInternalUsers[1]). */
export const MEDIAMTX_API_USER = 'playgta-api';

/** Environment that makes a MediaMTX accept `pass` for the API user. */
export function mediaMtxApiEnv(pass: string): Record<string, string> {
  return {
    MTX_AUTHINTERNALUSERS_1_USER: MEDIAMTX_API_USER,
    MTX_AUTHINTERNALUSERS_1_PASS: `sha256:${createHash('sha256').update(pass).digest('base64')}`,
  };
}

/** Authorization header for the API of a MediaMTX started with {@link mediaMtxApiEnv}. */
export function mediaMtxApiAuthorization(pass: string): string {
  return `Basic ${Buffer.from(`${MEDIAMTX_API_USER}:${pass}`).toString('base64')}`;
}
