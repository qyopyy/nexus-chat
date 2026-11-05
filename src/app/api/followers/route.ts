import { NextRequest, NextResponse } from "next/server";
import { detectPlatform, spotifyArtistId } from "@/lib/links";
import { parseAudienceText, platformHandle } from "@/lib/followers";
import { rateLimit } from "@/lib/apiGuard";
import { cacheGet, cacheSet } from "@/lib/serverCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 10 * 60_000;
const CACHE = "followers";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

type Result = {
  followers: number | null;
  platform: string;
  handle: string | null;
  source?: string;
};

function json(body: Result, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

async function fetchText(url: string, init?: RequestInit): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      ...init,
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        ...(init?.headers ?? {}),
      },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } finally {
    clearTimeout(t);
  }
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const text = await fetchText(url, {
    ...init,
    headers: { Accept: "application/json", ...(init?.headers ?? {}) },
  });
  return JSON.parse(text) as T;
}

async function followersX(handle: string): Promise<{ n: number | null; source: string }> {
  try {
    const j = await fetchJson<{ code?: number; user?: { followers?: number } }>(`https://api.fxtwitter.com/${encodeURIComponent(handle)}`);
    const n = j.user?.followers;
    if (typeof n === "number" && n >= 0) return { n, source: "fxtwitter" };
  } catch {
    /* try syndication fallback */
  }
  try {
    const rows = await fetchJson<{ followers_count?: number; screen_name?: string }[]>(
      `https://cdn.syndication.twimg.com/widgets/followbutton/info.json?screen_names=${encodeURIComponent(handle)}`,
    );
    const n = rows?.[0]?.followers_count;
    if (typeof n === "number" && n >= 0) return { n, source: "twitter-syndication" };
  } catch {
    /* ignore */
  }
  return { n: null, source: "x" };
}

async function followersYouTube(url: string, handle: string): Promise<{ n: number | null; source: string }> {
  const candidates = [
    handle.startsWith("UC") && handle.length >= 20 ? `https://www.youtube.com/channel/${handle}` : null,
    handle.startsWith("@") ? `https://www.youtube.com/${handle}` : `https://www.youtube.com/@${handle.replace(/^@/, "")}`,
    url,
  ].filter(Boolean) as string[];

  for (const page of candidates) {
    try {
      const html = await fetchText(page);
      const exact = html.match(/"subscriberCount"\s*:\s*"(\d+)"/);
      if (exact) return { n: Number(exact[1]), source: "youtube-html" };
      const labeled =
        html.match(/"subscriberCountText"\s*:\s*\{\s*"accessibility"\s*:\s*\{\s*"accessibilityData"\s*:\s*\{\s*"label"\s*:\s*"([^"]+)"/) ||
        html.match(/"subscriberCountText"\s*:\s*\{\s*"simpleText"\s*:\s*"([^"]+)"/) ||
        html.match(/simpleText"\s*:\s*"([\d,.]+[KMB]?)\s*subscribers"/i);
      if (labeled?.[1]) {
        const n = parseAudienceText(labeled[1]);
        if (n != null) return { n, source: "youtube-html" };
      }
    } catch {
      /* try next */
    }
  }
  return { n: null, source: "youtube" };
}

async function followersTikTok(handle: string): Promise<{ n: number | null; source: string }> {
  const page = `https://www.tiktok.com/@${handle.replace(/^@/, "")}`;
  try {
    const html = await fetchText(page);
    const m =
      html.match(/"followerCount"\s*:\s*(\d+)/) ||
      html.match(/"fans"\s*:\s*(\d+)/) ||
      html.match(/stats"\s*:\s*\{\s*"followerCount"\s*:\s*(\d+)/);
    if (m) return { n: Number(m[1]), source: "tiktok-html" };
  } catch {
    /* ignore */
  }
  return { n: null, source: "tiktok" };
}

async function followersTwitch(handle: string): Promise<{ n: number | null; source: string }> {
  try {
    const r = await fetch("https://gql.twitch.tv/gql", {
      method: "POST",
      headers: {
        "Client-Id": "kimne78kx3ncx6brgo4mv6wki5h1ko",
        "Content-Type": "application/json",
        "User-Agent": UA,
      },
      body: JSON.stringify({
        query: `query($login:String!){user(login:$login){followers{totalCount}}}`,
        variables: { login: handle },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (r.ok) {
      const j = (await r.json()) as { data?: { user?: { followers?: { totalCount?: number } } } };
      const n = j.data?.user?.followers?.totalCount;
      if (typeof n === "number" && n >= 0) return { n, source: "twitch-gql" };
    }
  } catch {
    /* ignore */
  }
  return { n: null, source: "twitch" };
}

async function followersGitHub(handle: string): Promise<{ n: number | null; source: string }> {
  try {
    const j = await fetchJson<{ followers?: number }>(`https://api.github.com/users/${encodeURIComponent(handle)}`, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "Nexus-Followers/1.0" },
    });
    if (typeof j.followers === "number") return { n: j.followers, source: "github-api" };
  } catch {
    /* ignore */
  }
  return { n: null, source: "github" };
}

async function followersSoundCloud(handle: string): Promise<{ n: number | null; source: string }> {
  try {
    const html = await fetchText(`https://soundcloud.com/${encodeURIComponent(handle)}`);
    const m = html.match(/"followers_count"\s*:\s*(\d+)/) || html.match(/soundcloud:follower_count[^>]*>?\s*([\d,]+)/i);
    if (m) return { n: Number(String(m[1]).replace(/,/g, "")), source: "soundcloud-html" };
  } catch {
    /* ignore */
  }
  return { n: null, source: "soundcloud" };
}

async function resolve(type: string, url: string): Promise<Result> {
  const handle = platformHandle(type, url);
  if (!handle && type !== "spotify") {
    return { followers: null, platform: type, handle: null };
  }

  let got: { n: number | null; source: string };
  switch (type) {
    case "x":
      got = await followersX(handle!);
      break;
    case "youtube":
      got = await followersYouTube(url, handle!);
      break;
    case "tiktok":
      got = await followersTikTok(handle!);
      break;
    case "twitch":
      got = await followersTwitch(handle!);
      break;
    case "github":
      got = await followersGitHub(handle!);
      break;
    case "soundcloud":
      got = await followersSoundCloud(handle!);
      break;
    case "spotify": {
      // Spotify counts go through the edge function from the client; API returns null here.
      const id = spotifyArtistId(url);
      return { followers: null, platform: type, handle: id, source: "spotify-client" };
    }
    default:
      got = { n: null, source: type };
  }
  return { followers: got.n, platform: type, handle, source: got.source };
}

export async function GET(req: NextRequest) {
  const limited = rateLimit(req, "followers", 60, 60_000);
  if (limited) return limited;

  const urlParam = req.nextUrl.searchParams.get("url")?.trim() ?? "";
  const typeParam = req.nextUrl.searchParams.get("type")?.trim() ?? "";
  if (!urlParam || !/^https?:\/\//i.test(urlParam)) {
    return json({ followers: null, platform: typeParam || "unknown", handle: null }, 400);
  }

  let parsed: URL;
  try {
    parsed = new URL(urlParam);
  } catch {
    return json({ followers: null, platform: typeParam || "unknown", handle: null }, 400);
  }

  const type = typeParam || detectPlatform(parsed.toString()).id;
  const key = `${type}:${platformHandle(type, urlParam) ?? urlParam}`;
  const cached = cacheGet<Result>(CACHE, key, CACHE_TTL_MS);
  if (cached) return json(cached);

  try {
    const body = await resolve(type, urlParam);
    cacheSet(CACHE, key, body);
    return json(body);
  } catch {
    return json({ followers: null, platform: type, handle: platformHandle(type, urlParam) }, 200);
  }
}
