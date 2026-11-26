// Renders the broadcast overlay as PNG files that the restream's ffmpeg re-reads a few times a second
// (deploy/macos/run-kick.sh):
//   - OUTPUT.png: a card in the top-left corner with who is playing, the time left, who is next, a
//     call to action with the site address and short announcements ("Ana joined the line").
// With --standby it draws the full-frame standby slate instead: "BE RIGHT BACK" and a countdown to
// UNTIL_EPOCH_MS. With --paused it draws the paused slate once.
//
// Usage: bun scripts/kick-overlay.ts OUTPUT.png [--standby UNTIL_EPOCH_MS | --paused] [--once]
// Environment: PORT (web server, default 3000), PUBLIC_URL (call to action), OVERLAY_TITLE.
import { renameSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createCanvas, GlobalFonts, type SKRSContext2D } from '@napi-rs/canvas';
import { type OverlayEvent, type OverlayState, overlayEvents, shortUrl } from '../src/application/overlay-state.ts';

const font = (file: string) => fileURLToPath(new URL(`../assets/fonts/${file}`, import.meta.url));
GlobalFonts.registerFromPath(font('Jost.ttf'), 'Jost');
GlobalFonts.registerFromPath(font('BigShouldersDisplay.ttf'), 'Big Shoulders Display');

const COLOR = {
  surface: 'rgba(11, 17, 32, 0.86)',
  border: 'rgba(148, 163, 184, 0.22)',
  track: 'rgba(148, 163, 184, 0.2)',
  text: '#e2e8f0',
  muted: '#94a3b8',
  live: '#f87171',
  ink: '#042f2e',
  accent: '#2dd4bf',
};
const DISPLAY = 'Big Shoulders Display';
/** Fits a 1080p frame. */
const SCALE = 1.2;
const OVERLAY_WIDTH = 440;
const OVERLAY_HEIGHT = 330;
const SLATE_WIDTH = 1920;
const SLATE_HEIGHT = 1080;
const FRAMES_PER_SECOND = 4;
const SLATE_FRAMES_PER_SECOND = 2;
const PAD = 20;
const TOAST_MS = 4500;
const ROTATE_MS = 6000;
const TAGLINES = ['Free · No download · Timed turns', 'Gamepad or keyboard', 'Join the line from your browser'];

type Toast = { text: string; until: number };

function fit(ctx: SKRSContext2D, label: string, maxWidth: number): string {
  if (ctx.measureText(label).width <= maxWidth) return label;
  let cut = [...label];
  while (cut.length > 1 && ctx.measureText(`${cut.join('')}…`).width > maxWidth) cut = cut.slice(0, -1);
  return `${cut.join('')}…`;
}

function panel(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: string,
  stroke?: string,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
  if (!stroke) return;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.stroke();
}

function text(
  ctx: SKRSContext2D,
  value: string,
  x: number,
  y: number,
  style: string,
  color: string,
  align: 'left' | 'right' | 'center' = 'left',
) {
  ctx.font = style;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.fillText(value, x, y);
  ctx.textAlign = 'left';
}

/** m:ss, rounded up. */
function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function toastText(event: OverlayEvent): string {
  return event.kind === 'turn' ? `${event.name}'s turn!` : `${event.name} joined the line`;
}

type Mode = { kind: 'live' } | { kind: 'standby'; until: number } | { kind: 'paused' };
type Args = { output: string | undefined; mode: Mode; once: boolean };

/** OUTPUT.png [--standby UNTIL_EPOCH_MS | --paused] [--once]. */
export function parseArgs(argv: readonly string[]): Args {
  const [output, ...rest] = argv;
  const args: Args = { output, mode: { kind: 'live' }, once: false };
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--once') args.once = true;
    else if (rest[i] === '--paused') args.mode = { kind: 'paused' };
    else if (rest[i] === '--standby') {
      const until = Number(rest[++i]);
      if (!Number.isFinite(until) || until <= 0) throw new Error('--standby needs UNTIL_EPOCH_MS');
      args.mode = { kind: 'standby', until };
    } else throw new Error(`Unknown argument: ${rest[i]}`);
  }
  return args;
}

/** PNG of the corner card. state null = the server did not answer: header and call to action only. */
export function renderOverlay(
  state: OverlayState | null,
  toast: Toast | null,
  site: string,
  title: string,
  now: number,
): Buffer {
  const canvas = createCanvas(Math.round(OVERLAY_WIDTH * SCALE), Math.round(OVERLAY_HEIGHT * SCALE));
  const ctx = canvas.getContext('2d');
  ctx.scale(SCALE, SCALE);
  const W = OVERLAY_WIDTH - 1;
  const right = W - PAD;
  const cardHeight = 172;
  panel(ctx, 0.5, 0.5, W, cardHeight, 20, COLOR.surface, COLOR.border);

  // Header: title and a LIVE badge with a pulsing dot.
  ctx.font = `800 30px "${DISPLAY}"`;
  const titleText = fit(ctx, title.toUpperCase(), 230);
  text(ctx, titleText, PAD, 42, `800 30px "${DISPLAY}"`, COLOR.text);
  const pulse = 0.35 + 0.65 * Math.abs(Math.sin((now / 1000) * Math.PI));
  const badge = 'LIVE';
  ctx.font = '800 13px Jost';
  const badgeWidth = 26 + ctx.measureText(badge).width + 12;
  panel(ctx, right - badgeWidth, 19, badgeWidth, 26, 13, COLOR.live);
  ctx.globalAlpha = pulse;
  ctx.fillStyle = COLOR.ink;
  ctx.beginPath();
  ctx.arc(right - badgeWidth + 14, 32, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  text(ctx, badge, right - badgeWidth + 24, 37, '800 13px Jost', COLOR.ink);

  text(ctx, state?.playing ? 'NOW PLAYING' : 'CONTROLLER FREE', PAD, 74, '600 12px Jost', COLOR.muted);
  if (state?.playing) {
    const timer = state.paused ? 'PAUSED' : formatRemaining(state.remainingMs ?? 0);
    text(ctx, timer, right, 104, `800 34px "${DISPLAY}"`, state.paused ? COLOR.muted : COLOR.accent, 'right');
    const timerWidth = ctx.measureText(timer).width;
    ctx.font = '700 26px Jost';
    text(ctx, fit(ctx, state.playing, right - PAD - timerWidth - 16), PAD, 103, '700 26px Jost', COLOR.text);
    const total = Math.max(state.turnMs, state.remainingMs ?? 0, 1);
    const progress = Math.min(1, Math.max(0, (state.remainingMs ?? 0) / total));
    panel(ctx, PAD, 116, W - PAD * 2, 5, 2.5, COLOR.track);
    if (progress > 0) panel(ctx, PAD, 116, Math.max(5, (W - PAD * 2) * progress), 5, 2.5, COLOR.accent);
  } else {
    text(ctx, 'Be the first to play!', PAD, 103, '700 24px Jost', COLOR.text);
  }

  if (state?.next) {
    ctx.font = '700 13px Jost';
    const labelWidth = ctx.measureText('UP NEXT').width;
    text(ctx, 'UP NEXT', PAD, 152, '700 13px Jost', COLOR.live);
    const line = `${state.next}${state.waiting > 1 ? `  ·  ${state.waiting} in line` : ''}`;
    ctx.font = '600 17px Jost';
    text(ctx, fit(ctx, line, right - PAD - labelWidth - 10), PAD + labelWidth + 10, 152, '600 17px Jost', COLOR.text);
  } else {
    text(ctx, 'Nobody in line: you could be next', PAD, 152, '500 17px Jost', COLOR.muted);
  }

  // Call to action: the site and a rotating tagline.
  const ctaY = cardHeight + 10;
  const ctaHeight = 86;
  panel(ctx, 0.5, ctaY, W, ctaHeight, 20, COLOR.accent);
  text(ctx, 'TAKE CONTROL', PAD, ctaY + 36, `800 28px "${DISPLAY}"`, COLOR.ink);
  if (site) {
    ctx.font = '800 22px Jost';
    text(ctx, fit(ctx, `▶ ${site}`, W - PAD * 2 - 170), right, ctaY + 35, '800 22px Jost', COLOR.ink, 'right');
  }
  const tagline = TAGLINES[Math.floor(now / ROTATE_MS) % TAGLINES.length] ?? '';
  text(ctx, tagline, PAD, ctaY + 66, '600 16px Jost', 'rgba(4, 47, 46, 0.75)');

  if (toast && now < toast.until) {
    const y = ctaY + ctaHeight + 10;
    ctx.font = '700 17px Jost';
    const value = fit(ctx, toast.text, W - 60);
    panel(ctx, 0.5, y, ctx.measureText(value).width + 48, 40, 20, COLOR.text);
    ctx.fillStyle = COLOR.ink;
    ctx.beginPath();
    ctx.arc(21, y + 20, 4.5, 0, Math.PI * 2);
    ctx.fill();
    text(ctx, value, 34, y + 26, '700 17px Jost', COLOR.ink);
  }
  return canvas.toBuffer('image/png');
}

/**
 * PNG of a full-frame slate: standby (with a countdown to `until`) or paused (no countdown).
 * Plain and neutral: a dark background, a big message and the site address.
 */
export function renderSlate(mode: Exclude<Mode, { kind: 'live' }>, site: string, title: string, now: number): Buffer {
  const W = SLATE_WIDTH;
  const H = SLATE_HEIGHT;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const sky = ctx.createLinearGradient(0, 0, W, H);
  sky.addColorStop(0, '#111a2e');
  sky.addColorStop(1, '#030712');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  const pad = 96;
  ctx.font = `800 72px "${DISPLAY}"`;
  text(ctx, fit(ctx, title.toUpperCase(), W / 2), pad, 150, `800 72px "${DISPLAY}"`, COLOR.text);

  const standby = mode.kind === 'standby';
  text(ctx, standby ? 'BE RIGHT BACK' : 'PAUSED FOR NOW', W / 2, 440, `800 200px "${DISPLAY}"`, COLOR.text, 'center');
  const subtitle = standby
    ? 'The console is taking a break. Turns start again as soon as it is back.'
    : 'Thanks to everyone who played. Check back later.';
  text(ctx, subtitle, W / 2, 520, '500 40px Jost', COLOR.muted, 'center');
  if (standby) {
    const left = mode.until - now;
    const cardW = 620;
    panel(ctx, (W - cardW) / 2, 570, cardW, 240, 32, COLOR.surface, COLOR.border);
    text(ctx, left > 0 ? 'STREAM PAUSES IN' : 'SEE YOU SOON', W / 2, 630, '700 30px Jost', COLOR.live, 'center');
    text(ctx, formatRemaining(left), W / 2, 780, `800 150px "${DISPLAY}"`, COLOR.accent, 'center');
  }
  if (site) {
    const ctaY = H - pad - 130;
    panel(ctx, pad, ctaY, W - pad * 2, 130, 36, COLOR.accent);
    text(ctx, 'PLAY FROM YOUR BROWSER', pad + 48, ctaY + 86, `800 64px "${DISPLAY}"`, COLOR.ink);
    ctx.font = '800 54px Jost';
    text(ctx, fit(ctx, `▶ ${site}`, W - pad * 2 - 900), W - pad - 48, ctaY + 84, '800 54px Jost', COLOR.ink, 'right');
  }
  return canvas.toBuffer('image/png');
}

async function fetchState(port: string): Promise<OverlayState | null> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/overlay.json`, { signal: AbortSignal.timeout(1000) });
    return response.ok ? ((await response.json()) as OverlayState) : null;
  } catch {
    return null;
  }
}

/** Write then rename, so ffmpeg never reads a half-written file. */
function write(output: string, png: Buffer): void {
  writeFileSync(`${output}.tmp`, png);
  renameSync(`${output}.tmp`, output);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main(): Promise<void> {
  const usage = 'Usage: bun scripts/kick-overlay.ts OUTPUT.png [--standby UNTIL_EPOCH_MS | --paused] [--once]';
  let args: Args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`${(error as Error).message}\n${usage}`);
    process.exit(2);
  }
  const { output, mode, once } = args;
  if (!output) {
    console.error(usage);
    process.exit(2);
  }
  const port = process.env.PORT || '3000';
  const site = shortUrl(process.env.PUBLIC_URL ?? '');
  const title = process.env.OVERLAY_TITLE || 'Viewers play';
  if (mode.kind !== 'live') {
    for (;;) {
      write(output, renderSlate(mode, site, title, Date.now()));
      if (once || mode.kind === 'paused') return;
      await sleep(1000 / SLATE_FRAMES_PER_SECOND);
    }
  }
  let previous: OverlayState | null = null;
  let state: OverlayState | null = null;
  let toasts: Toast[] = [];
  let lastFetch = 0;
  for (;;) {
    const now = Date.now();
    // The line changes rarely: ask twice a second, draw a few frames a second (pulse, timer).
    if (now - lastFetch >= 500) {
      lastFetch = now;
      state = await fetchState(port);
      if (state) {
        for (const event of overlayEvents(previous, state)) {
          // Announcements queue up so a burst of joins is shown one after another.
          const start = Math.max(now, toasts.at(-1)?.until ?? 0);
          toasts.push({ text: toastText(event), until: start + TOAST_MS });
        }
        previous = state;
      }
      toasts = toasts.filter((t) => t.until > now).slice(0, 5);
    }
    const toast = toasts.find((t) => t.until - TOAST_MS <= now && t.until > now) ?? null;
    write(output, renderOverlay(state, toast, site, title, now));
    if (once) return;
    await sleep(1000 / FRAMES_PER_SECOND);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
