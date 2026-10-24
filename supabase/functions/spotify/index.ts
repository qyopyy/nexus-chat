// Nexus Spotify proxy — keeps the client secret server-side.
// Secrets: SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET (Spotify developer dashboard).
// Falls back to Deezer's public API for ISRC/UPC lookups when Spotify isn't configured.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const CLIENT_ID = Deno.env.get("SPOTIFY_CLIENT_ID") ?? "";
const CLIENT_SECRET = Deno.env.get("SPOTIFY_CLIENT_SECRET") ?? "";
const configured = !!(CLIENT_ID && CLIENT_SECRET);

let token: { value: string; exp: number } | null = null;
async function appToken() {
  if (token && token.exp > Date.now() + 30_000) return token.value;
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(`${CLIENT_ID}:${CLIENT_SECRET}`),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`Spotify auth failed (${res.status}) — check the client ID/secret`);
  const j = await res.json();
  token = { value: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return token.value;
}

const cache = new Map<string, { at: number; data: unknown }>();
async function sp(path: string, ttl = 300_000): Promise<any> {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < ttl) return hit.data;
  const res = await fetch(`https://api.spotify.com/v1${path}`, { headers: { Authorization: `Bearer ${await appToken()}` } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Spotify ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const data = await res.json();
  if (cache.size > 500) cache.clear();
  cache.set(path, { at: Date.now(), data });
  return data;
}

const img = (images?: { url: string }[]) => images?.[0]?.url ?? null;
const artistLite = (a: any) => a && {
  id: a.id, name: a.name, image: img(a.images), url: a.external_urls?.spotify,
  followers: a.followers?.total ?? null, genres: a.genres ?? [], popularity: a.popularity ?? null,
};
const albumLite = (a: any) => a && {
  id: a.id, name: a.name, image: img(a.images), url: a.external_urls?.spotify, type: a.album_type,
  release_date: a.release_date, total_tracks: a.total_tracks, upc: a.external_ids?.upc ?? null,
  label: a.label ?? null, artists: (a.artists ?? []).map((x: any) => ({ id: x.id, name: x.name })),
};
const trackLite = (t: any) => t && {
  id: t.id, name: t.name, url: t.external_urls?.spotify, isrc: t.external_ids?.isrc ?? null,
  duration_ms: t.duration_ms, explicit: t.explicit, preview_url: t.preview_url ?? null,
  album: t.album ? { id: t.album.id, name: t.album.name, image: img(t.album.images), release_date: t.album.release_date } : null,
  artists: (t.artists ?? []).map((x: any) => ({ id: x.id, name: x.name })),
};

const ID = /^[A-Za-z0-9]{10,40}$/;

async function deezerIsrc(isrc: string) {
  const r = await fetch(`https://api.deezer.com/2.0/track/isrc:${encodeURIComponent(isrc)}`);
  const j = await r.json();
  if (!j || j.error) return null;
  return {
    id: null, name: j.title, url: null, isrc: j.isrc, duration_ms: (j.duration ?? 0) * 1000, explicit: !!j.explicit_lyrics,
    preview_url: j.preview ?? null,
    album: j.album ? { id: null, name: j.album.title, image: j.album.cover_xl ?? j.album.cover_big, release_date: j.release_date } : null,
    artists: (j.contributors ?? [j.artist]).filter(Boolean).map((a: any) => ({ id: null, name: a.name })),
    search_url: `https://open.spotify.com/search/${encodeURIComponent(`${j.title} ${j.artist?.name ?? ""}`)}`,
    source: "deezer",
  };
}
/** Spotify stopped returning follower counts (Feb 2026) — use Deezer fans as a stand-in */
async function deezerFans(name: string): Promise<number | null> {
  try {
    const r = await fetch(`https://api.deezer.com/search/artist?limit=10&q=${encodeURIComponent(name)}`);
    const j = await r.json();
    const same = (j?.data ?? []).filter((a: any) => String(a.name).toLowerCase() === name.toLowerCase());
    const best = Math.max(0, ...same.map((a: any) => Number(a.nb_fan) || 0));
    return best || null;
  } catch {
    return null;
  }
}
async function deezerUpc(upc: string) {
  const r = await fetch(`https://api.deezer.com/2.0/album/upc:${encodeURIComponent(upc)}`);
  const j = await r.json();
  if (!j || j.error) return null;
  return {
    id: null, name: j.title, image: j.cover_xl ?? j.cover_big, url: null, type: j.record_type, release_date: j.release_date,
    total_tracks: j.nb_tracks, upc: j.upc, label: j.label ?? null, artists: [{ id: null, name: j.artist?.name }],
    search_url: `https://open.spotify.com/search/${encodeURIComponent(`${j.title} ${j.artist?.name ?? ""}`)}`,
    source: "deezer",
  };
}

function parseSpotifyUrl(input: string): { kind: string; id: string } | null {
  const s = input.trim();
  let m = s.match(/^spotify:(track|album|artist):([A-Za-z0-9]+)$/);
  if (m) return { kind: m[1], id: m[2] };
  m = s.match(/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(track|album|artist)\/([A-Za-z0-9]+)/);
  if (m) return { kind: m[1], id: m[2] };
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  let b: Record<string, any>;
  try {
    b = await req.json();
  } catch {
    return json({ error: "Invalid request" }, 400);
  }
  const action = String(b.action ?? "");

  try {
    if (action === "config") return json({ configured, client_id: CLIENT_ID || null });

    // ISRC / UPC lookups work even without Spotify keys (Deezer fallback)
    if (action === "isrc") {
      const isrc = String(b.isrc ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (!/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(isrc)) return json({ error: "That doesn't look like an ISRC (e.g. USUM71703861)" }, 400);
      if (configured) {
        const r = await sp(`/search?type=track&limit=10&q=${encodeURIComponent(`isrc:${isrc}`)}`);
        const items = (r?.tracks?.items ?? []).map(trackLite);
        if (items.length) return json({ source: "spotify", tracks: items });
      }
      const d = await deezerIsrc(isrc);
      return json({ source: d ? "deezer" : null, tracks: d ? [d] : [] });
    }
    if (action === "upc") {
      const upc = String(b.upc ?? "").replace(/\D/g, "");
      if (upc.length < 8 || upc.length > 14) return json({ error: "A UPC/EAN is 12–13 digits" }, 400);
      if (configured) {
        const r = await sp(`/search?type=album&limit=10&q=${encodeURIComponent(`upc:${upc}`)}`);
        const ids = (r?.albums?.items ?? []).map((a: any) => a.id).slice(0, 20);
        if (ids.length) {
          const full = await Promise.all(ids.slice(0, 10).map((x: string) => sp(`/albums/${x}`).catch(() => null)));
          return json({ source: "spotify", albums: full.filter(Boolean).map(albumLite) });
        }
      }
      let d = await deezerUpc(upc);
      if (!d && upc.length === 12) d = await deezerUpc("0" + upc);
      return json({ source: d ? "deezer" : null, albums: d ? [d] : [] });
    }

    if (!configured) {
      return json({ error: "Spotify isn't connected yet — an admin needs to add the Spotify API keys.", not_configured: true }, 503);
    }

    switch (action) {
      case "reverse": {
        const p = parseSpotifyUrl(String(b.url ?? ""));
        if (!p) return json({ error: "Paste a Spotify track or album link" }, 400);
        if (p.kind === "track") return json({ kind: "track", track: trackLite(await sp(`/tracks/${p.id}`)) });
        if (p.kind === "album") {
          const a = await sp(`/albums/${p.id}`);
          // Spotify removed batch "/tracks?ids=" (Feb 2026) — fetch tracks one by one for their ISRCs
          const ids = (a?.tracks?.items ?? []).map((t: any) => t.id).filter(Boolean).slice(0, 40);
          const tracks = await Promise.all(ids.map((id: string) => sp(`/tracks/${id}`).catch(() => null)));
          return json({ kind: "album", album: albumLite(a), tracks: tracks.filter(Boolean).map(trackLite) });
        }
        return json({ kind: "artist", artist: artistLite(await sp(`/artists/${p.id}`)) });
      }
      case "search": {
        const q = String(b.q ?? "").trim().slice(0, 100);
        const type = ["artist", "track", "album"].includes(b.type) ? b.type : "artist";
        if (!q) return json({ items: [] });
        const r = await sp(`/search?type=${type}&limit=10&q=${encodeURIComponent(q)}`, 120_000);
        const items = r?.[`${type}s`]?.items ?? [];
        return json({ items: items.map(type === "artist" ? artistLite : type === "album" ? albumLite : trackLite) });
      }
      case "artist": {
        const id = String(b.id ?? "");
        if (!ID.test(id)) return json({ error: "Bad artist id" }, 400);
        const [a, albums, more] = await Promise.all([
          sp(`/artists/${id}`),
          sp(`/artists/${id}/albums?include_groups=album,single&limit=10`),
          sp(`/artists/${id}/albums?include_groups=album,single&limit=10&offset=10`).catch(() => null),
        ]);
        if (!a) return json({ error: "Artist not found" }, 404);
        // "top tracks" endpoint was removed — use a search for the artist's tracks instead
        const found = await sp(`/search?type=track&limit=10&q=${encodeURIComponent(`artist:"${a.name}"`)}`).catch(() => null);
        const top = { tracks: (found?.tracks?.items ?? []).filter((t: any) => (t.artists ?? []).some((x: any) => x.id === id)) };
        const fans = await deezerFans(a.name);
        if (fans != null && a.followers?.total == null) a.followers = { total: fans };
        if (albums && more?.items) albums.items = [...(albums.items ?? []), ...more.items];
        const rel = (albums?.items ?? []).map(albumLite).sort((x: any, y: any) => String(y.release_date).localeCompare(String(x.release_date)));
        return json({ artist: artistLite(a), releases: rel, top: (top?.tracks ?? []).slice(0, 10).map(trackLite) });
      }
      case "artists": {
        const ids = (Array.isArray(b.ids) ? b.ids : []).filter((x: string) => ID.test(x)).slice(0, 50);
        if (!ids.length) return json({ artists: [] });
        // batch "/artists?ids=" was removed — fetch each artist
        const list = await Promise.all(ids.slice(0, 30).map((x: string) => sp(`/artists/${x}`).catch(() => null)));
        return json({ artists: list.filter(Boolean).map(artistLite) });
      }
      case "releases": {
        // latest releases from a list of watched artists
        const ids = (Array.isArray(b.ids) ? b.ids : []).filter((x: string) => ID.test(x)).slice(0, 25);
        const lists = await Promise.all(
          ids.map((id: string) => sp(`/artists/${id}/albums?include_groups=album,single&limit=5`, 900_000).catch(() => null)),
        );
        const seen = new Set<string>();
        const all = lists.flatMap((l) => l?.items ?? []).filter((a: any) => (seen.has(a.id) ? false : (seen.add(a.id), true)));
        all.sort((x: any, y: any) => String(y.release_date).localeCompare(String(x.release_date)));
        return json({ releases: all.slice(0, 40).map(albumLite) });
      }
      case "new_releases": {
        // "/browse/new-releases" was removed — search albums tagged new (last two weeks)
        const pages = await Promise.all([0, 10].map((o) => sp(`/search?type=album&limit=10&offset=${o}&q=tag%3Anew`, 900_000).catch(() => null)));
        const seen = new Set<string>();
        const items = pages.flatMap((r) => r?.albums?.items ?? []).filter((x: any) => x && !seen.has(x.id) && seen.add(x.id));
        return json({ releases: items.map(albumLite) });
      }
      default:
        return json({ error: "Unknown action" }, 400);
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Spotify request failed" }, 502);
  }
});
