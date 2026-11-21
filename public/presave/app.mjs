import { escapeHtml as esc, safeUrl, spotifyUri, slugify, accentInk, localDateInput, releaseDate, campaignUrl, countdownParts, newCampaign, validateCampaign, THEMES, ACCENTS } from './core.mjs';
import { api, client, configured, needsMfa, uploadArtwork } from './auth.mjs';

const root = document.querySelector('#app');
const localBase = new URL(location.pathname, location.origin).href;
const publicSlug = new URLSearchParams(location.search).get('slug');
const state = {
  user: null, view: 'campaigns', campaigns: [], summary: {}, total: 0, page: 1, pageSize: 12,
  search: '', filter: 'all', loading: false, listError: '', service: null, draft: null,
  dirty: false, saving: false, slugEdited: false, request: 0, booting: true,
};
const ICONS = {
  link: '<path d="M10 13a5 5 0 0 0 7 .1l3-3a5 5 0 0 0-7-7l-2 2"/><path d="M14 11a5 5 0 0 0-7-.1l-3 3a5 5 0 0 0 7 7l2-2"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  brush: '<path d="m14 6 4-4 4 4-10 10-4-4 6-6Z"/><path d="M8 12c-5-1-2 6-6 7 6 3 9-1 8-5"/>',
  book: '<path d="M12 5v16M3 3c4 0 7 1 9 3 2-2 5-3 9-3v15c-4 0-7 1-9 3-2-2-5-3-9-3Z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="10.5" cy="10.5" r="7.5"/><path d="m16 16 5 5"/>',
  copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  music: '<path d="M9 18V5l12-2v13M9 9l12-2"/><ellipse cx="6" cy="18" rx="3" ry="3"/><ellipse cx="18" cy="16" rx="3" ry="3"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  globe: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
  edit: '<path d="m16 3 5 5-12 12-6 1 1-6L16 3ZM13 6l5 5"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
  upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5"/>',
  logOut: '<path d="M9 21H3V3h6M9 12h12m-4-4 4 4-4 4"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  external: '<path d="M14 3h7v7M21 3l-9 9M10 3H3v18h18v-7"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
  spotify: '<circle cx="12" cy="12" r="10" fill="currentColor" stroke="none"/><path d="M6 9c4-1.6 8-1.2 12 1M7 12c3.4-1 6.8-.7 10 1M8 15c2.6-.7 5-.4 8 1" stroke="var(--campaign-ink,#111117)" stroke-width="1.7"/>',
};
const icon = (name) => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.link}</svg>`;
const number = (value) => new Intl.NumberFormat().format(Number(value) || 0);
const baseUrl = () => state.service?.public_url || localBase;
const shareUrl = (slug) => campaignUrl(slug, baseUrl());
const isReleased = (c) => c.release_at && Date.parse(c.release_at) <= Date.now();
const userName = () => state.user?.user_metadata?.display_name || state.user?.user_metadata?.username || state.user?.email?.split('@')[0] || 'Your workspace';
const button = (label, action, kind = 'secondary', attrs = '') => `<button type="button" class="button button-${kind}" data-action="${action}" ${attrs}>${label}</button>`;

function toast(message) {
  const el = document.querySelector('#toast');
  el.textContent = message;
  el.classList.add('toast-visible');
  clearTimeout(toast.timeout);
  toast.timeout = setTimeout(() => el.classList.remove('toast-visible'), 4200);
}

function shell() {
  const viewName = state.view === 'editor' ? 'Campaign editor' : state.view === 'templates' ? 'Page templates' : state.view === 'guide' ? 'How it works' : 'Your campaigns';
  root.innerHTML = `<div class="shell">
    <aside class="sidebar" aria-label="Pre-save navigation">
      <a class="brand" href="${esc(localBase)}" aria-label="Nexus Pre-save home"><span class="brand-mark">${icon('link')}</span><span><span class="brand-word">nexus<span class="brand-caption">PRE-SAVE</span></span></span></a>
      <nav class="nav-section" aria-label="Workspace">
        <span class="nav-section-label">WORKSPACE</span>
        <button class="nav-item" data-action="navigate" data-view="campaigns" ${state.view === 'campaigns' || state.view === 'editor' ? 'aria-current="page"' : ''}><span class="nav-icon">${icon('grid')}</span>Your campaigns</button>
        <button class="nav-item" data-action="navigate" data-view="templates" ${state.view === 'templates' ? 'aria-current="page"' : ''}><span class="nav-icon">${icon('brush')}</span>Templates</button>
        <button class="nav-item" data-action="navigate" data-view="guide" ${state.view === 'guide' ? 'aria-current="page"' : ''}><span class="nav-icon">${icon('book')}</span>How it works</button>
      </nav>
      <div class="sidebar-bottom">
        <div class="plan-card"><span class="infinity" aria-hidden="true">∞</span><strong>More music. No limits.</strong><p>Create as many links as you need. Every release gets its moment.</p><span class="plan-tag">UNLIMITED CAMPAIGNS</span></div>
        <div class="account"><span class="avatar">${esc(state.user ? userName().slice(0, 2).toUpperCase() : 'NX')}</span><div><div class="account-name">${esc(state.user ? userName() : 'Made for creators')}</div><div class="account-detail">${state.user ? 'Nexus account' : 'by qyopyy'}</div></div>${state.user ? `<button class="icon-button" data-action="signout" aria-label="Sign out" title="Sign out">${icon('logOut')}</button>` : ''}</div>
      </div>
    </aside>
    <div class="workspace">
      <header class="topbar"><div class="breadcrumb">Workspace <span>/</span> <strong>${viewName}</strong></div><div class="topbar-actions"><a href="https://github.com/qyopyy/nexus-chat" target="_blank" rel="noopener noreferrer" class="source-link">Nexus by qyopyy</a>${state.user ? '<span class="account-detail">Creator workspace</span>' : button('Sign in', 'signin', 'secondary')}</div></header>
      <main class="main" id="main" tabindex="-1"></main>
    </div>
  </div>`;
}

function render() {
  shell();
  const main = document.querySelector('#main');
  if (state.view === 'editor') main.innerHTML = editorHtml();
  else if (state.view === 'templates') main.innerHTML = templatesHtml();
  else if (state.view === 'guide') main.innerHTML = guideHtml();
  else {
    main.innerHTML = dashboardHtml();
    updateResults();
  }
  if (state.view === 'editor') updatePreview();
}

function dashboardHtml() {
  return `<div class="page-heading"><div><p class="eyebrow">YOUR RELEASE. YOUR WORLD.</p><h1>Your campaigns</h1><p class="page-subtitle">A little anticipation goes a long way.</p></div>${button(icon('plus') + ' Create a link', 'create', 'primary')}</div>
    <section class="hero"><div class="hero-copy"><span class="hero-tag">${icon('music')} BUILT FOR YOUR NEXT BIG THING</span><h2>Make the wait<br>worth something.</h2><p>Turn your next release into a moment. Create a page that feels like you, and let your fans get there first.</p>${button('Create your pre-save link', 'create', 'primary')}<span class="hero-note">Your music. Your look. Unlimited links.</span></div>
    <div class="hero-art" aria-hidden="true"><div class="vinyl"></div><div class="cover-art"><span class="cover-topline">NEXUS / SOUND & FEELING</span><strong>BEFORE<br>THE DROP.</strong><small>GOOD THINGS ARE COMING</small></div><div class="hero-art-caption">${icon('check')} A head start for every release</div></div></section>
    <section class="metrics" aria-label="Your campaign statistics">${[['campaigns','Campaigns','link'],['published','Published','globe'],['pre_saves','Spotify pre-saves','music'],['views','Page views','eye']].map(([key,label,glyph]) => `<div class="metric"><span class="metric-icon">${icon(glyph)}</span><div class="metric-value" id="metric-${key}">${state.user ? number(state.summary[key]) : '—'}</div><div class="metric-label">${label}</div></div>`).join('')}</section>
    <div class="section-heading"><div><h2>Your links <span id="campaign-count" class="count-badge">${state.user ? number(state.total) : '0'}</span></h2><p>Small links. Big beginnings.</p></div><span class="account-detail">No campaign limit</span></div>
    <div class="toolbar"><div class="filters" aria-label="Filter campaigns">${[['all','All links'],['published','Published'],['draft','Drafts']].map(([id,label]) => `<button class="filter" data-action="filter" data-filter="${id}" aria-pressed="${state.filter === id}">${label}</button>`).join('')}</div><label class="search-wrap">${icon('search')}<input class="search-input" type="search" id="search-campaigns" aria-label="Search campaigns" placeholder="Search your links..." value="${esc(state.search)}" maxlength="100"></label></div>
    <div id="campaign-results" aria-live="polite"></div>`;
}

function artwork(c, className = 'campaign-art', decorative = false) {
  const url = safeUrl(c.artwork_url);
  const theme = THEMES.includes(c.theme) ? c.theme : 'midnight';
  return `<div class="${className}" data-theme="${theme}">${url ? `<img src="${esc(url)}" alt="${decorative ? '' : esc(c.title + ' cover artwork')}" loading="lazy" referrerpolicy="no-referrer">` : `<div class="release-placeholder" aria-hidden="true"><span class="art-orbit"></span><span class="art-word">${esc(c.title || 'YOUR NEXT RELEASE')}</span><span class="art-credit">${esc(c.artist || 'NEXUS PRE-SAVE')}</span></div>`}</div>`;
}

function campaignCard(c) {
  const live = Boolean(c.published);
  return `<article class="campaign-card">
    <button class="campaign-art-button" data-action="edit" data-id="${esc(c.id)}" aria-label="Edit ${esc(c.title)}">${artwork(c, 'campaign-art', true)}<span class="badge ${live ? 'badge-live' : 'badge-draft'}">${live ? isReleased(c) ? 'Released' : 'Published' : 'Draft'}</span></button>
    <div class="card-content"><div class="card-title"><h3>${esc(c.title)}</h3><button class="icon-button" data-action="edit" data-id="${esc(c.id)}" aria-label="Edit ${esc(c.title)}">${icon('edit')}</button></div><p class="card-artist">${esc(c.artist)}</p><p class="card-date">${icon('calendar')} ${esc(releaseDate(c.release_at, true))}</p>
    <div class="card-stats"><span><strong>${number(c.stats?.pre_saves)}</strong> pre-saves</span><span><strong>${number(c.stats?.views)}</strong> views</span><span><strong>${number(c.stats?.saved)}</strong> saved</span></div>
    <div class="card-footer"><div class="card-actions">${live ? `<button class="button button-small button-secondary" data-action="copy" data-id="${esc(c.id)}">${icon('copy')} Copy link</button>` : `<button class="button button-small button-secondary" data-action="edit" data-id="${esc(c.id)}">${icon('edit')} Edit draft</button>`}
    <button class="icon-button" data-action="duplicate" data-id="${esc(c.id)}" aria-label="Duplicate ${esc(c.title)}" title="Duplicate">${icon('copy')}</button><button class="icon-button" data-action="delete" data-id="${esc(c.id)}" aria-label="Delete ${esc(c.title)}" title="Delete">${icon('trash')}</button></div>${live ? `<a class="icon-button" href="${esc(shareUrl(c.slug))}" target="_blank" rel="noopener noreferrer" aria-label="Open ${esc(c.title)} public page">${icon('external')}</a>` : ''}</div></div></article>`;
}

function updateResults() {
  const results = document.querySelector('#campaign-results');
  if (!results) return;
  for (const key of ['campaigns','published','pre_saves','views']) {
    const el = document.querySelector('#metric-' + key);
    if (el) el.textContent = state.user ? number(state.summary[key]) : '—';
  }
  document.querySelector('#campaign-count').textContent = state.user ? number(state.total) : '0';
  if (state.loading) {
    results.innerHTML = '<div class="loading-view"><span class="spinner"></span><p>Loading your campaigns…</p></div>';
  } else if (state.listError) {
    results.innerHTML = `<div class="error-panel" role="alert">${icon('info')}<div><h3>We couldn’t load your campaigns</h3><p>${esc(state.listError)}</p>${button('Try again', 'refresh', 'secondary')} ${button('Open the editor', 'create', 'ghost')}</div></div>`;
  } else if (!state.campaigns.length) {
    const filtered = state.user && (state.search || state.filter !== 'all');
    results.innerHTML = `<div class="empty-state"><div class="empty-illustration">${icon(filtered ? 'search' : 'link')}</div><h3>${filtered ? 'No links match this view' : 'Every release starts with a link.'}</h3><p>${filtered ? 'Try another search or show all your campaigns.' : state.user ? 'Create your first campaign, make it yours, and share it with the world.' : 'Sign in with your Nexus account to publish and manage your links. You can explore the editor right now.'}</p>${button(filtered ? 'Show all links' : icon('plus') + ' Create your first link', filtered ? 'clear-filters' : 'create', 'primary')}</div>`;
  } else {
    const pages = Math.ceil(state.total / state.pageSize);
    results.innerHTML = `<div class="campaign-grid">${state.campaigns.map(campaignCard).join('')}</div>${pages > 1 ? `<div class="pagination">${button('Previous', 'previous', 'secondary', state.page <= 1 ? 'disabled' : '')}<span>Page ${state.page} of ${pages}</span>${button('Next', 'next', 'secondary', state.page >= pages ? 'disabled' : '')}</div>` : ''}`;
  }
}

async function loadCampaigns() {
  const request = ++state.request;
  if (!state.user) { state.campaigns = []; state.total = 0; state.summary = {}; state.loading = false; state.listError = ''; updateResults(); return; }
  state.loading = true; state.listError = ''; updateResults();
  try {
    const result = await api('list', { page: state.page, page_size: state.pageSize, search: state.search, status: state.filter }, true);
    if (request !== state.request) return;
    state.campaigns = result.campaigns || []; state.total = result.total || 0; state.summary = result.summary || {};
  } catch (error) {
    if (request !== state.request) return;
    state.listError = error.message;
  } finally {
    if (request === state.request) { state.loading = false; updateResults(); }
  }
}

const TEMPLATES = [
  { name: 'After hours', note: 'Deep tones. A little mystery.', theme: 'midnight', accent: '#c6b8ff', title: 'Midnight echoes', artist: 'Your artist name', layout: 'centered' },
  { name: 'A fresh start', note: 'Clean, quiet, all about the cover.', theme: 'paper', accent: '#3b4d39', title: 'In full bloom', artist: 'Your artist name', layout: 'centered' },
  { name: 'Northern lights', note: 'Color that moves with your music.', theme: 'aurora', accent: '#a3e6c5', title: 'Out of the blue', artist: 'Your artist name', layout: 'split' },
  { name: 'Golden hour', note: 'Warm colors for lasting impressions.', theme: 'sunset', accent: '#f3c36b', title: 'Soft landing', artist: 'Your artist name', layout: 'centered' },
];

function templatesHtml() {
  return `<div class="page-heading"><div><p class="eyebrow">A STARTING POINT, NOT A LIMIT.</p><h1>Make it feel like you.</h1><p class="page-subtitle">Pick a look. Change everything. Every template is yours to customize.</p></div></div><div class="template-grid">${TEMPLATES.map((t, i) => `<article class="template-card"><div class="template-preview" data-theme="${t.theme}" style="--campaign-accent:${t.accent};--campaign-ink:${accentInk(t.accent)}">${artwork(t, 'template-artwork', true)}<h3>${t.title}</h3><p>${t.artist}</p><span class="template-button">Pre-save on Spotify</span></div><div class="card-content"><h2>${t.name}</h2><p>${t.note}</p>${button('Use this template', 'template', 'secondary', `data-template="${i}"`)}</div></article>`).join('')}</div><p class="field-help">Template titles and artwork are preview examples. They aren’t published campaigns.</p>`;
}

function guideHtml() {
  return `<div class="page-heading"><div><p class="eyebrow">A GOOD RELEASE DESERVES A HEAD START.</p><h1>A link. A look. A launch.</h1><p class="page-subtitle">Your pre-save page brings your next release and your fans together.</p></div>${button('Create a link', 'create', 'primary')}</div><div class="guide-grid">
    <section class="guide-card">${icon('link')}<h2>Create your campaign</h2><p>Sign in with your Nexus account. Add your release title, artist, release time, and a unique link name. Create as many campaigns as you like.</p></section>
    <section class="guide-card">${icon('brush')}<h2>Give it your identity</h2><p>Upload cover artwork, choose a theme and layout, set an accent color, and write your own button text. See your changes in the live preview.</p></section>
    <section class="guide-card">${icon('music')}<h2>Connect the release</h2><p>Add the exact Spotify track or album URL from your distributor. Fans authorize Nexus through Spotify. Once your release is due, the service can add it to their library.</p></section>
    <section class="guide-card">${icon('globe')}<h2>Publish and share</h2><p>Publish your campaign, copy its link, and share it in Nexus, your bio, or wherever your fans are. Keep unfinished pages as private drafts.</p></section>
    </div><section class="form-section"><h2>A few things to know</h2><div class="guide-grid"><div><h3>Spotify pre-saves</h3><p>Spotify must be connected by the Nexus service owner. A fan authorizes one specific track or album. Spotify access and service availability can affect fulfillment. Campaigns can be created at any time; fan authorization opens within 179 days of release.</p></div><div><h3>Other music services</h3><p>Apple Music, YouTube, Bandcamp, and other destinations can be added as ordinary links. Opening one of these links does not automatically save music to a fan’s library.</p></div><div><h3>Your pages and your fans</h3><p>Only you can edit your campaigns. Publishing makes the page visible to anyone with its link. Unpublishing hides it and pauses pending saves. Deleting a campaign cancels its pending saves.</p></div><div><h3>Campaign analytics</h3><p>Views and destination clicks measure activity. Spotify pre-saves count authorizations, and saved counts completed library saves. Views are not unique visitors.</p></div></div></section>`;
}

function inputField(label, name, value, options = {}) {
  const { type = 'text', placeholder = '', max = 120, help = '', required = false, disabled = false } = options;
  return `<label class="field"><span class="field-label">${label}${required ? ' <span aria-hidden="true">*</span>' : ''}</span><input class="input" name="${name}" type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}" maxlength="${max}" ${required ? 'required' : ''} ${disabled ? 'disabled' : ''} aria-describedby="help-${name} error-${name}"><span id="help-${name}" class="field-help">${help}</span><span id="error-${name}" class="field-error"></span></label>`;
}

function editorHtml() {
  const c = state.draft;
  return `<div class="editor-heading"><div><button class="button button-ghost button-small" data-action="navigate" data-view="campaigns">All campaigns</button><h1>${c.id ? 'Make it yours.' : 'Start something good.'}</h1><p class="page-subtitle">${c.id ? 'Your next chapter, down to the details.' : 'Build a home for your next release.'}</p></div><div class="editor-heading-actions"><span class="badge ${c.published ? 'badge-live' : 'badge-draft'}">${c.published ? 'Published' : 'Draft'}</span>${c.published ? button(icon('copy') + ' Copy link', 'copy-draft', 'secondary') : ''}${button('Save changes', 'save-draft', 'primary', 'id="save-top"')}</div></div>
  <div class="editor-grid"><form id="campaign-form" class="editor-form" novalidate>
    <section class="form-section"><div class="section-title"><span class="section-icon">${icon('music')}</span><div><h2>The release</h2><p>The details your fans will see.</p></div></div>
      ${inputField('Release title', 'title', c.title, { placeholder: 'What’s your next release called?', required: true })}
      ${inputField('Artist or creator', 'artist', c.artist, { placeholder: 'Your artist name', required: true })}
      <label class="field"><span class="field-label">Description</span><textarea class="textarea" name="description" rows="3" maxlength="1200" placeholder="Give your fans a little of the story…" aria-describedby="error-description">${esc(c.description)}</textarea><span class="field-error" id="error-description"></span></label>
      ${inputField('Release date & time', 'release_at', localDateInput(c.release_at), { type: 'datetime-local', help: 'In your time zone: ' + Intl.DateTimeFormat().resolvedOptions().timeZone + '. Required for Spotify pre-saves. Date changes apply to new authorizations.' })}
      ${inputField('Your link name', 'slug', c.slug, { placeholder: 'artist-release-name', max: 64, required: true, help: '3–64 lowercase letters, numbers, and single hyphens. Changing it changes your public URL.' })}
      <div class="link-preview"><span>${icon('link')}</span><span id="slug-preview">${esc(c.slug ? shareUrl(c.slug) : 'Your shareable link will appear here')}</span></div>
    </section>
    <section class="form-section"><div class="section-title"><span class="section-icon">${icon('brush')}</span><div><h2>The look</h2><p>Same music. Entirely your world.</p></div></div>
      <div class="artwork-upload"><div id="artwork-thumb">${artwork(c, 'upload-thumb', true)}</div><div><strong>Cover artwork</strong><p class="field-help">Square JPG, PNG, or WebP · up to 5 MB</p><label class="button button-secondary button-small">${icon('upload')} Upload artwork<input type="file" id="artwork-file" accept="image/jpeg,image/png,image/webp" class="sr-only"></label><span class="field-help" id="upload-status" role="status"></span></div></div>
      ${inputField('Or use an image URL', 'artwork_url', c.artwork_url, { type: 'url', placeholder: 'https://…/your-cover.jpg', max: 2048, help: 'Use an image you own or have permission to use.' })}
      <fieldset class="field"><legend class="field-label">Page theme</legend><div class="theme-grid">${THEMES.map((theme) => `<label class="theme-option" data-theme="${theme}"><input type="radio" name="theme" value="${theme}" ${c.theme === theme ? 'checked' : ''}><span class="theme-sample"></span><strong>${theme[0].toUpperCase() + theme.slice(1)}</strong></label>`).join('')}</div></fieldset>
      <div class="field-row"><label class="field"><span class="field-label">Accent color</span><div class="color-control"><input type="color" name="accent" value="${esc(c.accent)}" aria-label="Custom accent color"><span id="accent-label">${esc(c.accent.toUpperCase())}</span></div><div class="color-swatches">${ACCENTS.map((color) => `<button type="button" class="swatch" style="--swatch:${color}" data-action="accent" data-color="${color}" aria-label="Use ${color}" aria-pressed="${color === c.accent}"></button>`).join('')}</div></label>
      <label class="field"><span class="field-label">Layout</span><select name="layout" class="select"><option value="centered" ${c.layout === 'centered' ? 'selected' : ''}>Centered</option><option value="split" ${c.layout === 'split' ? 'selected' : ''}>Cover & content</option></select><span class="field-help">Both layouts adapt to smaller screens.</span></label></div>
      ${inputField('Spotify button text', 'button_label', c.button_label, { max: 40, required: true })}
      <label class="switch-label"><input type="checkbox" name="show_countdown" ${c.show_countdown ? 'checked' : ''}><span>Show the release countdown</span></label>
    </section>
    <section class="form-section"><div class="section-title"><span class="section-icon">${icon('link')}</span><div><h2>The destinations</h2><p>Bring fans one step closer.</p></div></div>
      ${inputField('Spotify release URL or URI', 'spotify_uri', c.spotify_uri, { max: 300, placeholder: 'https://open.spotify.com/album/…', help: 'Use the exact track or album assigned by your distributor. The recording locks after the first fan authorizes it. Duplicate the campaign to use a different recording.' })}
      <div class="info-panel">${icon('info')}<p>${state.service?.spotify_configured ? 'Spotify is connected. Fans can authorize within 179 days of release.' : 'Spotify pre-saving is not connected yet. You can design and publish pages with destination links; Spotify authorization becomes available when the service is connected.'}</p></div>
      <div class="section-heading"><h3>More destinations</h3><span class="field-help">Up to 12 buttons per page</span></div><p class="field-help">These buttons open links. They do not automatically save to a music library.</p>
      <div class="links-list" id="links-list">${c.links.map(linkRow).join('')}</div><span class="field-error" id="error-links"></span>
      ${button(icon('plus') + ' Add a destination', 'add-link', 'ghost', c.links.length >= 12 ? 'disabled' : '')}
    </section>
    <section class="form-section"><div class="section-title"><span class="section-icon">${icon('globe')}</span><div><h2>Ready when you are</h2><p>Drafts stay private. Published pages are shareable.</p></div></div>
      <label class="switch-label"><input type="checkbox" name="published" ${c.published ? 'checked' : ''}><span>Publish this campaign</span></label><p class="field-help">Anyone with the link can open a published page. Unpublishing hides the page and pauses pending pre-saves.</p>
      <div id="save-error" class="form-error" role="alert"></div><div class="modal-actions"><button class="button button-primary" type="submit" id="save-bottom">${icon('check')} Save campaign</button><span id="save-status" class="field-help" role="status">${state.user ? 'Changes are saved when you press Save.' : 'Sign in to save or publish. Your preview is ready to customize.'}</span></div>
    </section>
  </form><aside class="editor-preview" aria-label="Live page preview"><div class="preview-label"><span>${icon('eye')} LIVE PREVIEW</span><span class="badge badge-draft">Preview only</span></div><div class="preview-frame" id="release-preview"></div><p class="preview-note">This is how your release feels to a fan.<br>Your edits appear here as you make them.</p></aside></div>`;
}

function linkRow(link, index) {
  return `<div class="link-row" data-index="${index}"><label class="field"><span class="field-label">Button label</span><input class="input" data-link-label="${index}" maxlength="50" placeholder="Apple Music" value="${esc(link.label)}"></label><label class="field"><span class="field-label">Destination URL</span><input class="input" type="url" data-link-url="${index}" maxlength="2048" placeholder="https://…" value="${esc(link.url)}"></label><button type="button" class="icon-button" data-action="remove-link" data-index="${index}" aria-label="Remove destination ${index + 1}">${icon('close')}</button></div>`;
}

function readForm() {
  const form = document.querySelector('#campaign-form');
  if (!form) return state.draft;
  const values = new FormData(form);
  const release = values.get('release_at');
  const date = release ? new Date(release) : null;
  state.draft = {
    ...state.draft, title: String(values.get('title') || ''), artist: String(values.get('artist') || ''),
    slug: String(values.get('slug') || ''), description: String(values.get('description') || ''),
    release_at: date && !Number.isNaN(date.getTime()) ? date.toISOString() : null,
    artwork_url: String(values.get('artwork_url') || '') || null,
    theme: String(values.get('theme') || 'midnight'), layout: String(values.get('layout') || 'centered'),
    accent: String(values.get('accent') || '#c6b8ff'), button_label: String(values.get('button_label') || ''),
    spotify_uri: String(values.get('spotify_uri') || '') || null,
    show_countdown: values.has('show_countdown'), published: values.has('published'),
    links: Array.from(form.querySelectorAll('.link-row')).map((row) => ({
      label: row.querySelector('[data-link-label]').value, url: row.querySelector('[data-link-url]').value,
    })),
  };
  return state.draft;
}

function releaseHtml(c, preview = false, spotifyConfigured = false) {
  const future = c.release_at && Date.parse(c.release_at) > Date.now();
  const color = /^#[a-f0-9]{6}$/i.test(c.accent) ? c.accent : '#c6b8ff';
  const hasSpotify = Boolean(spotifyUri(c.spotify_uri));
  const canAuthorize = !preview && hasSpotify && spotifyConfigured;
  const links = (Array.isArray(c.links) ? c.links : []).filter((item) => safeUrl(item.url) && item.label);
  return `<div class="release-page ${c.layout === 'split' ? 'split-layout' : ''}" data-theme="${THEMES.includes(c.theme) ? c.theme : 'midnight'}" style="--campaign-accent:${color};--campaign-ink:${accentInk(color)}"><article class="release-card">
    ${artwork(c, 'release-artwork')}<div class="release-content"><p class="release-eyebrow">${future ? 'SOMETHING GOOD IS COMING' : c.release_at ? 'THE WAIT IS OVER' : 'YOUR NEXT FAVORITE'}</p><h1 class="release-title">${esc(c.title || 'Your next release')}</h1><p class="release-artist">${esc(c.artist || 'Your artist name')}</p>${c.description ? `<p class="release-description">${esc(c.description)}</p>` : ''}
    ${c.release_at ? `<p class="release-date">${future ? 'Releasing ' : 'Released '}${esc(releaseDate(c.release_at))}</p>` : ''}
    ${future && c.show_countdown ? `<div class="countdown" data-countdown="${esc(c.release_at)}" aria-label="Time until release">${countdownParts(c.release_at).map((part, i) => `<div class="countdown-unit"><b>${String(part).padStart(2, '0')}</b><span>${['days','hours','min','sec'][i]}</span></div>`).join('')}</div>` : ''}
    <div class="release-actions">${hasSpotify || preview ? `<button type="button" class="spotify-button" data-action="${preview ? 'preview-only' : 'authorize'}" ${canAuthorize || preview ? '' : 'disabled'}>${icon('spotify')}<span>${esc(c.button_label || 'Pre-save on Spotify')}</span></button>` : ''}
    ${links.map((link, index) => preview ? `<button type="button" class="destination-link" data-action="preview-only"><span>${esc(link.label)}</span>${icon('external')}</button>` : `<a class="destination-link" href="${esc(safeUrl(link.url))}" target="_blank" rel="noopener noreferrer" data-destination="${index}"><span>${esc(link.label)}</span>${icon('external')}</a>`).join('')}
    ${{ true: '' }[Boolean(links.length || hasSpotify || preview)] ?? '<p class="field-help">The artist will add listening links here soon.</p>'}</div>
    ${hasSpotify ? `<p class="consent">${spotifyConfigured || preview ? 'Continue to Spotify to authorize Nexus to save this release to your library. No Spotify password is shared with Nexus.' : 'Spotify pre-saving is currently unavailable for this page.'}</p>` : ''}
    ${hasSpotify && !preview ? '<p class="consent">You can cancel a pending pre-save from the confirmation page, or remove Nexus in your <a href="https://www.spotify.com/account/apps/" target="_blank" rel="noopener noreferrer">Spotify app settings</a>.</p>' : ''}
    <div id="${preview ? 'preview-feedback' : 'public-feedback'}" role="status" class="release-notice"></div><div class="release-footer"><span class="mini-brand">${icon('link')} nexus</span><span>Made for what’s next.</span></div></div></article></div>`;
}

function updatePreview() {
  const target = document.querySelector('#release-preview');
  if (!target) return;
  target.innerHTML = releaseHtml(state.draft, true, Boolean(state.service?.spotify_configured));
  document.querySelector('#slug-preview').textContent = state.draft.slug ? shareUrl(state.draft.slug) : 'Your shareable link will appear here';
  document.querySelector('#accent-label').textContent = state.draft.accent.toUpperCase();
  document.querySelectorAll('.swatch').forEach((el) => el.setAttribute('aria-pressed', String(el.dataset.color === state.draft.accent)));
}

function confirmAction(title, message, label = 'Continue') {
  const dialog = document.querySelector('#confirm-dialog');
  dialog.className = 'modal';
  dialog.innerHTML = `<div class="modal-body"><h2 id="confirm-title" class="modal-title">${esc(title)}</h2><p>${esc(message)}</p><div class="modal-actions"><button class="button button-secondary" type="button" data-confirm="no">Keep working</button><button class="button button-primary" type="button" data-confirm="yes">${esc(label)}</button></div></div>`;
  dialog.setAttribute('aria-labelledby', 'confirm-title');
  return new Promise((resolve) => {
    let result = false;
    const click = (e) => { const choice = e.target.closest('[data-confirm]'); if (choice) { result = choice.dataset.confirm === 'yes'; dialog.close(); } };
    dialog.addEventListener('click', click);
    dialog.addEventListener('close', () => { dialog.removeEventListener('click', click); resolve(result); }, { once: true });
    dialog.showModal();
    dialog.querySelector('[data-confirm="no"]').focus();
  });
}

async function mayLeave() {
  if (state.saving || state.uploading) { toast('Please wait for the current save or upload to finish.'); return false; }
  return !state.dirty || await confirmAction('Leave without saving?', 'Your changes are only in this preview. Save the campaign to keep them.', 'Discard changes');
}

async function navigate(view) {
  if (!await mayLeave()) return;
  state.dirty = false; state.draft = null; state.view = view;
  render(); window.scrollTo({ top: 0, behavior: 'instant' });
  if (view === 'campaigns') void loadCampaigns();
  document.querySelector('#main').focus({ preventScroll: true });
}

async function openEditor(campaign = null) {
  if (!await mayLeave()) return;
  state.draft = campaign ? structuredClone(campaign) : newCampaign({ artist: state.user?.user_metadata?.display_name || '' });
  state.view = 'editor'; state.dirty = false; state.slugEdited = Boolean(state.draft.slug);
  render(); window.scrollTo({ top: 0, behavior: 'instant' });
  document.querySelector('#campaign-form [name="title"]').focus({ preventScroll: true });
}

function showValidation(errors) {
  document.querySelectorAll('.field-error').forEach((el) => el.textContent = '');
  document.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
  for (const [name, message] of Object.entries(errors)) {
    const el = document.getElementById('error-' + name);
    if (el) el.textContent = message;
    const input = document.querySelector(`[name="${name}"]`);
    if (input) input.setAttribute('aria-invalid', 'true');
  }
  const first = document.querySelector('[aria-invalid="true"]');
  if (first) { first.focus(); first.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
}

async function saveCampaign() {
  if (state.saving || state.uploading) return;
  const result = validateCampaign(readForm());
  showValidation(result.errors);
  if (!result.valid) { document.querySelector('#save-error').textContent = 'Check the highlighted fields before saving.'; return; }
  if (!state.user) { openAuth('login'); return; }
  const owner = state.user.id;
  state.saving = true;
  const controls = [...document.querySelectorAll('#campaign-form input, #campaign-form textarea, #campaign-form select, #campaign-form button, #save-top')];
  controls.forEach((el) => el.disabled = true);
  document.querySelector('#save-error').textContent = '';
  document.querySelector('#save-status').textContent = 'Saving your campaign…';
  try {
    if (await needsMfa()) { await openMfa(); return; }
    if (state.user?.id !== owner) return;
    const response = await api('save', { campaign: result.campaign }, true);
    if (state.user?.id !== owner) return;
    state.draft = response.campaign; state.dirty = false;
    toast(state.draft.published ? 'Your campaign is published. Your link is ready to share.' : 'Draft saved to your Nexus account.');
    render();
    document.querySelector('#save-status').textContent = state.draft.published ? 'Published. Copy your link to share it.' : 'All changes saved.';
  } catch (error) {
    const el = document.querySelector('#save-error');
    if (el) el.textContent = error.message;
    if (document.querySelector('#save-status')) document.querySelector('#save-status').textContent = 'Your changes have not been saved yet.';
  } finally {
    state.saving = false;
    controls.forEach((el) => el.disabled = false);
  }
}

async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
    toast('Link copied. Go make some anticipation.');
  } catch {
    const dialog = document.querySelector('#confirm-dialog');
    dialog.className = 'modal';
    dialog.innerHTML = `<div class="modal-body"><h2 class="modal-title" id="copy-title">Copy your link</h2><p>Your browser couldn’t copy automatically. Select and copy the link below.</p><input class="input" aria-label="Link to copy" readonly value="${esc(value)}"><div class="modal-actions"><button class="button button-primary" data-close-dialog>Done</button></div></div>`;
    dialog.setAttribute('aria-labelledby', 'copy-title'); dialog.showModal();
    const input = dialog.querySelector('input'); input.focus(); input.select();
  }
}

function authForm(mode) {
  const signup = mode === 'signup', reset = mode === 'reset', forgot = mode === 'forgot', mfa = mode === 'mfa';
  const title = signup ? 'Join the next wave.' : reset ? 'Set a new password' : forgot ? 'Reset your password' : mfa ? 'One more step' : 'Welcome to your next release.';
  return `<div class="modal-body"><button type="button" class="modal-close icon-button" data-close-dialog aria-label="Close sign-in">${icon('close')}</button><div class="brand-mark modal-brand">${icon('link')}</div><h2 class="modal-title" id="auth-title">${title}</h2><p>${signup ? 'Create a Nexus account for your music, your links, and your community.' : mfa ? 'Use your authenticator to finish signing in to Nexus.' : reset ? 'Choose a strong password for your Nexus account.' : forgot ? 'We’ll send a reset link if this email belongs to an account.' : 'Sign in with your existing Nexus account to save and publish unlimited links.'}</p>
    <form id="auth-form" data-mode="${mode}">
    ${!reset && !mfa ? inputField('Email', 'email', '', { type: 'email', max: 254, required: true }) : ''}
    ${signup ? inputField('Username', 'username', '', { max: 32, required: true, help: '2–32 lowercase letters, numbers, underscores, or periods.' }) : ''}
    ${!forgot && !mfa ? inputField('Password', 'password', '', { type: 'password', max: 128, required: true, help: signup || reset ? 'At least 8 characters.' : '' }) : ''}
    ${signup || reset ? inputField('Confirm password', 'confirm_password', '', { type: 'password', max: 128, required: true }) : ''}
    ${mfa ? '<label class="field"><span class="field-label">Authenticator code</span><input class="input" name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" required></label>' : ''}
    ${signup ? '<label class="switch-label"><input type="checkbox" name="agree" required><span>I agree to use Nexus respectfully and only share content I have rights to.</span></label><label class="sr-only" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label>' : ''}
    <div id="auth-error" class="form-error" role="alert"></div><div id="auth-info" class="field-help" role="status"></div><button class="button button-primary auth-submit" type="submit">${signup ? 'Create Nexus account' : forgot ? 'Send reset link' : reset ? 'Update password' : mfa ? 'Verify code' : 'Sign in'}</button>
    </form>
    ${!mfa && !reset ? `<div class="auth-switch">${signup ? `Already on Nexus? <button class="text-button" data-action="auth-mode" data-mode="login">Sign in</button>` : `New here? <button class="text-button" data-action="auth-mode" data-mode="signup">Create an account</button>`}${!signup ? `<button class="text-button" data-action="auth-mode" data-mode="${forgot ? 'login' : 'forgot'}">${forgot ? 'Back to sign in' : 'Forgot password?'}</button>` : ''}</div>` : ''}
    </div>`;
}

function openAuth(mode = 'login') {
  if (!configured) { toast('The service owner needs to connect Nexus sign-in first.'); return; }
  const dialog = document.querySelector('#auth-dialog');
  dialog.className = 'modal'; dialog.innerHTML = authForm(mode);
  dialog.setAttribute('aria-labelledby', 'auth-title');
  if (!dialog.open) dialog.showModal();
  const email = dialog.querySelector('[name="email"]');
  if (email) email.autocomplete = 'email';
  const password = dialog.querySelector('[name="password"]');
  if (password) password.autocomplete = mode === 'signup' || mode === 'reset' ? 'new-password' : 'current-password';
}

let mfaFactor = null;
async function openMfa() {
  const { data, error } = await client.auth.mfa.listFactors();
  if (error) { toast(error.message); return; }
  mfaFactor = data.totp?.find((f) => f.status === 'verified')?.id;
  openAuth('mfa');
  if (!mfaFactor) {
    document.querySelector('#auth-form').innerHTML = `<div class="info-panel"><p>Your Nexus account uses a passkey. Complete sign-in in Nexus, then return to this page.</p></div><a class="button button-primary" href="/login">Open Nexus sign-in</a>`;
  }
}

async function submitAuth(form) {
  const mode = form.dataset.mode, values = new FormData(form);
  const submit = form.querySelector('[type="submit"]');
  submit.disabled = true;
  const errorBox = document.querySelector('#auth-error'), info = document.querySelector('#auth-info');
  errorBox.textContent = ''; info.textContent = '';
  try {
    const email = String(values.get('email') || '').trim(), password = String(values.get('password') || '');
    if (mode === 'forgot') {
      const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: localBase });
      if (error) throw error;
      info.textContent = 'If the account exists, a password reset link is on its way.'; return;
    }
    if (mode === 'mfa') {
      if (!mfaFactor) throw new Error('Finish passkey sign-in in Nexus first.');
      const { error } = await client.auth.mfa.challengeAndVerify({ factorId: mfaFactor, code: String(values.get('code') || '').trim() });
      if (error) throw error;
    } else {
      if (mode === 'signup' || mode === 'reset') {
        if (password.length < 8) throw new Error('Use a password with at least 8 characters.');
        if (password !== values.get('confirm_password')) throw new Error('The passwords don’t match.');
      }
      if (mode === 'reset') {
        const { error } = await client.auth.updateUser({ password });
        if (error) throw error;
        document.querySelector('#auth-dialog').close(); toast('Your Nexus password has been updated.'); return;
      }
      if (mode === 'signup') {
        if (!values.has('agree')) throw new Error('Please accept the community rules.');
        const username = String(values.get('username') || '').trim().toLowerCase();
        if (!/^[a-z0-9_.]{2,32}$/.test(username)) throw new Error('Use a username with 2–32 lowercase letters, numbers, underscores, or periods.');
        const { error } = await client.functions.invoke('signup', { body: { email, password, username, display_name: username, website: values.get('website') || '' } });
        if (error) {
          const details = await error.context?.json?.().catch(() => null);
          throw new Error(details?.error || error.message || 'Couldn’t create the account.');
        }
      }
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (await needsMfa()) { await openMfa(); return; }
    }
    const { data } = await client.auth.getSession();
    state.user = data.session?.user ?? null;
    document.querySelector('#auth-dialog').close();
    if (state.view === 'editor') { readForm(); render(); toast('Signed in. Your campaign is ready to save.'); }
    else { render(); void loadCampaigns(); toast('Welcome to your creator workspace.'); }
  } catch (error) {
    if (errorBox.isConnected) errorBox.textContent = error.message || 'Sign-in could not be completed.';
  } finally { submit.disabled = false; }
}

let publicCampaign = null;
let cancellationToken = null;
async function loadPublic() {
  document.body.classList.add('is-public');
  root.innerHTML = `<div class="public-shell"><header class="public-brand"><a href="${esc(localBase)}">${icon('link')} nexus <span>PRE-SAVE</span></a>${button('Create your own', 'public-home', 'secondary')}</header><main id="main" tabindex="-1"><div class="loading-view"><span class="spinner"></span><p>Finding your next favorite…</p></div></main><footer class="public-footer">Nexus by qyopyy · Made for creators.</footer></div>`;
  try {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(publicSlug) || publicSlug.length < 3 || publicSlug.length > 64) throw Object.assign(new Error('This link is not available.'), { status: 404 });
    const result = await api('page', { slug: publicSlug });
    publicCampaign = result.campaign;
    document.title = publicCampaign.title + ' — ' + publicCampaign.artist + ' | Nexus Pre-save';
    document.querySelector('meta[name="description"]')?.setAttribute('content', publicCampaign.description || 'Get ready for ' + publicCampaign.title + ' by ' + publicCampaign.artist + '.');
    document.querySelector('#main').innerHTML = releaseHtml(publicCampaign, false, result.spotify_configured);
    const notice = document.querySelector('#public-feedback');
    const outcome = new URLSearchParams(location.search).get('presave');
    if (outcome === 'success') notice.textContent = 'Returned from Spotify. Checking your pre-save…';
    else if (outcome === 'cancelled') notice.textContent = 'Spotify authorization was cancelled. No new pre-save was added.';
    else if (outcome === 'error') notice.textContent = 'Spotify couldn’t finish the connection. Please try again.';
    const fragment = new URLSearchParams(location.hash.slice(1)).get('cancel');
    if (fragment && /^[A-Za-z0-9_-]{43}$/.test(fragment)) {
      cancellationToken = fragment;
      try { sessionStorage.setItem('nexus-presave-cancel:' + publicSlug, fragment); } catch {}
      history.replaceState(null, '', location.pathname + location.search);
    } else {
      try { cancellationToken = sessionStorage.getItem('nexus-presave-cancel:' + publicSlug); } catch {}
    }
    if (cancellationToken) {
      try {
        const receipt = await api('receipt', { token: cancellationToken, slug: publicSlug });
        const messages = {
          pending: 'Your Spotify authorization is registered. This release is queued to be saved once it’s available.',
          processing: 'Your Spotify save is being processed.',
          saved: 'This release was saved to your Spotify library.',
          cancelled: 'This pre-save has been cancelled. Music already saved stays in your library.',
          expired: 'This authorization has expired. Connect to Spotify again to register a new pre-save.',
          failed: 'Spotify couldn’t complete this save. You can connect again to try a new authorization.',
        };
        notice.textContent = messages[receipt.status] || 'Your Spotify authorization has been received.';
        if (['pending','processing','failed'].includes(receipt.status)) {
          notice.insertAdjacentHTML('beforeend', `<div class="cancel-actions">${button('Cancel this pre-save', 'cancel-presave', 'secondary')}${button('Copy cancellation link', 'copy-cancel', 'ghost')}</div>`);
        }
      } catch {
        notice.textContent = 'We couldn’t verify your pre-save status. Try refreshing this page.';
      }
    } else if (outcome === 'success') {
      notice.textContent = 'Returned from Spotify. This browser does not have a confirmation receipt, so we can’t verify a completed authorization here.';
    }
    void api('track', { slug: publicSlug, kind: 'view' }).catch(() => {});
  } catch (error) {
    document.querySelector('#main').innerHTML = `<div class="empty-state public-error"><div class="empty-illustration">${icon('link')}</div><h1>${error.status === 404 ? 'This link isn’t available.' : 'We couldn’t open this release.'}</h1><p>${error.status === 404 ? 'It may be a draft, unpublished, or no longer here. Check the link with the artist.' : 'The service may be temporarily unavailable. Please try again in a moment.'}</p>${button('Try again', 'public-retry', 'secondary')}<a class="button button-ghost" href="${esc(localBase)}">Create a pre-save page</a></div>`;
  }
}

async function authorize(buttonEl) {
  if (!publicCampaign) return;
  buttonEl.disabled = true;
  const notice = document.querySelector('#public-feedback');
  notice.textContent = 'Opening Spotify securely…';
  try {
    const { url } = await api('authorize', { slug: publicSlug, return_url: baseUrl() });
    const target = new URL(url);
    const functionOrigin = new URL(window.NEXUS_PRESAVE_CONFIG.supabaseUrl).origin;
    if (target.protocol !== 'https:' || ![functionOrigin, 'https://accounts.spotify.com'].includes(target.origin)) throw new Error('The authorization address is invalid.');
    window.location.assign(target.href);
  } catch (error) {
    notice.textContent = error.message; buttonEl.disabled = false;
  }
}

document.addEventListener('submit', (event) => {
  if (event.target.id === 'campaign-form') { event.preventDefault(); void saveCampaign().catch((e) => toast(e.message)); }
  if (event.target.id === 'auth-form') { event.preventDefault(); void submitAuth(event.target); }
});

let searchTimer;
document.addEventListener('input', (event) => {
  if (event.target.id === 'search-campaigns') {
    state.search = event.target.value; state.page = 1;
    clearTimeout(searchTimer); searchTimer = setTimeout(loadCampaigns, 300); return;
  }
  if (event.target.closest('#campaign-form') && event.target.type !== 'file') {
    if (event.target.name === 'slug') state.slugEdited = true;
    if (!state.slugEdited && ['title','artist'].includes(event.target.name)) {
      const form = document.querySelector('#campaign-form');
      const generated = slugify([form.elements.artist.value, form.elements.title.value].filter(Boolean).join('-'));
      form.elements.slug.value = generated;
    }
    state.dirty = true; readForm(); updatePreview();
    const status = document.querySelector('#save-status'); if (status) status.textContent = 'You have unsaved changes.';
  }
});

document.addEventListener('change', async (event) => {
  if (event.target.id !== 'artwork-file') return;
  const file = event.target.files[0]; if (!file) return;
  if (!state.user) { event.target.value = ''; openAuth(); return; }
  if (state.uploading) return;
  const status = document.querySelector('#upload-status');
  const owner = state.user.id, draft = state.draft;
  state.uploading = true; status.textContent = 'Uploading artwork…';
  try {
    const url = await uploadArtwork(file, owner);
    if (state.user?.id !== owner || state.draft?.id !== draft.id) return;
    document.querySelector('[name="artwork_url"]').value = url;
    state.dirty = true; readForm(); updatePreview();
    document.querySelector('#artwork-thumb').innerHTML = artwork(state.draft, 'upload-thumb', true);
    status.textContent = 'Uploaded. Save the campaign to keep this artwork.';
  } catch (error) { if (status.isConnected) status.textContent = error.message; }
  finally { state.uploading = false; event.target.value = ''; }
});

document.addEventListener('click', async (event) => {
  const closer = event.target.closest('[data-close-dialog]');
  if (closer) { closer.closest('dialog')?.close(); return; }
  const destination = event.target.closest('[data-destination]');
  if (destination && publicCampaign) void api('track', { slug: publicSlug, kind: 'click', index: Number(destination.dataset.destination) }).catch(() => {});
  const target = event.target.closest('[data-action]');
  if (!target || target.disabled) return;
  const action = target.dataset.action;
  const campaign = state.campaigns.find((c) => c.id === target.dataset.id);
  try {
    if (state.saving && !['preview-only','copy-draft'].includes(action)) { toast('Please wait for your campaign to finish saving.'); return; }
    switch (action) {
      case 'navigate': await navigate(target.dataset.view); break;
      case 'create': await openEditor(); break;
      case 'template': {
        const t = TEMPLATES[Number(target.dataset.template)];
        await openEditor(newCampaign({ theme: t.theme, accent: t.accent, layout: t.layout })); break;
      }
      case 'edit': if (campaign) await openEditor(campaign); break;
      case 'signin': openAuth(); break;
      case 'auth-mode': openAuth(target.dataset.mode); break;
      case 'signout':
        if (await mayLeave()) {
          const { error } = await client.auth.signOut(); if (error) throw error;
          state.user = null; state.dirty = false; state.draft = null; state.view = 'campaigns'; render(); await loadCampaigns();
        } break;
      case 'filter': state.filter = target.dataset.filter; state.page = 1; render(); await loadCampaigns(); break;
      case 'clear-filters': state.filter = 'all'; state.search = ''; state.page = 1; render(); await loadCampaigns(); break;
      case 'refresh': await loadCampaigns(); break;
      case 'previous': state.page = Math.max(1, state.page - 1); await loadCampaigns(); break;
      case 'next': state.page += 1; await loadCampaigns(); break;
      case 'copy': if (campaign?.published) await copyText(shareUrl(campaign.slug)); break;
      case 'copy-draft': if (state.dirty) { toast('Save your changes before copying the published link.'); break; } await copyText(shareUrl(state.draft.slug)); break;
      case 'duplicate':
        if (campaign) {
          const owner = state.user?.id;
          const request = state.request;
          target.disabled = true;
          const result = await api('duplicate', { id: campaign.id }, true);
          if (state.user?.id !== owner) break;
          if (state.view === 'campaigns' && state.request === request) await openEditor(result.campaign);
          toast('Copied as a new private draft.');
        } break;
      case 'delete':
        if (campaign && await confirmAction('Delete this campaign?', 'This removes "' + campaign.title + '", its public link, analytics, and pending pre-saves. This cannot be undone.', 'Delete campaign')) {
          target.disabled = true; await api('delete', { id: campaign.id }, true); toast('Campaign deleted.');
          if (state.campaigns.length === 1 && state.page > 1) state.page -= 1;
          await loadCampaigns();
        } break;
      case 'save-draft': await saveCampaign(); break;
      case 'accent': document.querySelector('[name="accent"]').value = target.dataset.color; state.dirty = true; readForm(); updatePreview(); break;
      case 'add-link':
        readForm(); if (state.draft.links.length >= 12) break;
        state.draft.links.push({ label: '', url: '' }); state.dirty = true;
        document.querySelector('#links-list').innerHTML = state.draft.links.map(linkRow).join('');
        if (state.draft.links.length >= 12) target.disabled = true;
        document.querySelector('#links-list .link-row:last-child input').focus(); break;
      case 'remove-link':
        readForm(); state.draft.links.splice(Number(target.dataset.index), 1); state.dirty = true;
        document.querySelector('#links-list').innerHTML = state.draft.links.map(linkRow).join('');
        document.querySelector('[data-action="add-link"]').disabled = false; updatePreview(); break;
      case 'preview-only': toast('This is a live design preview. Publish your page to share it with fans.'); break;
      case 'public-home': location.assign(localBase); break;
      case 'public-retry': await loadPublic(); break;
      case 'authorize': await authorize(target); break;
      case 'copy-cancel': {
        const url = new URL(shareUrl(publicSlug)); url.hash = new URLSearchParams({ cancel: cancellationToken }).toString();
        await copyText(url.href); break;
      }
      case 'cancel-presave':
        if (cancellationToken && await confirmAction('Cancel this pre-save?', 'This cancels the pending save for this release. Music already saved stays in your Spotify library.', 'Cancel pre-save')) {
          target.disabled = true; await api('cancel', { token: cancellationToken });
          cancellationToken = null; try { sessionStorage.removeItem('nexus-presave-cancel:' + publicSlug); } catch {}
          document.querySelector('#public-feedback').textContent = 'Your pending pre-save has been cancelled. Music already saved stays in your library.';
        } break;
    }
  } catch (error) {
    toast(error.message || 'Something went wrong. Please try again.');
    target.disabled = false;
  }
});

window.addEventListener('beforeunload', (event) => {
  if (state.dirty || state.saving || state.uploading) { event.preventDefault(); event.returnValue = ''; }
});
root.addEventListener('error', (event) => {
  if (event.target instanceof HTMLImageElement) {
    const placeholder = document.createElement('div'); placeholder.className = 'release-placeholder';
    const message = document.createElement('span'); message.className = 'art-word'; message.textContent = 'Artwork unavailable';
    placeholder.append(message); event.target.replaceWith(placeholder);
  }
}, true);
setInterval(() => {
  document.querySelectorAll('[data-countdown]').forEach((el) => {
    const parts = countdownParts(el.dataset.countdown);
    el.querySelectorAll('b').forEach((cell, i) => cell.textContent = String(parts[i]).padStart(2, '0'));
  });
}, 1000);

async function boot() {
  if (publicSlug !== null) void loadPublic();
  else render();
  const tasks = [
    api('config').then((service) => { state.service = service; if (state.view === 'editor' && !publicSlug) updatePreview(); }).catch(() => {}),
    client ? client.auth.getSession().then(({ data }) => { state.user = data.session?.user ?? null; }) : Promise.resolve(),
  ];
  await Promise.allSettled(tasks);
  state.booting = false;
  if (publicSlug === null) { render(); void loadCampaigns(); }
}

if (client) client.auth.onAuthStateChange((event, session) => {
    setTimeout(() => {
      if (event === 'PASSWORD_RECOVERY') { openAuth('reset'); return; }
      const previous = state.user?.id; state.user = session?.user ?? null;
      if (state.booting || publicSlug !== null || previous === state.user?.id) return;
      if (previous) {
        state.draft = null; state.dirty = false; state.view = 'campaigns'; state.campaigns = []; state.summary = {}; state.total = 0; ++state.request;
      }
      if (state.view === 'editor') readForm();
      render();
      if (state.view === 'campaigns') void loadCampaigns();
    }, 0);
});
void boot();
