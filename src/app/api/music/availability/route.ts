import { platformOf } from "@/lib/releaseWatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Result = { platform: string; status: "live" | "missing" | "unknown"; title: string | null; note?: string };

const UA = { "User-Agent": "NexusReleaseWatch/1.0 (+https://nexusproject.cc)" };
async function get(url: string) {
  return fetch(url, { headers: UA, cache: "no-store", signal: AbortSignal.timeout(8000) });
}
const verdict = (code: number): Result["status"] => (code === 200 ? "live" : code === 404 || code === 400 || code === 410 || code === 401 || code === 403 ? "missing" : "unknown");

async function check(url: string): Promise<Result> {
  const platform = platformOf(url);
  if (!platform) return { platform: "unknown", status: "unknown", title: null, note: "Unsupported link" };
  try {
    if (platform === "spotify") {
      const r = await get(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`);
      const j = r.ok ? ((await r.json()) as { title?: string }) : null;
      return { platform, status: verdict(r.status), title: j?.title ?? null };
    }
    if (platform === "youtube") {
      const r = await get(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url.replace("music.youtube.com", "www.youtube.com"))}`);
      const j = r.ok ? ((await r.json()) as { title?: string }) : null;
      return { platform, status: verdict(r.status), title: j?.title ?? null, note: r.status === 401 || r.status === 403 ? "Private, blocked or not embeddable" : undefined };
    }
    if (platform === "soundcloud" || platform === "tidal") {
      const api = platform === "soundcloud" ? `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(url)}` : `https://oembed.tidal.com/?url=${encodeURIComponent(url)}`;
      const r = await get(api);
      const j = r.ok ? ((await r.json()) as { title?: string }) : null;
      return { platform, status: verdict(r.status), title: j?.title ?? null };
    }
    if (platform === "apple") {
      const u = new URL(url);
      const id = u.searchParams.get("i") ?? u.pathname.match(/(?:\/id)?(\d{6,})\/?$/)?.[1];
      const cc = u.pathname.match(/^\/([a-z]{2})\//)?.[1] ?? "us";
      if (!id) return { platform, status: "unknown", title: null, note: "Couldn't read the Apple Music ID" };
      const r = await get(`https://itunes.apple.com/lookup?id=${id}&country=${cc}`);
      if (!r.ok) return { platform, status: "unknown", title: null };
      const j = (await r.json()) as { resultCount: number; results: { trackName?: string; collectionName?: string; artistName?: string }[] };
      const x = j.results?.[0];
      return { platform, status: j.resultCount > 0 ? "live" : "missing", title: x ? `${x.trackName ?? x.collectionName ?? ""}${x.artistName ? ` — ${x.artistName}` : ""}` : null };
    }
    if (platform === "deezer" || platform === "isrc") {
      const u = new URL(url);
      let api: string;
      if (platform === "isrc") api = `https://api.deezer.com${u.pathname}`;
      else {
        const m = u.pathname.match(/\/(track|album)\/(\d+)/);
        if (!m) return { platform, status: "unknown", title: null, note: "Couldn't read the Deezer ID" };
        api = `https://api.deezer.com/${m[1]}/${m[2]}`;
      }
      const r = await get(api);
      if (!r.ok) return { platform, status: "unknown", title: null };
      const j = (await r.json()) as { error?: unknown; title?: string; artist?: { name?: string }; readable?: boolean };
      if (j.error) return { platform, status: "missing", title: null };
      return { platform, status: j.readable === false ? "missing" : "live", title: j.title ? `${j.title}${j.artist?.name ? ` — ${j.artist.name}` : ""}` : null, note: j.readable === false ? "Listed but not playable" : undefined };
    }
  } catch {
    return { platform, status: "unknown", title: null, note: "Couldn't reach the store" };
  }
  return { platform, status: "unknown", title: null };
}

/** GET /api/music/availability?url=<release link>  (or ?isrc=QT6HV2600001) → is it still live? */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const isrc = (sp.get("isrc") ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const url = isrc ? (/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(isrc) ? `https://api.deezer.com/track/isrc:${isrc}` : "") : (sp.get("url") ?? "").trim();
  if (!url) return Response.json({ error: "Paste a release link or a valid ISRC" }, { status: 400 });
  const r = await check(url);
  return Response.json({ ...r, url, checkedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
}
