// dsp-scan — turn an ISRC, UPC/EAN, Spotify URI/URL, any DSP link or "artist - title"
// into every streaming-platform link we can find. Public, key-free sources only:
// Deezer, iTunes, Spotify oEmbed and Odesli (song.link). Safe to call anonymously.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Link = { platform: string; label: string; url: string };
type Meta = {
  type: "track" | "album";
  title?: string;
  artist?: string;
  artwork?: string;
  isrc?: string;
  upc?: string;
  release_date?: string;
  seed?: string;
  links: Link[];
};

const LABELS: Record<string, string> = {
  spotify: "Spotify",
  appleMusic: "Apple Music",
  itunes: "iTunes",
  youtubeMusic: "YouTube Music",
  youtube: "YouTube",
  deezer: "Deezer",
  tidal: "TIDAL",
  amazonMusic: "Amazon Music",
  amazonStore: "Amazon Store",
  soundcloud: "SoundCloud",
  pandora: "Pandora",
  napster: "Napster",
  anghami: "Anghami",
  boomplay: "Boomplay",
  audiomack: "Audiomack",
  audius: "Audius",
  yandex: "Yandex Music",
};
const ORDER = Object.keys(LABELS);

const HOSTS = [
  "open.spotify.com", "spotify.link", "music.apple.com", "itunes.apple.com", "geo.music.apple.com",
  "youtube.com", "www.youtube.com", "music.youtube.com", "youtu.be", "deezer.com", "www.deezer.com",
  "deezer.page.link", "tidal.com", "listen.tidal.com", "music.amazon.com", "amazon.com", "www.amazon.com",
  "soundcloud.com", "www.soundcloud.com", "pandora.com", "www.pandora.com", "napster.com", "play.napster.com",
  "play.anghami.com", "boomplay.com", "www.boomplay.com", "audiomack.com", "www.audiomack.com", "audius.co",
  "music.yandex.com", "music.yandex.ru", "song.link", "album.link", "odesli.co",
];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

let lastStatus = 0;
async function getJson(url: string, ms = 7000): Promise<any | null> {
  try {
    const r = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; NexusPresave/1.0; +https://nexusproject.cc)" },
      signal: AbortSignal.timeout(ms),
    });
    lastStatus = r.status;
    if (!r.ok) return null;
    return await r.json();
  } catch {
    lastStatus = -1;
    return null;
  }
}

type Kind = "isrc" | "upc" | "url" | "text";
function classify(raw: string): { kind: Kind; value: string } {
  const q = raw.trim().slice(0, 300);
  const uri = q.match(/^spotify:(track|album|episode):([A-Za-z0-9]{22})$/);
  if (uri) return { kind: "url", value: `https://open.spotify.com/${uri[1]}/${uri[2]}` };
  if (/^https?:\/\//i.test(q)) {
    try {
      const u = new URL(q);
      if (u.protocol === "https:" || u.protocol === "http:") {
        if (HOSTS.includes(u.hostname.toLowerCase())) return { kind: "url", value: u.href };
      }
    } catch { /* fallthrough */ }
    return { kind: "text", value: "" };
  }
  const compact = q.replace(/^(isrc|upc|ean)\s*[:=]?\s*/i, "").replace(/[\s-]/g, "").toUpperCase();
  if (/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(compact)) return { kind: "isrc", value: compact };
  if (/^\d{12,14}$/.test(compact)) return { kind: "upc", value: compact };
  return { kind: "text", value: q };
}

const big = (u?: string) => (u ? u.replace(/\/\d+x\d+(bb)?\./, "/800x800bb.") : undefined);

async function deezerTrack(path: string): Promise<Meta | null> {
  const t = await getJson(`https://api.deezer.com/track/${path}`);
  if (!t || t.error || !t.link) return null;
  const meta: Meta = {
    type: "track",
    title: t.title,
    artist: t.artist?.name,
    artwork: t.album?.cover_xl || t.album?.cover_big,
    isrc: t.isrc,
    release_date: t.release_date,
    seed: t.link.split("?")[0],
    links: [{ platform: "deezer", label: LABELS.deezer, url: t.link.split("?")[0] }],
  };
  if (t.album?.id) {
    const a = await getJson(`https://api.deezer.com/album/${t.album.id}`);
    if (a?.upc) meta.upc = a.upc;
  }
  return meta;
}

async function deezerAlbum(path: string): Promise<Meta | null> {
  const a = await getJson(`https://api.deezer.com/album/${path}`);
  if (!a || a.error || !a.link) return null;
  return {
    type: "album",
    title: a.title,
    artist: a.artist?.name,
    artwork: a.cover_xl || a.cover_big,
    upc: a.upc,
    release_date: a.release_date,
    seed: a.link.split("?")[0],
    links: [{ platform: "deezer", label: LABELS.deezer, url: a.link.split("?")[0] }],
  };
}

async function itunesUpc(code: string): Promise<Meta | null> {
  const j = await getJson(`https://itunes.apple.com/lookup?upc=${code}&entity=album&country=US`);
  const r = j?.results?.find((x: any) => x.collectionViewUrl);
  if (!r) return null;
  const url = String(r.collectionViewUrl).split("?")[0];
  return {
    type: "album",
    title: r.collectionName,
    artist: r.artistName,
    artwork: big(r.artworkUrl100),
    upc: code,
    release_date: r.releaseDate?.slice(0, 10),
    seed: url,
    links: [{ platform: "appleMusic", label: LABELS.appleMusic, url }],
  };
}

async function odesli(url: string) {
  const key = Deno.env.get("ODESLI_API_KEY");
  if (!key) return null; // song.link now requires a key; skip the wasted round-trip without one
  const api = `https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent(url)}&userCountry=US&key=${key}`;
  let j = await getJson(api, 9000);
  if (!j && lastStatus === 429) {
    await new Promise((r) => setTimeout(r, 1500));
    j = await getJson(api, 9000);
  }
  if (!j?.linksByPlatform) return null;
  const ent = j.entitiesByUniqueId?.[j.entityUniqueId] ?? {};
  const links: Link[] = ORDER.filter((p) => j.linksByPlatform[p]?.url).map((p) => ({
    platform: p,
    label: LABELS[p],
    url: String(j.linksByPlatform[p].url),
  }));
  return {
    title: ent.title as string | undefined,
    artist: ent.artistName as string | undefined,
    artwork: ent.thumbnailUrl as string | undefined,
    type: (ent.type === "album" ? "album" : "track") as "track" | "album",
    page: j.pageUrl as string | undefined,
    links,
  };
}

// ---- Spotify Web API (optional: needs SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET) ----
let spTok: { t: string; exp: number } | null = null;
async function spotifyToken(): Promise<string | null> {
  const id = Deno.env.get("SPOTIFY_CLIENT_ID");
  const sec = Deno.env.get("SPOTIFY_CLIENT_SECRET");
  if (!id || !sec) return null;
  if (spTok && spTok.exp > Date.now() + 30_000) return spTok.t;
  try {
    const r = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { Authorization: "Basic " + btoa(`${id}:${sec}`), "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) return null;
    const j = await r.json();
    spTok = { t: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 };
    return spTok.t;
  } catch {
    return null;
  }
}
async function spGet(path: string): Promise<any | null> {
  const t = await spotifyToken();
  if (!t) return null;
  try {
    const r = await fetch(`https://api.spotify.com/v1/${path}`, { headers: { Authorization: `Bearer ${t}` }, signal: AbortSignal.timeout(7000) });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}
function fromSpotifyTrack(t: any): Meta {
  const url = t.external_urls?.spotify as string;
  return {
    type: "track",
    title: t.name,
    artist: (t.artists ?? []).map((a: any) => a.name).join(", "),
    artwork: t.album?.images?.[0]?.url,
    isrc: t.external_ids?.isrc,
    release_date: t.album?.release_date,
    seed: url,
    links: url ? [{ platform: "spotify", label: LABELS.spotify, url }] : [],
  };
}
function fromSpotifyAlbum(a: any): Meta {
  const url = a.external_urls?.spotify as string;
  return {
    type: "album",
    title: a.name,
    artist: (a.artists ?? []).map((x: any) => x.name).join(", "),
    artwork: a.images?.[0]?.url,
    upc: a.external_ids?.upc,
    release_date: a.release_date,
    seed: url,
    links: url ? [{ platform: "spotify", label: LABELS.spotify, url }] : [],
  };
}

const norm = (v?: string) => (v ?? "").toLowerCase().replace(/\(.*?\)|\[.*?\]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
async function appleMatch(meta: Meta): Promise<Link | null> {
  if (!meta.title) return null;
  const term = `${meta.artist ?? ""} ${meta.title}`.trim();
  const it = await getJson(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=${meta.type === "album" ? "album" : "song"}&limit=8&country=US`);
  const want = norm(meta.title);
  const who = norm(meta.artist?.split(",")[0]);
  for (const r of it?.results ?? []) {
    const name = norm(meta.type === "album" ? r.collectionName : r.trackName);
    const art = norm(r.artistName);
    const u = meta.type === "album" ? r.collectionViewUrl : r.trackViewUrl;
    if (u && name && (name === want || name.startsWith(want) || want.startsWith(name)) && (!who || art.includes(who) || who.includes(art))) {
      return { platform: "appleMusic", label: LABELS.appleMusic, url: String(u).split("?")[0] };
    }
  }
  return null;
}

async function resolveSeed(kind: Kind, value: string): Promise<Meta | null> {
  if (kind === "isrc") {
    const d = await deezerTrack(`isrc:${value}`);
    if (d) return d;
    const s = (await spGet(`search?q=isrc:${value}&type=track&limit=1`))?.tracks?.items?.[0];
    return s ? { ...fromSpotifyTrack(s), isrc: value } : null;
  }
  if (kind === "upc") {
    const d = (await deezerAlbum(`upc:${value}`)) ?? (await itunesUpc(value));
    if (d) return d;
    const s = (await spGet(`search?q=upc:${value}&type=album&limit=1`))?.albums?.items?.[0];
    return s ? { ...fromSpotifyAlbum(s), upc: value } : null;
  }
  if (kind === "url") {
    const u = new URL(value);
    const meta: Meta = { type: /\/album\//.test(u.pathname) ? "album" : "track", seed: value, links: [] };
    if (u.hostname === "open.spotify.com") {
      const m = u.pathname.match(/\/(track|album)\/([A-Za-z0-9]{22})/);
      if (m) {
        const api = await spGet(`${m[1]}s/${m[2]}`);
        if (api) return m[1] === "track" ? fromSpotifyTrack(api) : fromSpotifyAlbum(api);
        meta.type = m[1] as "track" | "album";
      }
      const o = await getJson(`https://open.spotify.com/oembed?url=${encodeURIComponent(value)}`);
      if (o) {
        meta.title = o.title;
        meta.artwork = o.thumbnail_url;
      }
      meta.links.push({ platform: "spotify", label: LABELS.spotify, url: value.split("?")[0] });
      return meta;
    }
    if (u.hostname.endsWith("deezer.com")) {
      const m = u.pathname.match(/\/(track|album)\/(\d+)/);
      if (m) return m[1] === "track" ? await deezerTrack(m[2]) : await deezerAlbum(m[2]);
    }
    if (u.hostname.endsWith("apple.com")) {
      const id = u.searchParams.get("i") ?? u.pathname.match(/\/(\d+)\/?$/)?.[1];
      const j = id ? await getJson(`https://itunes.apple.com/lookup?id=${id}&country=US`) : null;
      const r = j?.results?.[0];
      if (r) {
        const isAlbum = !r.trackName;
        return {
          type: isAlbum ? "album" : "track",
          title: isAlbum ? r.collectionName : r.trackName,
          artist: r.artistName,
          artwork: big(r.artworkUrl100),
          release_date: r.releaseDate?.slice(0, 10),
          seed: value,
          links: [{ platform: "appleMusic", label: LABELS.appleMusic, url: value.split("?")[0] }],
        };
      }
    }
    return meta;
  }
  const j = await getJson(`https://api.deezer.com/search?q=${encodeURIComponent(value)}&limit=1`);
  const id = j?.data?.[0]?.id;
  return id ? await deezerTrack(String(id)) : null;
}

const spotifyUriOf = (links: Link[]) => {
  const s = links.find((l) => l.platform === "spotify")?.url.match(/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(track|album)\/([A-Za-z0-9]{22})/);
  return s ? `spotify:${s[1]}:${s[2]}` : null;
};

const cache = new Map<string, { at: number; body: unknown }>();
const hits = new Map<string, { n: number; reset: number }>();

async function scan(query: string) {
  const { kind, value } = classify(query);
  if (!value) return { found: false, kind: "text", message: "That doesn't look like an ISRC, UPC, Spotify URI or streaming link." };
  const key = `${kind}:${value}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 600_000) return hit.body;

  const meta = await resolveSeed(kind, value);
  if (!meta) {
    return {
      found: false,
      kind,
      message:
        kind === "isrc" || kind === "upc"
          ? "Not on any streaming platform yet — normal before release day. Re-scan once it's live."
          : "Couldn't find that release. Check the link or try its ISRC/UPC.",
    };
  }

  const seen = new Map<string, Link>();
  const add = (l: Link | null) => {
    if (l && !seen.has(l.platform)) seen.set(l.platform, l);
  };
  meta.links.forEach(add);

  // 1) Odesli expands one link to every platform (only when ODESLI_API_KEY is set)
  const o = meta.seed ? await odesli(meta.seed) : null;
  if (o) {
    meta.title ||= o.title;
    meta.artist ||= o.artist;
    meta.artwork ||= o.artwork;
    meta.type = o.type;
    o.links.forEach(add);
  }

  // 2) Direct lookups by code/name on the platforms that allow it
  const dzId = seen.get("deezer")?.url.match(/deezer\.com\/(?:[a-z]{2}\/)?(track|album)\/(\d+)/);
  if (!seen.has("deezer")) {
    const d = meta.isrc && meta.type === "track" ? await deezerTrack(`isrc:${meta.isrc}`)
      : meta.upc && meta.type === "album" ? await deezerAlbum(`upc:${meta.upc}`)
      : meta.title && meta.artist
        ? await (async () => {
            const j = await getJson(`https://api.deezer.com/search/${meta.type}?q=${encodeURIComponent(`artist:"${meta.artist!.split(",")[0]}" ${meta.type === "album" ? "album" : "track"}:"${meta.title}"`)}&limit=1`);
            const id = j?.data?.[0]?.id;
            return id ? (meta.type === "album" ? await deezerAlbum(String(id)) : await deezerTrack(String(id))) : null;
          })()
        : null;
    if (d) {
      d.links.forEach(add);
      meta.isrc ||= d.isrc;
      meta.upc ||= d.upc;
    }
  } else if ((!meta.isrc || !meta.upc) && dzId) {
    const d = dzId[1] === "track" ? await deezerTrack(dzId[2]) : await deezerAlbum(dzId[2]);
    if (d) {
      meta.isrc ||= d.isrc;
      meta.upc ||= d.upc;
    }
  }
  if (!seen.has("spotify")) {
    const s = meta.isrc && meta.type === "track" ? (await spGet(`search?q=isrc:${meta.isrc}&type=track&limit=1`))?.tracks?.items?.[0]
      : meta.upc && meta.type === "album" ? (await spGet(`search?q=upc:${meta.upc}&type=album&limit=1`))?.albums?.items?.[0]
      : null;
    if (s?.external_urls?.spotify) add({ platform: "spotify", label: LABELS.spotify, url: s.external_urls.spotify });
    else if (meta.title && meta.artist) {
      // codes didn't match (different edition) — fall back to a strict name match
      const type = meta.type === "album" ? "album" : "track";
      const res = await spGet(`search?q=${encodeURIComponent(`${type}:${meta.title} artist:${meta.artist.split(",")[0]}`)}&type=${type}&limit=5`);
      const hit2 = (res?.[`${type}s`]?.items ?? []).find((x: any) =>
        norm(x.name) === norm(meta.title) && (x.artists ?? []).some((a: any) => norm(a.name) === norm(meta.artist!.split(",")[0])));
      if (hit2?.external_urls?.spotify) add({ platform: "spotify", label: LABELS.spotify, url: hit2.external_urls.spotify });
    }
  }
  if (!seen.has("appleMusic")) add(await appleMatch(meta));

  const links = ORDER.map((p) => seen.get(p)).filter(Boolean) as Link[];
  const q = encodeURIComponent(`${meta.artist ?? ""} ${meta.title ?? ""}`.trim());
  const body = {
    found: true,
    kind,
    type: meta.type,
    title: meta.title ?? null,
    artist: meta.artist ?? null,
    artwork: meta.artwork ?? null,
    isrc: meta.isrc ?? null,
    upc: meta.upc ?? null,
    release_date: meta.release_date ?? null,
    spotify_uri: spotifyUriOf(links),
    universal_link: o?.page ?? null,
    links,
    // Platforms we could not verify directly — search pages, not exact releases.
    search_links: [
      { platform: "spotify", label: "Spotify", url: `https://open.spotify.com/search/${q}` },
      { platform: "youtubeMusic", label: "YouTube Music", url: `https://music.youtube.com/search?q=${q}` },
      { platform: "tidal", label: "TIDAL", url: `https://tidal.com/search?q=${q}` },
      { platform: "amazonMusic", label: "Amazon Music", url: `https://music.amazon.com/search/${q}` },
    ].filter((l) => !seen.has(l.platform)),
    sources: { spotify_api: !!(await spotifyToken()), odesli: !!Deno.env.get("ODESLI_API_KEY") },
    count: links.length,
    scanned_at: new Date().toISOString(),
  };
  if (cache.size > 300) cache.clear();
  cache.set(key, { at: Date.now(), body });
  return body;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const ip = (req.headers.get("x-forwarded-for") ?? "anon").split(",")[0].trim();
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || h.reset < now) hits.set(ip, { n: 1, reset: now + 60_000 });
  else if (++h.n > 30) return json({ error: "Too many scans — wait a minute." }, 429);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const queries: string[] = (Array.isArray(body?.queries) ? body.queries : [body?.query])
    .filter((q: unknown) => typeof q === "string" && q.trim())
    .slice(0, 5);
  if (!queries.length) return json({ error: "Send { query }: an ISRC, UPC, Spotify URI or link." }, 400);

  const results = await Promise.all(queries.map((q) => scan(q).catch(() => ({ found: false, message: "Scan failed — try again." }))));
  return json(Array.isArray(body?.queries) ? { results } : results[0]);
});
