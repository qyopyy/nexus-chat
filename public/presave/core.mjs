export const THEME_DETAILS = [
  { id: 'midnight', name: 'Midnight', note: 'Velvet purples after dark', accent: '#c6b8ff', title: 'Midnight echoes' },
  { id: 'paper', name: 'Paper', note: 'A quiet, editorial canvas', accent: '#3b4d39', title: 'In full bloom' },
  { id: 'aurora', name: 'Aurora', note: 'Northern greens and blues', accent: '#a3e6c5', title: 'Out of the blue' },
  { id: 'sunset', name: 'Sunset', note: 'Warm light, lasting feeling', accent: '#f3c36b', title: 'Soft landing' },
  { id: 'galaxy', name: 'Galaxy', note: 'Drifting stars, infinite depth', accent: '#c6b8ff', title: 'A world away', animated: true },
  { id: 'nebula', name: 'Nebula', note: 'Cosmic pinks in motion', accent: '#f7b4e1', title: 'Other dimensions', animated: true },
  { id: 'starlight', name: 'Starlight', note: 'A silver sky full of stars', accent: '#d8eaff', title: 'Signals from home', animated: true },
  { id: 'ocean', name: 'Ocean', note: 'Deep blues and sea glass', accent: '#82e3ef', title: 'Below the surface' },
  { id: 'forest', name: 'Forest', note: 'Grounded, lush and organic', accent: '#b9d89c', title: 'Slow growth' },
  { id: 'rose', name: 'Rose', note: 'Soft blush, modern romance', accent: '#b93d69', title: 'Letters to you' },
  { id: 'ember', name: 'Ember', note: 'A vivid glow in the dark', accent: '#ffb185', title: 'Still burning' },
  { id: 'arctic', name: 'Arctic', note: 'Crisp air and icy light', accent: '#1e6986', title: 'Clear skies' },
  { id: 'lavender', name: 'Lavender', note: 'Dreamlike lilac and cream', accent: '#6543a0', title: 'Daydream season' },
  { id: 'monochrome', name: 'Monochrome', note: 'Pure contrast, no distractions', accent: '#ffffff', title: 'Less is more' },
  { id: 'neon', name: 'Neon', note: 'Electric green, midnight streets', accent: '#c2ff58', title: 'Night drive' },
  { id: 'champagne', name: 'Champagne', note: 'Gold details, understated warmth', accent: '#735326', title: 'The golden days' },
  { id: 'custom', name: 'Custom', note: 'Your colors. Your signature.', accent: '#c6b8ff', title: 'Made by you' },
];
export const THEMES = THEME_DETAILS.map((theme) => theme.id);
export const ACCENTS = ['#c6b8ff', '#a3e6c5', '#f7b4ce', '#8ab9ff', '#f3c36b', '#ffffff'];
export const APPEARANCE_DEFAULTS = {
  theme: 'midnight', layout: 'centered', accent: '#c6b8ff', background_url: null,
  background_overlay: 55, background_motion: true, background_color: '#101019',
  text_color: '#f5f5fb', button_style: 'rounded', font_style: 'modern',
};

// Rendering accepts only allowlisted tokens and typed values. Image URLs are
// rendered through img.src, never interpolated into CSS declarations.
export function appearance(input = {}) {
  const color = (value, fallback) => /^#[\da-f]{6}$/i.test(value ?? '') ? value : fallback;
  return {
    theme: THEMES.includes(input.theme) ? input.theme : 'midnight',
    layout: input.layout === 'split' ? 'split' : 'centered',
    accent: color(input.accent, APPEARANCE_DEFAULTS.accent),
    background_color: color(input.background_color, APPEARANCE_DEFAULTS.background_color),
    text_color: color(input.text_color, APPEARANCE_DEFAULTS.text_color),
    background_url: safeUrl(input.background_url),
    background_overlay: Number.isInteger(input.background_overlay) && input.background_overlay >= 0 && input.background_overlay <= 90 ? input.background_overlay : 55,
    background_motion: typeof input.background_motion === 'boolean' ? input.background_motion : true,
    button_style: ['rounded', 'pill', 'square'].includes(input.button_style) ? input.button_style : 'rounded',
    font_style: ['modern', 'editorial', 'mono'].includes(input.font_style) ? input.font_style : 'modern',
  };
}

export function contrastRatio(foreground, background) {
  const luminance = (hex) => {
    if (!/^#[\da-f]{6}$/i.test(hex ?? '')) return null;
    const rgb = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255)
      .map((value) => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
    return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
  };
  const first = luminance(foreground), second = luminance(background);
  return first === null || second === null ? 0 : (Math.max(first, second) + .05) / (Math.min(first, second) + .05);
}

export function escapeHtml(value = '') {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

export function safeUrl(value) {
  const text = String(value ?? '').trim();
  if (!text || /[\u0000-\u0020\u007f<>"\\]/.test(text)) return '';
  try {
    const url = new URL(text);
    return url.protocol === 'https:' && !url.username && !url.password && url.href.length <= 2048 ? url.href : '';
  } catch { return ''; }
}

export function spotifyUri(value) {
  const text = String(value ?? '').trim();
  const uri = text.match(/^spotify:(track|album):([a-zA-Z0-9]{22})$/);
  if (uri) return text;
  try {
    const url = new URL(text);
    if (url.protocol !== 'https:' || url.hostname !== 'open.spotify.com' || url.username || url.password || url.port) return '';
    const match = url.pathname.match(/^\/(?:intl-[a-z-]+\/)?(track|album)\/([a-zA-Z0-9]{22})\/?$/);
    return match ? `spotify:${match[1]}:${match[2]}` : '';
  } catch { return ''; }
}

export function slugify(value) {
  return String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64).replace(/-+$/, '');
}

export function accentInk(hex) {
  const color = /^#[a-f\d]{6}$/i.test(hex ?? '') ? hex : '#c6b8ff';
  const rgb = [1, 3, 5].map((offset) => parseInt(color.slice(offset, offset + 2), 16) / 255)
    .map((channel) => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4);
  const luminance = .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
  const darkLuminance = .005793;
  return (luminance + .05) / (darkLuminance + .05) >= 1.05 / (luminance + .05) ? '#111117' : '#ffffff';
}

export function localDateInput(iso) {
  if (!iso || Number.isNaN(new Date(iso).getTime())) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function releaseDate(iso, compact = false) {
  if (!iso || Number.isNaN(new Date(iso).getTime())) return 'Release date to be announced';
  return new Intl.DateTimeFormat(undefined, compact
    ? { month: 'short', day: 'numeric', year: 'numeric' }
    : { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }
  ).format(new Date(iso));
}

export function campaignUrl(slug, base) {
  const url = new URL(base);
  url.search = '';
  url.hash = '';
  url.searchParams.set('slug', slug);
  return url.href;
}

export function countdownParts(iso, now = Date.now()) {
  const seconds = Math.max(0, Math.floor((new Date(iso).getTime() - now) / 1000)) || 0;
  return [Math.floor(seconds / 86400), Math.floor(seconds % 86400 / 3600), Math.floor(seconds % 3600 / 60), seconds % 60];
}

export function newCampaign(overrides = {}) {
  return {
    title: '', artist: '', slug: '', description: '', release_at: null, artwork_url: null,
    ...APPEARANCE_DEFAULTS, button_label: 'Pre-save on Spotify',
    spotify_uri: null, links: [], show_countdown: true, published: false, ...overrides,
  };
}

export function validateCampaign(input) {
  const errors = {};
  const campaign = newCampaign(input);
  for (const [key, max] of [['title', 120], ['artist', 120], ['description', 1200], ['button_label', 40]]) {
    campaign[key] = String(campaign[key] ?? '').trim();
    if (campaign[key].length > max) errors[key] = `Use ${max} characters or fewer.`;
  }
  if (!campaign.title) errors.title = 'Add a release title.';
  if (!campaign.artist) errors.artist = 'Add an artist or creator name.';
  if (!campaign.button_label) errors.button_label = 'Add button text.';
  if (!/^[a-z0-9](?:[a-z0-9-]{1,62})[a-z0-9]$/.test(campaign.slug) || campaign.slug.includes('--')) errors.slug = 'Use 3–64 lowercase letters, numbers and single hyphens.';
  if (!THEMES.includes(campaign.theme)) errors.theme = 'Choose a page theme.';
  if (!['centered', 'split'].includes(campaign.layout)) errors.layout = 'Choose a page layout.';
  if (!/^#[\da-f]{6}$/i.test(campaign.accent)) errors.accent = 'Choose a valid color.';
  for (const name of ['background_color', 'text_color']) {
    if (!/^#[\da-f]{6}$/i.test(campaign[name])) errors[name] = 'Choose a valid six-digit color.';
  }
  if (!Number.isInteger(campaign.background_overlay) || campaign.background_overlay < 0 || campaign.background_overlay > 90) errors.background_overlay = 'Choose an image shade from 0 to 90%.';
  if (typeof campaign.background_motion !== 'boolean') errors.background_motion = 'Choose whether to animate the background.';
  if (!['rounded', 'pill', 'square'].includes(campaign.button_style)) errors.button_style = 'Choose a button shape.';
  if (!['modern', 'editorial', 'mono'].includes(campaign.font_style)) errors.font_style = 'Choose a typography style.';
  if (campaign.release_at && Number.isNaN(Date.parse(campaign.release_at))) errors.release_at = 'Choose a valid release date.';
  if (campaign.artwork_url) {
    const artwork = safeUrl(campaign.artwork_url);
    if (!artwork || artwork.length > 2048) errors.artwork_url = 'Use an HTTPS image URL under 2,048 characters.';
    else campaign.artwork_url = artwork;
  }
  if (campaign.background_url) {
    const background = safeUrl(campaign.background_url);
    if (!background || background.length > 2048) errors.background_url = 'Use an HTTPS image URL under 2,048 characters.';
    else campaign.background_url = background;
  }
  if (campaign.spotify_uri) {
    const uri = spotifyUri(campaign.spotify_uri);
    if (!uri) errors.spotify_uri = 'Paste a Spotify track or album URL, or its Spotify URI.';
    else campaign.spotify_uri = uri;
    if (!campaign.release_at) errors.release_at = 'A release date is needed for Spotify pre-saves.';
  }
  if (!Array.isArray(campaign.links) || campaign.links.length > 12 || campaign.links.some((link) => !link || typeof link !== 'object' || Array.isArray(link))) {
    errors.links = 'Use up to 12 valid destination links.';
  } else {
    campaign.links = campaign.links.map((link) => ({ label: String(link.label ?? '').trim(), url: String(link.url ?? '').trim() }))
      .filter((link) => link.label || link.url);
    for (const link of campaign.links) {
      if (!link.label || link.label.length > 60 || !safeUrl(link.url) || link.url.length > 2048) {
        errors.links = 'Each destination needs a label (up to 60 characters) and a valid HTTPS URL.';
      } else link.url = safeUrl(link.url);
    }
  }
  return { campaign, errors, valid: Object.keys(errors).length === 0 };
}
