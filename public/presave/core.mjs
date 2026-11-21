export const THEMES = ['midnight', 'paper', 'aurora', 'sunset'];
export const ACCENTS = ['#c6b8ff', '#a3e6c5', '#f7b4ce', '#8ab9ff', '#f3c36b', '#ffffff'];

export function escapeHtml(value = '') {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

export function safeUrl(value) {
  const text = String(value ?? '').trim();
  if (!text || /[\u0000-\u0020\u007f]/.test(text)) return '';
  try {
    const url = new URL(text);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
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
    theme: 'midnight', layout: 'centered', accent: '#c6b8ff', button_label: 'Pre-save on Spotify',
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
  if (campaign.release_at && Number.isNaN(Date.parse(campaign.release_at))) errors.release_at = 'Choose a valid release date.';
  if (campaign.artwork_url) {
    const artwork = safeUrl(campaign.artwork_url);
    if (!artwork || artwork.length > 2048) errors.artwork_url = 'Use an HTTPS image URL under 2,048 characters.';
    else campaign.artwork_url = artwork;
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
      if (!link.label || link.label.length > 50 || !safeUrl(link.url) || link.url.length > 2048) {
        errors.links = 'Each destination needs a label (up to 50 characters) and a valid HTTPS URL.';
      } else link.url = safeUrl(link.url);
    }
  }
  return { campaign, errors, valid: Object.keys(errors).length === 0 };
}
