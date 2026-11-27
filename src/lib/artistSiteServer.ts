import { NextRequest, NextResponse } from "next/server";
import { linkSecurityHeaders } from "@/lib/linkProtect";
import { renderArtistSite, artistSiteNotFound, pickEmbed, mergeCatalogs, BUILTIN_ARTISTS, type Main, type SiteArtist, type SiteRelease, type ArtistSiteData } from "@/lib/artistSite";

const SB = () => process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const KEY = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const headers = () => ({ apikey: KEY(), Authorization: `Bearer ${KEY()}`, "Content-Type": "application/json" });

type PageRow = { spotify_id: string; handle: string; name: string; image_url: string | null; bio: string | null; verified: boolean };

async function pageRow(col: "spotify_id" | "handle", value: string): Promise<PageRow | null> {
  try {
    const r = await fetch(`${SB()}/rest/v1/artist_pages?${col}=eq.${encodeURIComponent(value)}&select=spotify_id,handle,name,image_url,bio,verified&limit=1`, { headers: headers(), cache: "no-store" });
    if (!r.ok) return null;
    return ((await r.json()) as PageRow[])[0] ?? null;
  } catch {
    return null;
  }
}

/** Counts a visit (once per browser per 12 h, never for crawlers) and returns the total; null if the counter isn't set up. */
async function countView(slug: string, count: boolean): Promise<number | null> {
  try {
    const r = await fetch(`${SB()}/rest/v1/rpc/artist_site_hit`, { method: "POST", headers: headers(), body: JSON.stringify({ p_slug: slug, p_count: count }), cache: "no-store" });
    if (!r.ok) return null;
    const n = Number(await r.json());
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}
type ArtistPayload = { artist?: SiteArtist; releases?: SiteRelease[]; top?: NonNullable<ArtistSiteData["tracks"]> };

async function fn<T>(body: Record<string, unknown>): Promise<T | null> {
  try {
    const r = await fetch(`${SB()}/functions/v1/spotify`, { method: "POST", headers: headers(), body: JSON.stringify(body), cache: "no-store" });
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}

/** Other Spotify profiles that belong to the same catalog, fetched in parallel. */
async function aliasProfiles(ids: string[], skipIds: string[]): Promise<{ main: Main; data: ArtistPayload }[]> {
  const found = await Promise.all(
    ids
      .filter((id) => /^[A-Za-z0-9]{22}$/.test(id) && !skipIds.includes(id))
      .map(async (id) => {
        const data = await fn<ArtistPayload>({ action: "artist", id });
        return data?.artist ? { main: { id, name: data.artist.name }, data } : null;
      }),
  );
  return found.filter((x): x is { main: Main; data: ArtistPayload } => Boolean(x));
}
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|whatsapp|telegram|discord|curl|wget|headless/i;

/**
 * Public artist website for a Spotify artist ID or a Nexus artist handle. Only this year's releases are shown.
 * Returns null when nothing matches and `orNull` is set (so /bio/<name> can fall through to its own 404).
 */
export async function artistSiteResponse(req: NextRequest, rawId: string, orNull = false): Promise<NextResponse | null> {
  const origin = req.nextUrl.origin;
  const hdr = (extra?: HeadersInit) => linkSecurityHeaders({ "Content-Type": "text/html; charset=utf-8", ...extra });
  const missing = () => (orNull ? null : new NextResponse(artistSiteNotFound(origin), { status: 404, headers: hdr() }));

  const raw = rawId.trim();
  const isSpotifyId = /^[A-Za-z0-9]{22}$/.test(raw);
  const handle = raw.toLowerCase().replace(/^@/, "").replace(/[^a-z0-9_.-]/g, "").slice(0, 40);
  if (!isSpotifyId && !handle) return missing();

  const found = isSpotifyId ? await pageRow("spotify_id", raw) : await pageRow("handle", handle);
  const builtin = Object.entries(BUILTIN_ARTISTS).find(([h, b]) => (isSpotifyId ? b.spotify_id === raw : h === handle));
  const row: PageRow | null = found ?? (builtin ? { spotify_id: builtin[1].spotify_id, handle: builtin[0], name: builtin[1].name, image_url: null, bio: builtin[1].bio, verified: builtin[1].verified } : null);
  const spotifyId = row?.spotify_id ?? (isSpotifyId ? raw : null);
  if (!spotifyId) return missing();

  let artist: SiteArtist | null = null;
  let releases: SiteRelease[] = [];
  let tracks: NonNullable<ArtistSiteData["tracks"]> = [];
  const primary = await fn<ArtistPayload>({ action: "artist", id: spotifyId });
  artist = primary?.artist ?? null;
  releases = primary?.releases ?? [];
  tracks = primary?.top ?? [];
  const extra = builtin?.[1].alsoIds?.length ? await aliasProfiles(builtin[1].alsoIds, [spotifyId]) : [];
  releases = mergeCatalogs([releases, ...extra.map((e) => e.data.releases ?? [])]);
  tracks = [...tracks, ...extra.flatMap((e) => e.data.top ?? [])];
  if (!artist && !row) return missing();
  const base: SiteArtist = artist ?? { id: spotifyId, name: row!.name, image: row!.image_url, url: `https://open.spotify.com/artist/${spotifyId}` };

  const slug = row?.handle ?? spotifyId;
  const seenKey = `as_seen_${slug.replace(/[^a-z0-9_]/gi, "")}`;
  const seen = req.cookies.get(seenKey)?.value === "1";
  const counts = !seen && !BOT.test(req.headers.get("user-agent") ?? "");
  const views = await countView(slug, counts);
  const embed = pickEmbed(builtin?.[1].featured, tracks, releases, spotifyId, builtin?.[1].featuredTrackId);

  const html = renderArtistSite(
    {
      artist: { ...base, id: spotifyId, name: row?.name || base.name, image: row?.image_url || base.image, url: base.url || `https://open.spotify.com/artist/${spotifyId}` },
      releases,
      verified: Boolean(row?.verified),
      bio: row?.bio ?? null,
      handle: row?.handle ?? null,
      contacts: builtin?.[1].contacts,
      aliases: extra.map((e) => e.main),
      views,
      tracks,
      embed: embed?.path ?? null,
      embedTitle: embed?.title ?? null,
      year: new Date().getFullYear(),
    },
    origin,
  );
  const res = new NextResponse(html, { headers: hdr({ "Cache-Control": "private, no-cache" }) });
  if (counts) res.cookies.set(seenKey, "1", { maxAge: 12 * 3600, path: "/bio", sameSite: "lax", httpOnly: true, secure: true });
  return res;
}
