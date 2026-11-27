// Server-only: public artist website (/bio/artist/<spotify id or handle>).
// Shows only releases from the current year, a verified check, and "listen everywhere" links.

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const truncate = (s: string, n = 160) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= n ? t : `${t.slice(0, n - 1).trimEnd()}…`;
};
const jsonLd = (data: Record<string, unknown>) => `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;

export type SiteRelease = {
  id: string;
  name: string;
  image?: string | null;
  url?: string | null;
  type?: string | null;
  release_date: string;
  total_tracks?: number | null;
  artists?: { id?: string | null; name: string }[];
};

export type SiteArtist = { id: string; name: string; image?: string | null; url?: string | null; followers?: number | null; genres?: string[] };

export type ArtistSiteData = {
  artist: SiteArtist;
  releases: SiteRelease[];
  verified: boolean;
  bio?: string | null;
  handle?: string | null;
  contacts?: Dsp[];
  /** Other Spotify profiles merged into this catalog (the page artist is always included). */
  aliases?: Main[];
  /** Total page views (null/undefined hides the counter). */
  views?: number | null;
  /** Artist's tracks (for collaborations). */
  tracks?: { id?: string | null; name: string; artists?: { id?: string | null; name: string }[]; album?: { release_date?: string | null } | null }[];
  /** Spotify embed to show as "Listen now" (see pickEmbed). */
  embed?: string | null;
  embedTitle?: string | null;
  year: number;
};

/** Spotify dates are "YYYY", "YYYY-MM" or "YYYY-MM-DD". */
export function releaseYear(d: string | null | undefined): number | null {
  const m = /^(\d{4})/.exec(d ?? "");
  return m ? Number(m[1]) : null;
}

/** Only releases from `year`, newest first, one card per title (Spotify lists market variants twice). */
export function thisYearReleases(list: SiteRelease[], year: number): SiteRelease[] {
  const seen = new Set<string>();
  return list
    .filter((r) => r && releaseYear(r.release_date) === year && (!r.type || r.type === "single" || r.type === "album"))
    .sort((a, b) => String(b.release_date).localeCompare(String(a.release_date)))
    .filter((r) => {
      const key = r.name.trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export type Dsp = { id: string; label: string; color: string; url: string };

/** Streaming services and sources. Spotify goes straight to the artist; the rest open a search for the artist
 *  (a search never goes stale or points at the wrong profile). */
export function dspLinks(name: string, spotifyUrl?: string | null): Dsp[] {
  const q = encodeURIComponent(name);
  const qm = encodeURIComponent(`${name} music`);
  return [
    { id: "spotify", label: "Spotify", color: "#1DB954", url: spotifyUrl || `https://open.spotify.com/search/${q}` },
    { id: "apple", label: "Apple Music", color: "#fa243c", url: `https://music.apple.com/search?term=${q}` },
    { id: "youtubemusic", label: "YouTube Music", color: "#ff0000", url: `https://music.youtube.com/search?q=${q}` },
    { id: "amazon", label: "Amazon Music", color: "#25d1da", url: `https://music.amazon.com/search/${q}` },
    { id: "deezer", label: "Deezer", color: "#a238ff", url: `https://www.deezer.com/search/${q}` },
    { id: "tidal", label: "TIDAL", color: "#ffffff", url: `https://tidal.com/search?q=${q}` },
    { id: "soundcloud", label: "SoundCloud", color: "#ff5500", url: `https://soundcloud.com/search?q=${q}` },
    { id: "audiomack", label: "Audiomack", color: "#ffa200", url: `https://audiomack.com/search?q=${q}` },
    { id: "pandora", label: "Pandora", color: "#3668ff", url: `https://www.pandora.com/search/${q}/all` },
    { id: "napster", label: "Napster", color: "#00a3e0", url: `https://web.napster.com/search?query=${q}` },
    { id: "boomplay", label: "Boomplay", color: "#27c4f5", url: `https://www.boomplay.com/search/default/${q}` },
    { id: "anghami", label: "Anghami", color: "#a63cd4", url: `https://play.anghami.com/search/${q}` },
    { id: "qobuz", label: "Qobuz", color: "#1b9fdb", url: `https://www.qobuz.com/us-en/search?q=${q}` },
    { id: "beatport", label: "Beatport", color: "#01ff95", url: `https://www.beatport.com/search?q=${q}` },
    { id: "bandcamp", label: "Bandcamp", color: "#629aa9", url: `https://bandcamp.com/search?q=${q}` },
    { id: "youtube", label: "YouTube", color: "#ff3d3d", url: `https://www.youtube.com/results?search_query=${qm}` },
  ];
}

export function sourceLinks(name: string): Dsp[] {
  const q = encodeURIComponent(name);
  return [
    { id: "lastfm", label: "Last.fm", color: "#d51007", url: `https://www.last.fm/search/artists?q=${q}` },
    { id: "musicbrainz", label: "MusicBrainz", color: "#ba478f", url: `https://musicbrainz.org/search?query=${q}&type=artist` },
    { id: "discogs", label: "Discogs", color: "#e5e5e5", url: `https://www.discogs.com/search/?q=${q}&type=artist` },
    { id: "shazam", label: "Shazam", color: "#0088ff", url: `https://www.shazam.com/search/${q}` },
    { id: "songkick", label: "Songkick", color: "#f80046", url: `https://www.songkick.com/search?query=${q}` },
  ];
}

/** Direct Spotify profile + Genius search for every profile in the catalog. */
export function spotifyGeniusLinks(mains: Main[]): Dsp[] {
  return [
    ...mains.map((m) => ({ id: `sp-${m.id}`, label: `Spotify · ${m.name}`, color: "#1DB954", url: `https://open.spotify.com/artist/${m.id}` })),
    ...mains.map((m) => ({ id: `gn-${m.id}`, label: `Genius · ${m.name}`, color: "#ffff64", url: `https://genius.com/search?q=${encodeURIComponent(m.name)}` })),
  ];
}

/** song.link / album.link: one page that lists every streaming service a release is on. */
export function allPlatformsUrl(r: Pick<SiteRelease, "id" | "url">): string | null {
  const u = r.url || (r.id ? `https://open.spotify.com/album/${r.id}` : "");
  return /^https:\/\/open\.spotify\.com\//.test(u) ? `https://song.link/${u}` : null;
}

/** Profile pictures chosen on Nexus (win over the Spotify photo). Keyed by Spotify artist ID or handle. */
export const AVATAR_OVERRIDES: Record<string, string> = {
  "1DHWtSkA0gpJJdWz7OwwVQ": "/artist/martin.jpg",
  martin: "/artist/martin.jpg",
};

export type DiscoEntry = SiteRelease & { kind: "Album" | "EP" | "Single"; year: number | null; collaborators: { id?: string | null; name: string }[]; credited: string[] };

export function releaseKind(r: Pick<SiteRelease, "type" | "total_tracks">): "Album" | "EP" | "Single" {
  if (r.type === "album") return "Album";
  return (r.total_tracks ?? 1) >= 4 ? "EP" : "Single";
}

export type Main = { id: string; name: string };
const isMain = (a: { id?: string | null; name: string }, mains: Main[]) => mains.some((m) => (a.id ? a.id === m.id : false) || norm(a.name) === norm(m.name));

/** Exact-name match only (never a lookalike), highest popularity if Spotify has several with that exact name. */
export function pickArtistByName<T extends { id: string; name: string; popularity?: number | null }>(items: T[], wanted: string): T | null {
  const w = norm(wanted);
  const exact = items.filter((i) => i && SPOTIFY_ID.test(i.id) && norm(i.name) === w);
  return exact.sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))[0] ?? null;
}

/** Releases from several Spotify profiles as one catalog: one entry per Spotify release id. */
export function mergeCatalogs(lists: SiteRelease[][]): SiteRelease[] {
  const seen = new Set<string>();
  const out: SiteRelease[] = [];
  for (const l of lists) for (const r of l) if (r?.id && !seen.has(r.id)) { seen.add(r.id); out.push(r); }
  return out;
}

/** Every release (all years), newest first, one row per title, with the other artists credited on it. */
export function discography(list: SiteRelease[], mains: Main[]): { albums: DiscoEntry[]; eps: DiscoEntry[]; singles: DiscoEntry[] } {
  const seen = new Set<string>();
  const rows: DiscoEntry[] = [...list]
    .filter((r) => r && r.name && (!r.type || r.type === "single" || r.type === "album"))
    .sort((a, b) => String(b.release_date).localeCompare(String(a.release_date)))
    .map((r) => ({ ...r, kind: releaseKind(r), year: releaseYear(r.release_date), collaborators: (r.artists ?? []).filter((a) => a?.name && !isMain(a, mains)), credited: (r.artists ?? []).filter((a) => a?.name && isMain(a, mains)).map((a) => a.name) }))
    .filter((r) => {
      const key = `${r.kind}:${norm(r.name)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  return { albums: rows.filter((r) => r.kind === "Album"), eps: rows.filter((r) => r.kind === "EP"), singles: rows.filter((r) => r.kind === "Single") };
}

export type Collab = { id?: string | null; name: string; works: { title: string; year: number | null }[] };

/** Other artists credited on releases or tracks, most frequent first. */
export function collaborations(list: SiteRelease[], tracks: NonNullable<ArtistSiteData["tracks"]>, mains: Main[]): Collab[] {
  const map = new Map<string, Collab>();
  const add = (a: { id?: string | null; name: string }, title: string, year: number | null) => {
    const key = norm(a.name);
    if (!key) return;
    const c = map.get(key) ?? { id: a.id ?? null, name: a.name, works: [] };
    if (!c.id && a.id) c.id = a.id;
    if (!c.works.some((w) => norm(w.title) === norm(title))) c.works.push({ title, year });
    map.set(key, c);
  };
  for (const r of list) for (const a of r.artists ?? []) if (a?.name && !isMain(a, mains)) add(a, r.name, releaseYear(r.release_date));
  for (const t of tracks) for (const a of t.artists ?? []) if (a?.name && !isMain(a, mains)) add(a, t.name, releaseYear(t.album?.release_date));
  return [...map.values()].sort((x, y) => y.works.length - x.works.length || x.name.localeCompare(y.name));
}

/** Where to reach Martin. Wikipedia and IMDb open a search for "qyopy" (a search never 404s). */
export const MARTIN_CONTACTS: Dsp[] = [
  { id: "instagram", label: "Instagram @qyopyprod", color: "#ff2d95", url: "https://instagram.com/qyopyprod" },
  { id: "tiktok", label: "TikTok @qyopy", color: "#25f4ee", url: "https://tiktok.com/@qyopy" },
  { id: "youtube", label: "YouTube @qyopyproductions", color: "#ff3d3d", url: "https://youtube.com/@qyopyproductions" },
  { id: "x", label: "X @qyopyprod", color: "#ffffff", url: "https://x.com/qyopyprod" },
  { id: "telegram", label: "Telegram @qyopy", color: "#2aabee", url: "https://t.me/qyopy" },
  { id: "wikipedia", label: "Wikipedia · qyopy", color: "#e5e5e5", url: "https://en.wikipedia.org/wiki/Special:Search?search=qyopy" },
  { id: "imdb", label: "IMDb · qyopy", color: "#f5c518", url: "https://www.imdb.com/find/?q=qyopy" },
  { id: "email", label: "Business & collabs", color: "#ff3b4e", url: "mailto:member@qyopy.com" },
];

/** Artist sites that work at /bio/<handle> even before the artist has a Nexus artist page row. */
export const BUILTIN_ARTISTS: Record<string, { spotify_id: string; name: string; bio: string; verified: boolean; contacts?: Dsp[]; featured?: string; featuredTrackId?: string; alsoIds?: string[] }> = {
  martin: { spotify_id: "1DHWtSkA0gpJJdWz7OwwVQ", name: "Martin", bio: "Artist from Hungary. New music out now.", verified: true, contacts: MARTIN_CONTACTS, featured: "Montagem Bolume", featuredTrackId: "3LdtMt5vCRlP9n5TEktnBv", alsoIds: ["13E8SUWeA0daX8fiOUbKuv", "3dwpWcus9GuxTGeNKXxWGm"] },
};

const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/;
const norm = (t: string) => t.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();

type EmbedTrack = { id?: string | null; name: string };

/** Spotify embed for a featured song: the track itself if the artist's tracks list it, else a release with that
 *  title (a single's page plays the song), else the artist's own player (their top tracks). Returns embed path + title. */
export function pickEmbed(featured: string | undefined, tracks: EmbedTrack[], releases: SiteRelease[], artistId: string, featuredId?: string): { path: string; title: string | null } | null {
  if (featuredId && SPOTIFY_ID.test(featuredId)) return { path: `track/${featuredId}`, title: featured ?? null };
  if (featured) {
    const want = norm(featured);
    const t = tracks.find((x) => x.id && SPOTIFY_ID.test(x.id) && norm(x.name) === want) ?? tracks.find((x) => x.id && SPOTIFY_ID.test(x.id) && norm(x.name).includes(want));
    if (t?.id) return { path: `track/${t.id}`, title: t.name };
    const r = releases.find((x) => SPOTIFY_ID.test(x.id) && norm(x.name) === want) ?? releases.find((x) => SPOTIFY_ID.test(x.id) && norm(x.name).includes(want));
    if (r) return { path: `album/${r.id}`, title: r.name };
  }
  return SPOTIFY_ID.test(artistId) ? { path: `artist/${artistId}`, title: null } : null;
}

/** Snow, and the share button. Plain JS in the page (no framework). */
const CLIENT_JS = `(function(){
var toast=document.getElementById('toast');
function say(t){toast.textContent=t;toast.classList.add('on');clearTimeout(say.t);say.t=setTimeout(function(){toast.classList.remove('on')},2200)}
var sb=document.getElementById('share');
if(sb)sb.addEventListener('click',function(){
  var url=location.href.split('#')[0];
  function copy(){
    if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(url).then(function(){say('Link copied')},fallback)}else fallback()
  }
  function fallback(){var a=document.createElement('textarea');a.value=url;a.style.position='fixed';a.style.opacity='0';document.body.appendChild(a);a.select();try{document.execCommand('copy');say('Link copied')}catch(e){say(url)}a.remove()}
  if(navigator.share){navigator.share({title:document.title,url:url}).catch(function(e){if(!e||e.name!=='AbortError')copy()})}else copy()
});
var c=document.getElementById('snow');
if(!c||(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches))return;
var x=c.getContext('2d'),W=0,H=0,dpr=Math.min(window.devicePixelRatio||1,2),f=[],run=true;
function size(){W=innerWidth;H=innerHeight;c.width=W*dpr;c.height=H*dpr;c.style.width=W+'px';c.style.height=H+'px';x.setTransform(dpr,0,0,dpr,0,0);
  var n=Math.min(180,Math.round(W*H/9000));while(f.length<n)f.push(mk(true));f.length=n}
function mk(any){var r=Math.random();return{x:Math.random()*W,y:any?Math.random()*H:-10,r:.8+r*2.6,v:.35+r*1.1,d:Math.random()*6.28,w:.4+Math.random()*.9,o:.35+r*.55}}
function tick(){if(!run)return;x.clearRect(0,0,W,H);
  for(var i=0;i<f.length;i++){var p=f[i];p.y+=p.v;p.d+=.012;p.x+=Math.sin(p.d)*p.w*.6;
    if(p.y>H+6){f[i]=mk(false);f[i].x=Math.random()*W;continue}if(p.x>W+6)p.x=-6;if(p.x<-6)p.x=W+6;
    x.beginPath();x.fillStyle='rgba(255,255,255,'+p.o+')';x.arc(p.x,p.y,p.r,0,6.283);x.fill()}
  requestAnimationFrame(tick)}
addEventListener('resize',size);
document.addEventListener('visibilitychange',function(){run=!document.hidden;if(run)requestAnimationFrame(tick)});
size();tick();
})();`;

const CHECK = `<svg class="vcheck" viewBox="0 0 24 24" fill="#4cb3ff" role="img" aria-label="Verified"><path d="M12 1.5l2.6 2 3.2-.3 1 3.1 2.8 1.6-1 3.1 1 3.1-2.8 1.6-1 3.1-3.2-.3-2.6 2-2.6-2-3.2.3-1-3.1L1.4 14l1-3.1-1-3.1 2.8-1.6 1-3.1 3.2.3z"/><path d="M8 12.2l2.7 2.7L16.4 9" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const safe = (u: string | null | undefined) => (u && /^https:\/\//i.test(u) ? u : "");
const safeContact = (u: string) => (/^(https:\/\/|mailto:)/i.test(u) ? u : "");

function prettyDate(d: string): string {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(d);
  if (!m) return d;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const mo = months[Number(m[2]) - 1] ?? "";
  return m[3] ? `${mo} ${Number(m[3])}, ${m[1]}` : `${mo} ${m[1]}`;
}

export function renderArtistSite(data: ArtistSiteData, origin: string): string {
  const { artist, verified, year } = data;
  const releases = thisYearReleases(data.releases, year);
  const name = artist.name;
  const spotify = safe(artist.url);
  const title = `${name}${verified ? " ✓" : ""} · Official site`;
  const desc = truncate(data.bio || `${name} — new music from ${year}. Listen on Spotify, Apple Music, YouTube Music and more.`);
  const pageUrl = `${origin}/bio/artist/${esc(data.handle || artist.id)}`;
  const own = AVATAR_OVERRIDES[artist.id] ?? (data.handle ? AVATAR_OVERRIDES[data.handle] : undefined);
  const image = own ? `${origin}${own}` : safe(artist.image);
  const hero = releases[0];
  const mains: Main[] = [{ id: artist.id, name }, ...(data.aliases ?? [])];
  const disco = discography(data.releases, mains);
  const collabs = collaborations(data.releases, data.tracks ?? [], mains);
  const mention = (a: { id?: string | null; name: string }) =>
    a.id && SPOTIFY_ID.test(a.id)
      ? `<a class="mention" href="https://open.spotify.com/artist/${esc(a.id)}" target="_blank" rel="noopener noreferrer"><mark>${esc(a.name)}</mark></a>`
      : `<mark class="mention">${esc(a.name)}</mark>`;
  const discoTable = (title: string, rows: DiscoEntry[]) =>
    rows.length
      ? `<h3>${title}</h3><div class="tw"><table class="wikitable"><thead><tr><th>Title</th><th>Year</th><th>Details</th><th>Collaborators</th></tr></thead><tbody>${rows
          .map(
            (r) =>
              `<tr><td>${safe(r.url) ? `<a href="${esc(safe(r.url))}" target="_blank" rel="noopener noreferrer">&ldquo;${esc(r.name)}&rdquo;</a>` : `&ldquo;${esc(r.name)}&rdquo;`}<br><small><a href="https://genius.com/search?q=${encodeURIComponent(`${name} ${r.name}`)}" target="_blank" rel="noopener noreferrer">Lyrics</a></small></td><td>${r.year ?? "&ndash;"}</td><td>${r.kind}${r.total_tracks && r.total_tracks > 1 ? `, ${r.total_tracks} tracks` : ""}${r.release_date.length > 4 ? ` &middot; ${esc(prettyDate(r.release_date))}` : ""}${r.credited.some((c) => norm(c) !== norm(name)) ? `<br><small>as ${esc(r.credited.filter((c) => norm(c) !== norm(name)).join(", "))}</small>` : ""}</td><td>${r.collaborators.length ? r.collaborators.map(mention).join(", ") : "&ndash;"}</td></tr>`,
          )
          .join("")}</tbody></table></div>`
      : "";
  const total = disco.albums.length + disco.eps.length + disco.singles.length;
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const wikiHtml = total
    ? `<section class="wiki"><h2 class="wh">Discography</h2><p class="lead"><b>${esc(name)}</b> has ${[disco.albums.length ? plural(disco.albums.length, "album") : "", disco.eps.length ? plural(disco.eps.length, "EP") : "", disco.singles.length ? plural(disco.singles.length, "single") : ""].filter(Boolean).join(", ")} on Spotify${mains.length > 1 ? ` under ${mains.map((m) => esc(m.name)).join(", ")}` : ""}.</p>${discoTable("Albums", disco.albums)}${discoTable("EPs", disco.eps)}${discoTable("Singles", disco.singles)}${
        collabs.length
          ? `<h2 class="wh">Collaborations</h2><ul class="collabs">${collabs.map((c) => `<li>${mention(c)} &mdash; ${c.works.map((w) => `<i>&ldquo;${esc(w.title)}&rdquo;</i>${w.year ? ` (${w.year})` : ""}`).join(", ")}</li>`).join("")}</ul>`
          : ""
      }</section>`
    : "";
  const embedPath = data.embed && /^(track|album|artist)\/[A-Za-z0-9]{22}$/.test(data.embed) ? data.embed : null;
  const embedUrl = embedPath ? `https://open.spotify.com/embed/${embedPath}?utm_source=generator&theme=0` : null;
  const embedHeight = embedPath?.startsWith("track/") ? 152 : 352;

  const av = image ? `<img class="av" src="${esc(image)}" alt="${esc(name)}">` : `<div class="av ph">${esc(name.slice(0, 2).toUpperCase())}</div>`;
  const cards = releases
    .map((r, i) => {
      const all = allPlatformsUrl(r);
      const cover = safe(r.image) ? `<img src="${esc(safe(r.image))}" alt="${esc(r.name)} cover" loading="lazy">` : `<div class="cv ph">♪</div>`;
      return `<article class="rel" style="--i:${i}">${cover}<div class="meta"><h3>${esc(r.name)}</h3><p>${esc(r.type === "album" ? "Album" : "Single")} · ${esc(prettyDate(r.release_date))}${r.total_tracks && r.total_tracks > 1 ? ` · ${r.total_tracks} tracks` : ""}</p>
<div class="btns">${safe(r.url) ? `<a class="b main" href="${esc(safe(r.url))}" target="_blank" rel="noopener noreferrer">Play on Spotify</a>` : ""}${all ? `<a class="b" href="${esc(all)}" target="_blank" rel="noopener noreferrer">All platforms</a>` : ""}</div></div></article>`;
    })
    .join("");
  const chips = (list: Dsp[]) =>
    list
      .filter((d) => safeContact(d.url))
      .map((d, i) => {
        const name = d.label;
        return `<a class="chip" style="--i:${i};--c:${esc(d.color)}" href="${esc(safeContact(d.url))}" target="_blank" rel="noopener noreferrer"><span class="lt" aria-hidden="true">${esc(name.charAt(0).toUpperCase())}</span><span class="nm">${esc(name)}</span></a>`;
      })
      .join("");

  const ld = jsonLd({
    "@context": "https://schema.org",
    "@type": "MusicGroup",
    name,
    url: pageUrl,
    ...(image ? { image } : {}),
    ...(spotify ? { sameAs: [spotify] } : {}),
    ...(hero ? { track: releases.slice(0, 10).map((r) => ({ "@type": "MusicRecording", name: r.name, datePublished: r.release_date })) } : {}),
  });

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:type" content="profile">${image ? `<meta property="og:image" content="${esc(image)}">` : ""}
<meta name="theme-color" content="#07060f"><link rel="icon" href="/icon.png">${ld}
<style>
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Permanent+Marker&family=Space+Grotesk:wght@500;700&display=swap');
*{box-sizing:border-box;margin:0}
:root{--card:rgba(120,10,24,.24);--text:#fff5f5;--mut:#d9a0a6;--acc:#ff3b4e;--glow:#ff1f35}
html,body{min-height:100%;background:#000}
body{background:radial-gradient(ellipse at 50% 0%,#5c0a14 0%,#1a0206 45%,#000 100%);color:var(--text);font:15px/1.5 "Space Grotesk",system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased;overflow-x:hidden}
.fx{position:fixed;inset:0;pointer-events:none;z-index:0;display:grid;grid-template-columns:repeat(3,1fr);place-items:center;opacity:.07;font:900 18vw/1 "Bebas Neue",sans-serif;letter-spacing:.04em;color:var(--acc)}
.fx span{animation:float 8s ease-in-out infinite}
.fx span:nth-child(2){animation-delay:1s}.fx span:nth-child(3){animation-delay:2s}.fx span:nth-child(4){animation-delay:1.5s}.fx span:nth-child(5){animation-delay:2.5s}
.wm{position:fixed;right:12px;bottom:10px;z-index:2;font:900 64px/1 "Bebas Neue",sans-serif;color:var(--acc);opacity:.12;pointer-events:none;letter-spacing:.06em}
.wrap{position:relative;z-index:1;max-width:880px;margin:0 auto;padding:36px 18px 72px}
header{display:flex;flex-direction:column;align-items:center;text-align:center;gap:10px}
.avw{position:relative;width:140px;height:140px;animation:rise .7s both}
.avw:before,.avw:after{content:"";position:absolute;inset:-6px;border-radius:50%;border:2px solid var(--acc);opacity:.0;animation:ring 3.2s ease-out infinite}
.avw:after{animation-delay:1.6s}
.av{width:140px;height:140px;border-radius:50%;object-fit:cover;display:grid;place-items:center;box-shadow:0 0 0 3px #ff3b4e88,0 12px 50px #ff1f3599}
.ph{background:#ff3b4e33;font-size:44px;font-weight:900}
.tag{font:700 12px/1 "Space Grotesk",sans-serif;color:#ffd6d9;letter-spacing:.2em;text-transform:uppercase;animation:rise .7s .1s both}
h1{margin-top:4px;display:flex;align-items:center;gap:14px;justify-content:center;isolation:isolate}
.ttlw{position:relative;display:inline-block;padding:0 .08em;animation:titleIn 1s .1s cubic-bezier(.2,.8,.2,1) both}
.ttlw:after{content:"";position:absolute;left:-3%;right:-3%;bottom:.1em;height:.26em;border-radius:3px;background:linear-gradient(90deg,transparent,#ff1f35 18%,#ff3b4e 50%,#ff1f35 82%,transparent);z-index:-1;transform-origin:left center;animation:hl 1s .7s cubic-bezier(.2,.8,.2,1) both,hlGlow 3s 1.7s ease-in-out infinite}
.ttl{display:inline-block;font:400 clamp(64px,19vw,128px)/.95 "Bebas Neue","Arial Narrow",sans-serif;letter-spacing:.07em;text-transform:uppercase;background:linear-gradient(105deg,#fff 0%,#fff 38%,#8e949b 46%,#fff 50%,#b8bcc2 54%,#fff 62%,#fff 100%);background-size:260% 100%;-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;animation:shine 3.4s linear infinite,halo 3.2s ease-in-out infinite}
.vcheck{width:clamp(30px,6vw,52px);height:clamp(30px,6vw,52px);flex:none;filter:drop-shadow(0 0 10px #4cb3ffaa);animation:pop .6s .7s both}
.bio{color:var(--mut);max-width:560px;animation:rise .7s .25s both}
.cta{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;margin-top:8px;animation:rise .7s .35s both}
.b{display:inline-flex;align-items:center;padding:10px 18px;border-radius:999px;background:transparent;color:var(--text);text-decoration:none;font-weight:700;font-size:14px;box-shadow:inset 0 0 0 1px var(--acc);transition:transform .18s,box-shadow .18s,background .18s}
.b.main{background:#fff;color:#12040a;box-shadow:0 0 22px #ffffff33}
.b:hover{transform:translateY(-2px) scale(1.03);box-shadow:inset 0 0 0 1px var(--acc),0 6px 24px #ff1f3566}
.b.main:hover{box-shadow:0 6px 28px #ff1f3599}
h2{font:400 20px/1 "Bebas Neue",sans-serif;letter-spacing:.2em;text-transform:uppercase;color:var(--mut);margin:42px 0 14px;display:flex;align-items:center;gap:12px}
h2:after{content:"";flex:1;height:1px;background:linear-gradient(90deg,#ff3b4e66,transparent)}
h2 em{font-style:normal;color:#fff;text-shadow:0 0 14px var(--glow)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px}
.rel{display:flex;gap:12px;padding:12px;border-radius:18px;background:var(--card);box-shadow:inset 0 0 0 1px rgba(255,59,78,.3);backdrop-filter:blur(6px);transition:transform .2s,box-shadow .2s;animation:rise .6s both;animation-delay:calc(var(--i) * 90ms + .45s)}
.rel:hover{transform:translateY(-4px);box-shadow:inset 0 0 0 1px var(--acc),0 10px 36px #ff1f3555}
.rel img,.cv{width:92px;height:92px;border-radius:12px;object-fit:cover;flex:none}
.cv{font-size:30px;display:grid;place-items:center;background:#ff3b4e22}
.meta{min-width:0;display:flex;flex-direction:column;gap:2px}
.meta h3{font-size:17px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.meta p{font-size:12.5px;color:var(--mut)}
.btns{display:flex;gap:6px;flex-wrap:wrap;margin-top:auto}
.btns .b{padding:6px 11px;font-size:12px}
.soon{padding:26px;border-radius:18px;background:var(--card);color:var(--mut);text-align:center;box-shadow:inset 0 0 0 1px rgba(255,59,78,.3)}
.chips{display:flex;flex-wrap:wrap;gap:8px}
.chip{display:inline-flex;align-items:center;gap:8px;padding:9px 14px;border-radius:999px;background:var(--card);color:var(--text);text-decoration:none;font-weight:600;font-size:14px;box-shadow:inset 0 0 0 1px rgba(255,59,78,.3);transition:transform .18s,background .18s,box-shadow .18s;animation:rise .5s both;animation-delay:calc(var(--i) * 40ms + .6s)}
.chip{padding:7px 16px 7px 7px;gap:10px}
.lt{display:grid;place-items:center;flex:none;width:34px;height:34px;border-radius:10px;background:color-mix(in srgb,var(--c) 18%,#000);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--c) 55%,transparent);color:var(--c);font:400 24px/1 "Bebas Neue",sans-serif;letter-spacing:.02em}
.nm{font-weight:700;letter-spacing:.01em}
.chip:hover .lt{background:var(--c);color:#0a0204}
.chip:hover{transform:translateY(-2px);background:rgba(255,31,53,.3);box-shadow:inset 0 0 0 1px var(--acc),0 6px 20px #ff1f3555}
.wiki{margin-top:42px;padding:6px 22px 20px;border-radius:18px;background:rgba(0,0,0,.42);box-shadow:inset 0 0 0 1px rgba(255,59,78,.25);font-family:"Linux Libertine","Georgia","Times New Roman",serif;font-size:16px;line-height:1.6}
.wiki .wh{font:400 28px/1.2 "Linux Libertine","Georgia","Times New Roman",serif;letter-spacing:0;text-transform:none;color:#fff;margin:22px 0 12px;padding-bottom:4px;border-bottom:1px solid rgba(255,255,255,.28);display:block}
.wiki .wh:after{display:none}
.wiki h3{font:700 19px/1.3 "Linux Libertine","Georgia",serif;margin:18px 0 8px;color:#fff}
.wiki .lead{color:#eadadc}
.wiki a{color:#8ab4ff;text-decoration:none}
.wiki a:hover{text-decoration:underline}
.tw{overflow-x:auto}
.wikitable{border-collapse:collapse;width:100%;font-size:14.5px;background:rgba(20,2,6,.6)}
.wikitable th,.wikitable td{border:1px solid rgba(255,255,255,.2);padding:6px 10px;text-align:left;vertical-align:top}
.wikitable th{background:#3a0d14;color:#fff;font-weight:700}
.wikitable tbody tr:hover{background:rgba(255,59,78,.09)}
mark{background:linear-gradient(transparent 6%,rgba(255,59,78,.42) 6% 94%,transparent 94%);color:#fff;padding:0 .22em;border-radius:3px}
.wiki a.mention{color:#fff}
.wiki a.mention:hover mark{background:rgba(255,59,78,.75)}
.wiki small{color:var(--mut)}
.collabs{margin:0 0 6px 22px}
.collabs li{margin:4px 0}
.snow{position:fixed;inset:0;z-index:1;pointer-events:none}
.views{display:inline-flex;align-items:center;gap:7px;margin-top:4px;padding:6px 14px;border-radius:999px;font-size:13px;color:var(--mut);background:rgba(0,0,0,.35);box-shadow:inset 0 0 0 1px rgba(255,59,78,.3);animation:rise .7s .45s both}
.views b{color:#fff;font-variant-numeric:tabular-nums}
.player{border-radius:16px;overflow:hidden;box-shadow:0 10px 40px #ff1f3533,inset 0 0 0 1px rgba(255,59,78,.3);animation:rise .7s both}
.player iframe{display:block;border:0;border-radius:14px}
.b svg{margin-right:8px}
.toast{position:fixed;left:50%;bottom:28px;z-index:5;transform:translate(-50%,20px);padding:10px 18px;border-radius:999px;background:#fff;color:#12040a;font-weight:700;font-size:14px;opacity:0;pointer-events:none;transition:opacity .25s,transform .25s}
.toast.on{opacity:1;transform:translate(-50%,0)}
footer{margin-top:56px;text-align:center;color:var(--mut);font-size:12px}
footer p+p{margin-top:6px;opacity:.7}
.love{font-size:14px;color:var(--text)}
.love a{font-weight:700;text-decoration:none;border-bottom:1px solid #ff3b4e}
.heart{color:#ff3b4e;display:inline-block;animation:beat 1.4s ease-in-out infinite}
footer a{color:#fff}
@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-18px)}}
@keyframes rise{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}
@keyframes pop{0%{opacity:0;transform:scale(.2) rotate(-30deg)}70%{transform:scale(1.25) rotate(6deg)}100%{opacity:1;transform:none}}
@keyframes ring{0%{opacity:.7;transform:scale(1)}100%{opacity:0;transform:scale(1.5)}}
@keyframes titleIn{from{opacity:0;letter-spacing:.35em;filter:blur(14px)}to{opacity:1;filter:none}}
@keyframes hl{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes hlGlow{0%,100%{opacity:.75;filter:blur(0)}50%{opacity:1;filter:blur(1.5px)}}
@keyframes beat{0%,100%{transform:scale(1)}15%{transform:scale(1.3)}30%{transform:scale(1)}45%{transform:scale(1.2)}}
@keyframes shine{from{background-position:130% 0}to{background-position:-130% 0}}
@keyframes halo{0%,100%{filter:drop-shadow(0 0 10px #ffffff66) drop-shadow(0 0 28px #ff1f3577)}50%{filter:drop-shadow(0 0 16px #ffffffaa) drop-shadow(0 0 44px #ff1f35aa)}}
@media (prefers-reduced-motion:reduce){*,*:before,*:after{animation:none!important;transition:none!important}}
</style></head><body><canvas class="snow" id="snow" aria-hidden="true"></canvas><div class="fx" aria-hidden="true"><span>999</span><span>999</span><span>999</span><span>999</span><span>999</span><span>999</span></div><div class="wm" aria-hidden="true">999</div><div class="wrap">
<header><div class="avw">${av}</div>
${verified ? `<div class="tag">Verified artist</div>` : ""}
<h1><span class="ttlw"><span class="ttl">${esc(name)}</span></span>${verified ? CHECK : ""}</h1>
${data.bio ? `<p class="bio">${esc(data.bio)}</p>` : ""}
<div class="cta">${spotify ? `<a class="b main" href="${esc(spotify)}" target="_blank" rel="noopener noreferrer">Follow on Spotify</a>` : ""}<button class="b" id="share" type="button"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7M16 6l-4-4-4 4M12 2v14"/></svg>Share</button></div>
${typeof data.views === "number" ? `<div class="views" title="Page views"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg><b>${data.views.toLocaleString("en-US")}</b> ${data.views === 1 ? "view" : "views"}</div>` : ""}
</header>
${embedUrl ? `<h2>Listen <em>now</em>${data.embedTitle ? ` · ${esc(data.embedTitle)}` : ""}</h2><div class="player"><iframe src="${esc(embedUrl)}" width="100%" height="${embedHeight}" frameborder="0" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy" title="Spotify player"></iframe></div>` : ""}
<h2>New in <em>${year}</em></h2>
${releases.length ? `<div class="grid">${cards}</div>` : `<div class="soon">New music is on the way. Follow ${esc(name)} on Spotify to hear it first.</div>`}
${wikiHtml}
<h2>Listen everywhere</h2><div class="chips">${chips(dspLinks(name, spotify))}</div>
${data.contacts?.length ? `<h2>Connect &amp; contact</h2><div class="chips">${chips(data.contacts)}</div>` : ""}
<h2>Search on <em>Spotify</em> &amp; <em>Genius</em></h2><div class="chips">${chips(spotifyGeniusLinks(mains))}</div>
<h2>More sources</h2><div class="chips">${chips(sourceLinks(name))}</div>
<footer><p class="love">Made with <span class="heart" aria-label="love">&#10084;</span> by <a href="${esc(origin)}">Nexus Project</a></p><p>Only ${year} releases are shown, and the list updates by itself.</p></footer>
</div><div class="toast" id="toast" role="status" aria-live="polite"></div>
<script>${CLIENT_JS}</script></body></html>`;
}

export function artistSiteNotFound(origin: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Artist not found</title></head><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#07060f;color:#f4f2ff;font:15px system-ui;text-align:center;padding:24px"><div><h1>Artist not found</h1><p style="color:#a9a3c9;margin-top:8px">Check the Spotify artist link or handle.</p><p style="margin-top:16px"><a style="color:#8b5cff" href="${esc(origin)}">Back to Nexus</a></p></div></body></html>`;
}
