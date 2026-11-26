// End-to-end test of chiaki-ng's StreamOut patch without a PS5 (run through scripts/test-stream-out.sh).
// The streamout_test binary links the real StreamOut code and feeds it like a chiaki session does;
// this script runs a scratch MediaMTX built from mediamtx/mediamtx.yml on free ports, checks what
// MediaMTX receives, plays it in headless Chrome through our server's WHEP proxy, and stops and
// restarts MediaMTX underneath the publisher.
import { type ChildProcess, execFile, execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { inspect, promisify } from 'node:util';
import { WebSocket } from 'ws';
import {
  MEDIAMTX_API_USER,
  mediaMtxApiAuthorization,
  mediaMtxApiEnv,
  scratchMediaMtxConfig,
} from '../../../scripts/mediamtx-scratch-config.ts';

const ROOT = resolve(import.meta.dirname, '../../..');
const HARNESS = process.argv[2] ?? '';
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEBUG = !!process.env.STREAM_OUT_DEBUG;

const children = new Set<ChildProcess>();
let scratch = '';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function start(command: string, args: string[], env: Record<string, string> = {}, cwd = ROOT): ChildProcess {
  const child = spawn(command, args, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  children.add(child);
  child.on('exit', () => children.delete(child));
  if (DEBUG) {
    const tag = command.split('/').pop();
    child.stdout?.on('data', (d) => process.stderr.write(`[${tag}] ${d}`));
    child.stderr?.on('data', (d) => process.stderr.write(`[${tag}!] ${d}`));
  }
  return child;
}

async function stop(child: ChildProcess, timeoutMs = 5000): Promise<number> {
  if (child.exitCode !== null) return 0;
  const t0 = Date.now();
  const exited = new Promise((r) => child.once('exit', r));
  child.kill('SIGTERM');
  await Promise.race([exited, sleep(timeoutMs)]);
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  return Date.now() - t0;
}

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as { port: number };
  await new Promise((r) => server.close(r));
  return port;
}

async function waitFor<T>(
  what: string,
  probe: () => Promise<T | undefined | false> | T | undefined | false,
  timeoutMs = 10_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: unknown;
  while (Date.now() < deadline) {
    try {
      const value = await probe();
      if (value) return value;
    } catch (error) {
      last = error;
    }
    await sleep(200);
  }
  throw new Error(`Timed out waiting for ${what}${last ? ` (${errorText(last)})` : ''}`);
}

/** A thrown value as text, whatever its type. */
function errorText(value: unknown): string {
  return typeof value === 'string' ? value : inspect(value);
}

const results: Array<{ name: string; ok: boolean }> = [];
async function check(name: string, run: () => Promise<string | void>) {
  try {
    const detail = await run();
    results.push({ name, ok: true });
    console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`);
  } catch (error) {
    results.push({ name, ok: false });
    console.log(`  ✗ ${name} — ${error instanceof Error ? error.message : errorText(error)}`);
  }
}
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// ---------- publisher (streamout_test) ----------

type Stats = {
  video_in: number;
  video_out: number;
  video_skipped: number;
  audio_out: number;
  queue_dropped: number;
  connects: number;
  idr_requests: number;
  idr_answers: number;
  max_push_us: number;
  video_resyncs: number;
  audio_resyncs: number;
  connected: boolean;
  refused: boolean;
};

function publisher(args: string[], env: Record<string, string> = {}) {
  const child = start(HARNESS, ['publish', ...args], { CHIAKI_STREAM_OUT_IDR_MS: '2000', ...env });
  const stats: Stats[] = [];
  let output = '';
  let buffered = '';
  const read = (d: Buffer) => {
    output += d;
    buffered += d;
    const lines = buffered.split('\n');
    buffered = lines.pop() ?? '';
    for (const line of lines) if (line.startsWith('{"video_in"')) stats.push(JSON.parse(line));
  };
  child.stdout!.on('data', read);
  child.stderr!.on('data', (d) => {
    output += d;
  });
  return { child, stats, latest: () => stats.at(-1), output: () => output };
}

// ---------- MediaMTX ----------

// The API needs a password, like the live one's: a fresh one for this run.
const apiPass = randomBytes(16).toString('hex');
const apiHeaders = { authorization: mediaMtxApiAuthorization(apiPass) };

async function mediamtx(config: string, apiPort: number) {
  const child = start('mediamtx', [config], mediaMtxApiEnv(apiPass), scratch);
  await waitFor(
    'MediaMTX API',
    async () => (await fetch(`http://127.0.0.1:${apiPort}/v3/paths/list`, { headers: apiHeaders })).ok,
  );
  return child;
}

async function pathInfo(apiPort: number) {
  const res = await fetch(`http://127.0.0.1:${apiPort}/v3/paths/get/console`, { headers: apiHeaders });
  if (!res.ok) return undefined;
  return res.json() as Promise<{
    ready: boolean;
    tracks: string[];
    bytesReceived: number;
    tracks2?: Array<{ codec: string; codecProps?: any }>;
  }>;
}

// ---------- Chrome DevTools Protocol (minimal) ----------

async function chromePage(debugPort: number, url: string) {
  const version = await waitFor(
    'Chrome DevTools',
    async () =>
      (await fetch(`http://127.0.0.1:${debugPort}/json/version`)).json() as Promise<{ webSocketDebuggerUrl: string }>,
  );
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((r) => ws.on('open', r));
  let nextId = 0;
  const pending = new Map<number, (m: any) => void>();
  ws.on('message', (data) => {
    const m = JSON.parse(
      (Array.isArray(data) ? Buffer.concat(data) : Buffer.isBuffer(data) ? data : Buffer.from(data)).toString(),
    );
    pending.get(m.id)?.(m);
    pending.delete(m.id);
  });
  const send = (method: string, params: object = {}, sessionId?: string): Promise<any> => {
    const id = ++nextId;
    return new Promise((res, rej) => {
      pending.set(id, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result)));
      ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  };
  const { targetId } = await send('Target.createTarget', { url, newWindow: true });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const evaluate = async <T>(expression: string): Promise<T> => {
    const { result, exceptionDetails } = await send(
      'Runtime.evaluate',
      { expression, returnByValue: true, awaitPromise: true },
      sessionId,
    );
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? 'evaluation failed');
    return result.value as T;
  };
  const video = () =>
    evaluate<{ width: number; advancing: boolean; tracks: string[] }>(`(async () => {
    const v = document.getElementById('live'); const t0 = v.currentTime;
    await new Promise((r) => setTimeout(r, 700));
    return { width: v.videoWidth, advancing: !v.hidden && v.currentTime > t0,
      tracks: v.srcObject ? v.srcObject.getTracks().map((t) => t.kind) : [] };
  })()`);
  return { evaluate, video, close: () => ws.close() };
}

// ---------- scenario ----------

async function main() {
  scratch = await mkdtemp(join(tmpdir(), 'playgta-stream-out-'));
  const [rtspPort, webrtcPort, apiPort, icePort, webPort, debugPort] = (await Promise.all(
    Array.from({ length: 6 }, freePort),
  )) as [number, number, number, number, number, number];
  // Publishing the console path needs the API user's credentials, as in production.
  const rtspUrl = `rtsp://${MEDIAMTX_API_USER}:${apiPass}@127.0.0.1:${rtspPort}/console`;

  console.log('Preparing test media…');
  const h264 = join(scratch, 'console.h264');
  const hevc = join(scratch, 'console.hevc');
  // One keyframe every 10 s, like the console (which sends them on request): quick recoveries
  // below prove StreamOut asks for keyframes.
  execFileSync('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=1280x720:rate=60',
    '-t',
    '20',
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-tune',
    'zerolatency',
    '-bf',
    '0',
    '-g',
    '600',
    '-pix_fmt',
    'yuv420p',
    '-f',
    'h264',
    h264,
  ]);
  execFileSync('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=640x360:rate=30',
    '-t',
    '2',
    '-c:v',
    'libx265',
    '-preset',
    'ultrafast',
    '-x265-params',
    'log-level=error',
    '-f',
    'hevc',
    hevc,
  ]);

  const config = join(scratch, 'mediamtx.yml');
  const original = await readFile(join(ROOT, 'mediamtx/mediamtx.yml'), 'utf8');
  // Throws rather than leave a live port (8554/8889/9997/8189) in the scratch config.
  const scratchConfig = scratchMediaMtxConfig(original, {
    rtsp: rtspPort,
    webrtc: webrtcPort,
    api: apiPort,
    iceUdp: icePort,
  });
  // Tests stay on loopback: media over 127.0.0.1 only, no LAN addresses and no public STUN server.
  const patched = scratchConfig
    .replace(/^webrtcLocalUDPAddress:.*$/m, `webrtcLocalUDPAddress: 127.0.0.1:${icePort}`)
    .replace(/^webrtcIPsFromInterfaces:.*$/m, 'webrtcIPsFromInterfaces: false')
    .replace(/^webrtcICEServers2:\n(?:\s+-.*\n)+/m, 'webrtcICEServers2: []\n');
  assert(
    patched.includes(`webrtcLocalUDPAddress: 127.0.0.1:${icePort}`) && patched.includes('webrtcICEServers2: []'),
    'could not keep the scratch MediaMTX on loopback',
  );
  await writeFile(config, patched);

  console.log('\nOffline checks');
  await check('NAL classification, HEVC refused, no server never blocks', async () => {
    const out = execFileSync(HARNESS, ['unit', h264, hevc], { encoding: 'utf8' });
    assert(out.trim().endsWith('PASSED'), out);
    assert(out.includes('browsers need H.264') && out.includes('not H.264'), 'missing HEVC warnings');
    return `${out.split('\n').filter((l) => l.startsWith('ok')).length} assertions`;
  });

  let mtx = await mediamtx(config, apiPort);

  console.log('\nHEVC session');
  await check('HEVC stream is refused with a warning and never published', async () => {
    const pub = publisher([rtspUrl, hevc, '3', 'hevc']);
    await new Promise((r) => pub.child.once('exit', r));
    const last = pub.latest();
    assert(pub.output().includes("Set chiaki-ng's video codec to H264"), 'no warning');
    assert(last?.refused && last.connects === 0, `stats ${JSON.stringify(last)}`);
    assert(!(await pathInfo(apiPort))?.ready, 'path became ready');
    return 'warned, 0 connections, path not ready';
  });

  console.log('\nPublishing');
  const pub = publisher([rtspUrl, h264, '90']);
  await check('MediaMTX receives H264 + Opus from StreamOut', async () => {
    const info = await waitFor(
      'path ready',
      async () => {
        const i = await pathInfo(apiPort);
        return i?.ready && i;
      },
      10_000,
    );
    assert(info.tracks.join(',') === 'H264,Opus', `tracks ${info.tracks.join(',')}`);
    const before = info.bytesReceived;
    await sleep(1000);
    const after = (await pathInfo(apiPort))!.bytesReceived;
    assert(after > before, 'no bytes flowing');
    const v = info.tracks2?.find((t) => t.codec === 'H264')?.codecProps;
    return `tracks ${info.tracks.join(' + ')}, ${v ? `${v.width}x${v.height} ${v.profile}, ` : ''}${Math.round(((after - before) * 8) / 1000)} kbit/s`;
  });
  await check('every pushed packet is written, none dropped', async () => {
    const s = await waitFor('stats', () => pub.latest());
    assert(s.video_out > 0 && s.audio_out > 0, JSON.stringify(s));
    assert(s.queue_dropped === 0, `dropped ${s.queue_dropped}`);
    return `${s.video_out} video / ${s.audio_out} audio packets, slowest push ${s.max_push_us} µs`;
  });

  // No .env: the scratch server must only see the settings below.
  start(process.execPath, ['--no-env-file', 'src/main.ts'], {
    PORT: String(webPort),
    CONSOLE: 'simulated',
    VIDEO: 'webrtc',
    STUN_URLS: 'none',
    STATE_FILE: 'off',
    MEDIAMTX_URL: `http://127.0.0.1:${webrtcPort}`,
    MEDIAMTX_API_URL: `http://127.0.0.1:${apiPort}`,
    MEDIAMTX_API_USER,
    MEDIAMTX_API_PASS: apiPass,
  });
  const url = `http://127.0.0.1:${webPort}/`;
  await waitFor('web server', async () => (await fetch(url)).ok);
  start(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${join(scratch, 'chrome')}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--autoplay-policy=no-user-gesture-required',
    'about:blank',
  ]);
  const page = await chromePage(debugPort, url);

  await check('Chrome plays it through the WHEP proxy (video + audio)', async () => {
    await waitFor('page connected', () =>
      page.evaluate(`document.getElementById('connection').textContent === 'Connected'`),
    );
    await page.evaluate(
      `document.getElementById('name').value = 'Ana'; document.getElementById('join-form').requestSubmit(); true`,
    );
    const v = await waitFor(
      'video playing',
      async () => {
        const sample = await page.video();
        return sample.width > 0 && sample.advancing && sample;
      },
      20_000,
    );
    assert(v.tracks.includes('video') && v.tracks.includes('audio'), `tracks ${v.tracks.join(',')}`);
    return `${v.width}px wide, tracks ${v.tracks.join(' + ')}`;
  });

  console.log('\nMediaMTX goes away');
  let downAt = 0;
  await check('publisher keeps running and never blocks while MediaMTX is down', async () => {
    const before = pub.latest()!;
    await stop(mtx);
    downAt = Date.now();
    await sleep(4000);
    const during = pub.latest()!;
    assert(pub.child.exitCode === null, 'publisher exited');
    assert(during.video_in - before.video_in >= 200, `only ${during.video_in - before.video_in} frames pushed in 4 s`);
    assert(!during.connected, 'still connected');
    assert(during.max_push_us < 20_000, `a push took ${during.max_push_us} µs`);
    return `${during.video_in - before.video_in} frames pushed in 4 s, slowest push ${during.max_push_us} µs`;
  });
  await check('publishing resumes on its own when MediaMTX is back, on a requested keyframe', async () => {
    const before = pub.latest()!;
    mtx = await mediamtx(config, apiPort);
    const t0 = Date.now();
    await waitFor('path ready again', async () => (await pathInfo(apiPort))?.ready, 10_000);
    const flowing = await waitFor(
      'video flowing again',
      () => {
        const s = pub.latest()!;
        return s.video_out > before.video_out + 30 && s;
      },
      10_000,
    );
    const took = Date.now() - t0;
    assert(flowing.connects >= 2, `connects ${flowing.connects}`);
    assert(flowing.idr_answers > before.idr_answers, 'no keyframe was requested after reconnecting');
    assert(took < 5000, `took ${took} ms (the file has a keyframe only every 10 s)`);
    return `back after ${took} ms (down ${Math.round((t0 - downAt) / 1000)} s), ${flowing.connects} connections`;
  });
  await check('Chrome gets the video back', async () => {
    const v = await waitFor(
      'video back',
      async () => {
        const sample = await page.video();
        return sample.width > 0 && sample.advancing && sample;
      },
      30_000,
    );
    return `${v.width}px, playing`;
  });

  console.log('\nMediaMTX hangs (stops reading)');
  await check('a frozen MediaMTX never stalls the pushing thread; old packets are dropped', async () => {
    const before = pub.latest()!;
    mtx.kill('SIGSTOP');
    await sleep(5000);
    const during = pub.latest()!;
    mtx.kill('SIGCONT');
    assert(during.video_in - before.video_in >= 250, `only ${during.video_in - before.video_in} frames pushed in 5 s`);
    assert(during.max_push_us < 20_000, `a push took ${during.max_push_us} µs`);
    assert(during.queue_dropped > before.queue_dropped || !during.connected, `stats ${JSON.stringify(during)}`);
    return `${during.video_in - before.video_in} frames pushed in 5 s, ${during.queue_dropped - before.queue_dropped} dropped, slowest push ${during.max_push_us} µs`;
  });
  await check('publishing resumes after the hang', async () => {
    const before = pub.latest()!;
    const t0 = Date.now();
    const flowing = await waitFor(
      'video flowing again',
      () => {
        const s = pub.latest()!;
        return s.connected && s.video_out > before.video_out + 30 && s;
      },
      15_000,
    );
    assert((await pathInfo(apiPort))?.ready, 'path not ready');
    assert(
      flowing.connects > before.connects || pub.output().includes('Operation timed out'),
      'the stuck connection was never dropped',
    );
    return `flowing again after ${Date.now() - t0} ms, ${flowing.connects} connections`;
  });

  await check('publisher shuts down promptly', async () => {
    const took = await stop(pub.child);
    assert(took < 3000, `took ${took} ms`);
    const shutdown = /"shutdown_ms":(\d+)/.exec(pub.output());
    return `StreamOut stopped in ${shutdown?.[1] ?? '?'} ms`;
  });
  page.close();

  console.log('\nWi-Fi jitter');
  await check(
    'video is timed by frame index: frames held back 120 ms leave no gap in the RTSP timestamps',
    async () => {
      const jittery = publisher([rtspUrl, h264, '12'], { STREAM_OUT_TEST_JITTER: '1' });
      await waitFor('path ready', async () => (await pathInfo(apiPort))?.ready, 10_000);
      await sleep(1000);
      // 6 s of packets, across the 16-bit frame index wraparound (5.6 s in).
      const { stdout } = await promisify(execFile)(
        'ffprobe',
        [
          '-v',
          'error',
          '-rtsp_transport',
          'tcp',
          '-select_streams',
          'v:0',
          '-show_entries',
          'packet=pts_time',
          '-of',
          'csv=p=0',
          '-read_intervals',
          '%+6',
          rtspUrl,
        ],
        { timeout: 20_000 },
      );
      await stop(jittery.child);
      // One "pts_time[,side data]" line per packet; "N/A" before the first RTCP report.
      const pts = stdout
        .split('\n')
        .map((l) => parseFloat(l))
        .filter((t) => Number.isFinite(t) && t > 0);
      assert(pts.length > 200, `only ${pts.length} packets`);
      const deltas = pts.slice(1).map((t, i) => (t - pts[i]!) * 1000);
      const gaps = deltas.filter((d) => d > 50).length;
      const backwards = deltas.filter((d) => d <= 0).length;
      const s = jittery.latest();
      assert(
        gaps === 0 && backwards === 0,
        `${gaps} gaps over 50 ms, ${backwards} not increasing, max ${Math.max(...deltas).toFixed(1)} ms`,
      );
      assert(s?.video_resyncs === 0, `stats ${JSON.stringify(s)}`);
      return `${pts.length} frames, largest pts step ${Math.max(...deltas).toFixed(1)} ms (frames were 136 ms apart once a second)`;
    },
  );
}

try {
  await main();
} catch (error) {
  console.log(`\n✗ aborted: ${error instanceof Error ? error.stack : errorText(error)}`);
  results.push({ name: 'setup', ok: false });
} finally {
  await Promise.all([...children].map((c) => stop(c)));
  if (scratch) await rm(scratch, { recursive: true, force: true });
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
}
