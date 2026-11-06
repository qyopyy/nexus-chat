// Nexus smart links — public release pages at /l/<slug> (rendered by the Next.js route handler).
//   page  {slug}                      → public release info + signed cover URL (no auth)
//   track {slug, kind, service, country} → counts a view or click; for clicks returns the store URL (no auth)
//   find  {release_id}                → owner/staff: look up store links from the UPC / ISRC
//                                        (Spotify, Deezer, Apple Music) and fill the rest via Odesli/song.link
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.119.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const RANK: Record<string, number> = { owner: 4, admin: 3, moderator: 2, vip: 1, member: 0 };
export const SERVICES = ["spotify", "apple", "youtube", "youtube_music", "amazon", "deezer", "tidal", "soundcloud", "beatport", "bandcamp", "audiomack", "pandora", "boomplay", "tiktok", "snapchat", "instagram", "website"];

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function getLink(slug: string) {
  const { data: l } = await admin.from("smart_links").select("*").eq("slug", slug.toLowerCase()).eq("enabled", true).maybeSingle();
  if (!l) return null;
  const { data: r } = await admin
    .from("dist_releases")
    .select("id, title, primary_artist_name, release_type, release_date, label_name, artwork_path, status, upc, copyright_year, copyright_holder")
    .eq("id", l.release_id)
    .maybeSingle();
  if (!r || r.status === "taken_down") return null;
  return { l, r };
}

// ---------------------------------------------------------------- store lookups
let spToken: { v: string; exp: number } | null = null;
async function spotify(path: string) {
  const id = Deno.env.get("SPOTIFY_CLIENT_ID");
  const secret = Deno.env.get("SPOTIFY_CLIENT_SECRET");
  if (!id || !secret) return null;
  if (!spToken || spToken.exp < Date.now()) {
    const t = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { Authorization: `Basic ${btoa(`${id}:${secret}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials",
    }).then((r) => r.json());
    if (!t.access_token) return null;
    spToken = { v: t.access_token, exp: Date.now() + (t.expires_in - 60) * 1000 };
  }
  const r = await fetch(`https://api.spotify.com/v1${path}`, { headers: { Authorization: `Bearer ${spToken.v}` } });
  return r.ok ? r.json() : null;
}

async function getJson(url: string) {
  try {
    const r = await fetch(url, { headers: { "User-Agent": "NexusSmartLinks/1.0" } });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

async function findLinks(upc: string | null, isrc: string | null) {
  const links: Record<string, string> = {};
  if (upc) {
    const sp = await spotify(`/search?type=album&limit=1&q=${encodeURIComponent(`upc:${upc}`)}`);
    const a = sp?.albums?.items?.[0];
    if (a?.external_urls?.spotify) links.spotify = a.external_urls.spotify;
    const dz = await getJson(`https://api.deezer.com/2.0/album/upc:${encodeURIComponent(upc)}`);
    if (dz?.link) links.deezer = dz.link;
    const it = await getJson(`https://itunes.apple.com/lookup?upc=${encodeURIComponent(upc)}&entity=album`);
    const al = it?.results?.find((x: any) => x.collectionViewUrl);
    if (al) links.apple = String(al.collectionViewUrl).replace(/[?&]uo=\d+/, "");
  }
  if (isrc && !links.spotify) {
    const sp = await spotify(`/search?type=track&limit=1&q=${encodeURIComponent(`isrc:${isrc}`)}`);
    const t = sp?.tracks?.items?.[0];
    if (t?.external_urls?.spotify) links.spotify = t.external_urls.spotify;
  }
  if (isrc && !links.deezer) {
    const dz = await getJson(`https://api.deezer.com/2.0/track/isrc:${encodeURIComponent(isrc)}`);
    if (dz?.link) links.deezer = dz.link;
  }
  // Odesli fills YouTube Music, Tidal, Amazon, SoundCloud, Pandora… from any one store URL
  const seed = links.spotify ?? links.deezer ?? links.apple;
  if (seed) {
    const od = await getJson(`https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent(seed)}&userCountry=US`);
    const p = od?.linksByPlatform ?? {};
    const map: Record<string, string> = {
      spotify: "spotify",
      appleMusic: "apple",
      youtube: "youtube",
      youtubeMusic: "youtube_music",
      amazonMusic: "amazon",
      deezer: "deezer",
      tidal: "tidal",
      soundcloud: "soundcloud",
      pandora: "pandora",
      audiomack: "audiomack",
      boomplay: "boomplay",
      bandcamp: "bandcamp",
    };
    for (const [k, v] of Object.entries(map)) if (p[k]?.url && !links[v]) links[v] = p[k].url;
  }
  return links;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const b = await req.json().catch(() => ({}));
    const action = String(b.action ?? "");

    if (action === "page") {
      const x = await getLink(String(b.slug ?? ""));
      if (!x) return json({ error: "Not found" }, 404);
      const { l, r } = x;
      let artwork: string | null = null;
      if (r.artwork_path) {
        const { data } = await admin.storage.from("dist-files").createSignedUrl(r.artwork_path, 7 * 86400);
        artwork = data?.signedUrl ?? null;
      }
      const { data: tracks } = await admin.from("dist_tracks").select("title, position, duration, explicit").eq("release_id", r.id).order("position");
      const live = r.status === "live";
      return json({
        slug: l.slug,
        headline: l.headline,
        accent: l.accent,
        links: Object.fromEntries(Object.entries(l.links ?? {}).filter(([k, v]) => SERVICES.includes(k) && typeof v === "string" && /^https:\/\//.test(v as string))),
        title: r.title,
        artist: r.primary_artist_name,
        type: r.release_type,
        release_date: r.release_date,
        label: r.label_name,
        copyright: [r.copyright_year, r.copyright_holder].filter(Boolean).join(" "),
        artwork,
        live,
        presave: !live && new Date(`${r.release_date}T00:00:00Z`).getTime() > Date.now(),
        tracks: tracks ?? [],
      });
    }

    if (action === "track") {
      const x = await getLink(String(b.slug ?? ""));
      if (!x) return json({ error: "Not found" }, 404);
      const kind = b.kind === "click" ? "click" : "view";
      const service = kind === "click" ? String(b.service ?? "") : null;
      const url = service ? (x.l.links ?? {})[service] : null;
      if (kind === "click" && (!SERVICES.includes(service!) || typeof url !== "string")) return json({ error: "Unknown service" }, 404);
      const country = /^[A-Z]{2}$/.test(String(b.country ?? "")) ? String(b.country) : null;
      await admin.from("smart_link_events").insert({ link_id: x.l.id, kind, service, country });
      return json({ ok: true, url });
    }

    if (action === "find") {
      const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
      const { data: u } = await admin.auth.getUser(jwt);
      if (!u?.user) throw new HttpError(401, "Sign in first");
      const { data: prof } = await admin.from("profiles").select("site_role").eq("id", u.user.id).maybeSingle();
      const { data: r } = await admin.from("dist_releases").select("id, owner_id, upc").eq("id", String(b.release_id ?? "")).maybeSingle();
      if (!r || (r.owner_id !== u.user.id && (RANK[prof?.site_role ?? "member"] ?? 0) < 3)) throw new HttpError(403, "Not your release");
      const { data: t } = await admin.from("dist_tracks").select("isrc").eq("release_id", r.id).not("isrc", "is", null).order("position").limit(1);
      const upc = (b.upc as string) || r.upc;
      const isrc = t?.[0]?.isrc ?? null;
      if (!upc && !isrc) throw new HttpError(400, "Add the release's UPC or a track ISRC first (you get them once it's sent to stores).");
      const links = await findLinks(upc, isrc);
      return json({ links, searched: { upc, isrc } });
    }

    throw new HttpError(400, "Unknown action");
  } catch (e) {
    const err = e as HttpError;
    return json({ error: err.message ?? String(e) }, err.status ?? 500);
  }
});
