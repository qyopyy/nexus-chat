// Shared, dependency-free validation and cryptography for the Edge Function.
// Imported by Node's test runner as well as the Supabase Deno runtime.
export class HttpError extends Error {
  constructor(status, message, code = 'invalid_request') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const MAX_ADVANCE_DAYS = 179;
export const THEMES = ['midnight', 'paper', 'aurora', 'sunset', 'galaxy', 'nebula', 'starlight', 'ocean', 'forest', 'rose', 'ember', 'arctic', 'lavender', 'monochrome', 'neon', 'champagne', 'custom'];
export const LAYOUTS = ['centered', 'split'];
export const DESIGN_DEFAULTS = Object.freeze({
  background_url: null, background_overlay: 55, background_motion: true,
  background_color: '#101019', text_color: '#f5f5fb', button_style: 'rounded', font_style: 'modern',
});
export const RESERVED_SLUGS = ['admin', 'api', 'app', 'auth', 'callback', 'config', 'dashboard', 'login', 'new', 'presave', 'settings'];
export const PUBLIC_FIELDS = ['slug', 'title', 'artist', 'description', 'release_at', 'artwork_url', 'theme', 'layout', 'accent', 'button_label', 'spotify_uri', 'links', 'show_countdown', ...Object.keys(DESIGN_DEFAULTS)];
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const enc = new TextEncoder();

export function uuid(value) {
  if (typeof value !== 'string' || !UUID.test(value)) throw new HttpError(400, 'Choose a valid campaign.');
  return value;
}

function text(value, label, max, required = false) {
  if (value == null && !required) return '';
  if (typeof value !== 'string') throw new HttpError(400, `${label} must be text.`);
  const clean = value.trim();
  if ((required && !clean) || clean.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(clean)) {
    throw new HttpError(400, `${label} must be ${required ? '1–' : 'at most '}${max} characters.`);
  }
  return clean;
}

export function slug(value) {
  const clean = text(value, 'Link name', 64, true).toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(clean) || clean.length < 3 || RESERVED_SLUGS.includes(clean)) {
    throw new HttpError(400, 'Use 3–64 lowercase letters or numbers, with single hyphens between words.');
  }
  return clean;
}

const DOMAIN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;
const RESERVED_DOMAIN = /(?:^|\.)(?:nexusproject\.cc|vercel\.app|vercel\.com|vercel-dns\.com|supabase\.co|supabase\.in|localhost)$/;
/** Normalize "https://www.Music.YourName.com/path" → "music.yourname.com" or throw a friendly 400. */
export function domainName(value) {
  let clean = text(value, 'Domain', 253, true).toLowerCase();
  clean = clean.replace(/^https?:\/\//, '').replace(/[/?#].*$/, '').replace(/^www\./, '').replace(/\.$/, '');
  if (clean.length > 253 || !DOMAIN.test(clean)) throw new HttpError(400, 'Enter a domain like music.yourname.com.');
  if (RESERVED_DOMAIN.test(clean)) throw new HttpError(400, 'That domain can’t be used.');
  return clean;
}

export function httpsUrl(value, label = 'URL') {
  if (value == null || value === '') return null;
  const input = text(value, label, 2048, true);
  let url;
  try { url = new URL(input); } catch { throw new HttpError(400, `${label} must be a valid HTTPS URL.`); }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || /[\s<>"\\]/.test(input)) {
    throw new HttpError(400, `${label} must be an HTTPS URL without embedded credentials.`);
  }
  // URL serialization can expand Unicode and percent-encode characters. Match
  // the stored URL bound, rather than validating only the pre-normalized text.
  if (url.href.length > 2048) throw new HttpError(400, `${label} must be at most 2048 characters.`);
  return url.href;
}

export function spotifyUri(value) {
  if (value == null || value === '') return null;
  const input = text(value, 'Spotify link', 2048, true);
  const uri = input.match(/^spotify:(track|album):([A-Za-z0-9]{22})$/);
  if (uri) return `spotify:${uri[1]}:${uri[2]}`;
  let url;
  try { url = new URL(input); } catch { /* fail below */ }
  const match = url?.pathname.match(/^\/(?:intl-[a-z-]+\/)?(track|album)\/([A-Za-z0-9]{22})\/?$/);
  if (url?.protocol === 'https:' && url.hostname === 'open.spotify.com' && !url.username && !url.password && !url.port && match) {
    return `spotify:${match[1]}:${match[2]}`;
  }
  throw new HttpError(400, 'Use a Spotify track or album URL, or its spotify: URI.');
}

function bool(value, fallback) {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') throw new HttpError(400, 'A toggle must be true or false.');
  return value;
}

function color(value, fallback, label) {
  const selected = value === undefined ? fallback : value;
  if (typeof selected !== 'string' || !/^#[0-9a-f]{6}$/i.test(selected)) {
    throw new HttpError(400, `${label} must be a six-digit hex color.`);
  }
  return selected.toLowerCase();
}

export function validateCampaign(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, 'Campaign details are required.');
  const theme = value.theme ?? 'midnight';
  const layout = value.layout ?? 'centered';
  const accent = value.accent ?? '#a78bfa';
  if (!THEMES.includes(theme) || !LAYOUTS.includes(layout) || typeof accent !== 'string' || !/^#[0-9a-f]{6}$/i.test(accent)) {
    throw new HttpError(400, 'Choose a supported theme, layout, and six-digit accent color.');
  }
  const overlay = value.background_overlay === undefined ? DESIGN_DEFAULTS.background_overlay : value.background_overlay;
  if (!Number.isInteger(overlay) || overlay < 0 || overlay > 90) {
    throw new HttpError(400, 'Background overlay must be a whole number from 0 to 90.');
  }
  const buttonStyle = value.button_style === undefined ? DESIGN_DEFAULTS.button_style : value.button_style;
  const fontStyle = value.font_style === undefined ? DESIGN_DEFAULTS.font_style : value.font_style;
  if (!['rounded', 'pill', 'square'].includes(buttonStyle) || !['modern', 'editorial', 'mono'].includes(fontStyle)) {
    throw new HttpError(400, 'Choose a supported button shape and font style.');
  }
  let release = null;
  if (value.release_at != null && value.release_at !== '') {
    const parts = typeof value.release_at === 'string' && value.release_at.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-](\d{2}):(\d{2}))$/);
    const year = Number(parts?.[1]), month = Number(parts?.[2]), day = Number(parts?.[3]);
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (!parts || year < 1000 || month < 1 || month > 12 || day < 1 || day > days[month - 1]
      || Number(parts[4]) > 23 || Number(parts[5]) > 59 || Number(parts[6] ?? 0) > 59
      || Number(parts[8] ?? 0) > 14 || Number(parts[9] ?? 0) > 59
      || (Number(parts[8] ?? 0) === 14 && Number(parts[9] ?? 0) !== 0)
      || !Number.isFinite(Date.parse(value.release_at))) {
      throw new HttpError(400, 'Release time must include a timezone.');
    }
    release = new Date(value.release_at).toISOString();
  }
  const links = value.links ?? [];
  if (!Array.isArray(links) || links.length > 12) throw new HttpError(400, 'Add up to 12 destinations to each page.');
  const result = {
    slug: slug(value.slug),
    title: text(value.title, 'Release title', 120, true),
    artist: text(value.artist, 'Artist name', 120, true),
    description: text(value.description, 'Description', 1200),
    release_at: release,
    artwork_url: httpsUrl(value.artwork_url, 'Artwork'),
    theme, layout, accent: accent.toLowerCase(),
    background_url: httpsUrl(value.background_url, 'Background image'),
    background_overlay: overlay,
    background_motion: bool(value.background_motion, DESIGN_DEFAULTS.background_motion),
    background_color: color(value.background_color, DESIGN_DEFAULTS.background_color, 'Background color'),
    text_color: color(value.text_color, DESIGN_DEFAULTS.text_color, 'Text color'),
    button_style: buttonStyle,
    font_style: fontStyle,
    button_label: text(value.button_label ?? 'Pre-save on Spotify', 'Button text', 40, true),
    spotify_uri: spotifyUri(value.spotify_uri),
    links: links.map((link) => {
      if (!link || typeof link !== 'object') throw new HttpError(400, 'Each destination needs a name and URL.');
      const url = httpsUrl(link.url, 'Destination');
      if (!url) throw new HttpError(400, 'Each destination needs an HTTPS URL.');
      return { label: text(link.label, 'Destination name', 60, true), url };
    }),
    show_countdown: bool(value.show_countdown, true),
    published: bool(value.published, false),
  };
  if (result.spotify_uri && !release) throw new HttpError(400, 'Choose a release time for Spotify pre-saves.');
  return result;
}

export function publicCampaign(campaign) {
  return Object.fromEntries(PUBLIC_FIELDS.map((key) => [key, campaign[key]]));
}

export function configuredPublicUrl(value) {
  const clean = httpsUrl(value, 'Public page address');
  if (!clean) throw new HttpError(503, 'The service owner needs to configure the public page address.', 'setup_required');
  const url = new URL(clean);
  if (url.search || url.hash) throw new HttpError(503, 'The configured public page address must not contain a query or fragment.', 'setup_required');
  return url;
}

export function safeReturnUrl(requested, configured, customHosts = []) {
  const base = configuredPublicUrl(configured);
  // A callback can only return to the one configured app entry — or the same entry path on this
  // campaign's own verified custom domain — never to a supplied external URL or another endpoint.
  if (requested != null) {
    let candidate;
    try { candidate = new URL(requested); } catch { throw new HttpError(400, 'Invalid return address.'); }
    const bare = candidate.username || candidate.password || candidate.search || candidate.hash;
    const mine = candidate.origin === base.origin;
    const custom = candidate.protocol === 'https:' && !candidate.port && customHosts.includes(candidate.hostname.toLowerCase().replace(/^www\./, ''));
    if ((!mine && !custom) || candidate.pathname !== base.pathname || bare) {
      throw new HttpError(400, 'Return address must match this service’s public page.');
    }
    if (custom && !mine) return candidate.href;
  }
  return base.href;
}

export function callbackReturn(base, campaignSlug, status, cancellationToken = null) {
  const url = configuredPublicUrl(base);
  url.searchParams.set('slug', slug(campaignSlug));
  url.searchParams.set('presave', status);
  // Keep the cancellation capability out of HTTP logs and referrers.
  if (cancellationToken) url.hash = new URLSearchParams({ cancel: cancellationToken }).toString();
  return url.href;
}

export function bytesToBase64(bytes) { return btoa(String.fromCharCode(...bytes)); }
export function base64ToBytes(value) { return Uint8Array.from(atob(value), (c) => c.charCodeAt(0)); }
export function base64url(bytes) { return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
export function randomToken() { return base64url(crypto.getRandomValues(new Uint8Array(32))); }
export async function sha256(value) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(value))), (b) => b.toString(16).padStart(2, '0')).join('');
}
export async function pkceChallenge(verifier) { return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(verifier)))); }
export async function tokenKey(secret) {
  let bytes;
  try { bytes = base64ToBytes(secret ?? ''); } catch { /* fail below */ }
  if (bytes?.length !== 32) throw new HttpError(503, 'Spotify pre-saves need a valid server encryption key.', 'setup_required');
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
export async function encrypt(value, secret, purpose) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(purpose) }, await tokenKey(secret), enc.encode(value));
  return `v1.${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(ciphertext))}`;
}
export async function decrypt(value, secret, purpose) {
  const parts = String(value).split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') throw new Error('Unsupported encrypted token');
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(parts[1]), additionalData: enc.encode(purpose) }, await tokenKey(secret), base64ToBytes(parts[2]));
  return new TextDecoder().decode(plain);
}

export function retryPlan(status, attempt, retryAfter, now = Date.now()) {
  const temporary = status === 0 || status === 404 || status === 408 || status === 429 || status >= 500;
  if (!temporary || attempt >= 15) return { status: 'failed', next_attempt_at: null };
  const seconds = status === 429 && /^\d+$/.test(String(retryAfter ?? ''))
    ? Math.min(86400, Math.max(60, Number(retryAfter)))
    : Math.min(21600, 60 * (2 ** Math.min(attempt, 9)));
  return { status: 'pending', next_attempt_at: new Date(now + seconds * 1000).toISOString() };
}

export function readCookie(header, name) {
  const entry = (header ?? '').split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return entry ? entry.slice(name.length + 1) : null;
}

export function oauthCookie(state, value, maxAge = 900) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(state) || !/^[A-Za-z0-9_-]*$/.test(value)) throw new Error('Invalid cookie value');
  return `np_oauth_${state.slice(0, 12)}=${value}; Path=/functions/v1/presave; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
