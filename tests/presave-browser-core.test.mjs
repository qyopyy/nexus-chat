import assert from 'node:assert/strict';
import test from 'node:test';
import {
  escapeHtml, safeUrl, spotifyUri, campaignUrl, countdownParts,
  validateCampaign, localDateInput, accentInk, appearance, contrastRatio, THEMES, newCampaign,
} from '../public/presave/core.mjs';
import { THEMES as SERVER_THEMES } from '../supabase/functions/presave/core.mjs';

test('release copy and destination labels cannot break out of generated HTML', () => {
  const payloads = ['<script>alert(1)</script>', '"><img src=x onerror=alert(1)>', "' autofocus onfocus='alert(1)", 'A & B'];
  for (const input of payloads) {
    const escaped = escapeHtml(input);
    assert.equal(/[<>"']/.test(escaped), false);
    assert.equal(/&(?!amp;|lt;|gt;|quot;|#39;)/.test(escaped), false);
  }
  assert.equal(escapeHtml(null), '');
});

test('browser URL handling rejects executable schemes, credential-bearing links, and protocol-relative redirects', () => {
  for (const input of ['javascript:alert(1)', 'data:text/html,test', '//evil.example', 'http://example.com', 'https://user:pass@example.com', 'https://example.com/a\nb']) {
    assert.equal(safeUrl(input), '', input);
  }
  assert.equal(safeUrl('https://artist.example/release?from=nexus'), 'https://artist.example/release?from=nexus');
});

test('copying a campaign URL preserves both supported mount paths and drops callback/cancellation secrets', () => {
  for (const path of ['/public/presave/index.html', '/presave/index.html']) {
    const link = new URL(campaignUrl('midnight-release', `https://nexus.example${path}?slug=old&auth=secret#cancel=private-capability`));
    assert.equal(link.pathname, path);
    assert.deepEqual([...link.searchParams], [['slug', 'midnight-release']]);
    assert.equal(link.hash, '');
    assert.equal(link.href.includes('secret'), false);
    assert.equal(link.href.includes('private-capability'), false);
  }
  const malicious = new URL(campaignUrl('x&redirect=https://evil.example', 'https://nexus.example/presave/index.html'));
  assert.equal(malicious.searchParams.size, 1);
});

test('Spotify preview normalization cannot confuse provider hostnames or artist pages with recordings', () => {
  const id = '0123456789ABCDEFGHIJKL';
  assert.equal(spotifyUri(`https://open.spotify.com/album/${id}?si=shared`), `spotify:album:${id}`);
  for (const input of [`https://open.spotify.com.evil.example/track/${id}`, `https://evil.example/track/${id}`, `https://open.spotify.com/artist/${id}`, `https://user@open.spotify.com/track/${id}`]) {
    assert.equal(spotifyUri(input), '');
  }
});

test('browser validation rejects unsafe campaign customization before submitting', () => {
  const base = { title: 'Release', artist: 'Artist', slug: 'valid-release' };
  assert.equal(validateCampaign(base).valid, true);
  for (const patch of [
    { title: '' }, { slug: '../other' }, { accent: '#fff;background:red' },
    { artwork_url: 'javascript:alert(1)' }, { links: [{ label: 'Listen', url: 'javascript:alert(1)' }] },
    { spotify_uri: 'spotify:track:0123456789ABCDEFGHIJKL', release_at: null },
  ]) assert.equal(validateCampaign({ ...base, ...patch }).valid, false, JSON.stringify(patch));
});

test('malformed destination arrays produce validation errors without crashing the editor', () => {
  const base = { title: 'Release', artist: 'Artist', slug: 'valid-release' };
  for (const links of [[null], [false], ['https://example.com'], [[]], [{ label: 'Good', url: 'https://example.com' }, null]]) {
    const result = validateCampaign({ ...base, links });
    assert.equal(result.valid, false);
    assert.ok(result.errors.links);
  }
});

test('custom accent buttons choose readable ink around the light/dark contrast boundary', () => {
  assert.equal(accentInk('#767676'), '#ffffff');
  assert.equal(accentInk('#ffffff'), '#111117');
  assert.equal(accentInk('#000000'), '#ffffff');
  assert.equal(accentInk('#c6b8ff'), '#111117');
});

test('countdown stops at release and editing an instant preserves local timezone including summer offset', () => {
  const now = Date.parse('2027-01-20T12:00:00Z');
  assert.deepEqual(countdownParts('2027-01-21T13:02:03Z', now), [1, 1, 2, 3]);
  assert.deepEqual(countdownParts('2027-01-19T12:00:00Z', now), [0, 0, 0, 0]);
  const previousTimezone = process.env.TZ;
  process.env.TZ = 'Europe/Budapest';
  try {
    assert.equal(localDateInput('2027-01-20T10:00:00Z'), '2027-01-20T11:00');
    assert.equal(localDateInput('2027-06-20T10:00:00Z'), '2027-06-20T12:00');
    assert.equal(new Date(localDateInput('2027-06-20T10:00:00Z')).toISOString(), '2027-06-20T10:00:00.000Z');
  } finally {
    if (previousTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimezone;
  }
});

test('every appearance preset can be persisted and older campaigns receive compatible defaults', () => {
  assert.deepEqual(THEMES, SERVER_THEMES);
  assert.equal(THEMES.length, 17);
  for (const theme of THEMES) {
    const { campaign, valid } = validateCampaign({ title: 'Release', artist: 'Artist', slug: 'valid-release', theme });
    assert.equal(valid, true, theme);
    assert.equal(campaign.background_url, null);
    assert.equal(campaign.background_overlay, 55);
    assert.equal(campaign.background_motion, true);
    assert.equal(campaign.button_style, 'rounded');
    assert.equal(campaign.font_style, 'modern');
  }
  assert.equal(newCampaign({ title: 'An older draft' }).background_color, '#101019');
});

test('appearance rendering cannot create CSS or HTML from untrusted customization', () => {
  const look = appearance({
    theme: 'galaxy" onclick="bad', accent: '#fff;position:fixed',
    background_url: 'https://example.com/a\\b', background_color: 'url(javascript:bad)',
    text_color: '#fff"', background_overlay: '0;position:absolute',
    background_motion: 'false', button_style: 'pill"', font_style: 'editorial"',
  });
  assert.deepEqual(look, appearance());
  const base = { title: 'Release', artist: 'Artist', slug: 'valid-release' };
  for (const patch of [
    { background_url: 'data:image/svg+xml,<svg onload=bad>' },
    { background_url: 'https://user:pass@example.com/background.jpg' },
    { background_url: 'https://example.com/' + 'é'.repeat(400) },
    { background_overlay: -1 }, { background_overlay: 91 }, { background_overlay: .5 },
    { background_overlay: '55' }, { background_motion: 'false' },
    { background_color: '#fff;display:none' }, { text_color: '#fff' },
    { button_style: 'triangle' }, { font_style: 'external-font' },
  ]) assert.equal(validateCampaign({ ...base, ...patch }).valid, false, JSON.stringify(patch));
  assert.equal(safeUrl('https://example.com/' + 'é'.repeat(400)), '');
});

test('custom palette contrast helps creators choose readable text without blocking image designs', () => {
  assert.equal(contrastRatio('#ffffff', '#000000'), 21);
  assert.equal(contrastRatio('#808080', '#808080'), 1);
  assert.equal(contrastRatio('invalid', '#000000'), 0);
  assert.ok(contrastRatio('#f5f5fb', '#101019') >= 4.5);
  const base = { title: 'Release', artist: 'Artist', slug: 'valid-release', links: [{ label: 'L'.repeat(60), url: 'https://example.com' }] };
  assert.equal(validateCampaign(base).valid, true);
  assert.equal(validateCampaign({ ...base, links: [{ ...base.links[0], label: 'L'.repeat(61) }] }).valid, false);
});
