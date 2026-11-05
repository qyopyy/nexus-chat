import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type YtVideo = {
  id: string;
  title: string;
  channelId: string;
  channelTitle: string;
  thumb: string | null;
  publishedAt: string;
  url: string;
  embedUrl: string;
  isShort: boolean;
};

function videoOut(id: string, title: string, channelId: string, channelTitle: string, publishedAt: string, thumb: string | null, isShort: boolean): YtVideo {
  return {
    id,
    title,
    channelId,
    channelTitle,
    thumb,
    publishedAt,
    url: isShort ? `https://www.youtube.com/shorts/${id}` : `https://www.youtube.com/watch?v=${id}`,
    embedUrl: `https://www.youtube.com/embed/${id}?playsinline=1&rel=0&modestbranding=1`,
    isShort,
  };
}

async function resolveChannel(q: string): Promise<{ id: string; title: string; handle: string | null; thumb: string | null } | null> {
  const raw = q.trim();
  if (!raw) return null;

  // Direct channel id
  const uc = raw.match(/^(UC[\w-]{20,})$/) || raw.match(/youtube\.com\/channel\/(UC[\w-]{20,})/i);
  if (uc) {
    return { id: uc[1], title: uc[1], handle: null, thumb: null };
  }

  let handle = raw;
  const hm = raw.match(/youtube\.com\/@([\w.-]+)/i) || raw.match(/^@([\w.-]+)$/);
  if (hm) handle = hm[1];
  else handle = raw.replace(/^@/, "");

  const key = process.env.YOUTUBE_API_KEY || process.env.GOOGLE_API_KEY;
  if (key) {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&maxResults=1&q=${encodeURIComponent(handle)}&key=${key}`;
    const r = await fetch(url, { next: { revalidate: 3600 } });
    if (r.ok) {
      const j = (await r.json()) as { items?: { id?: { channelId?: string }; snippet?: { title?: string; thumbnails?: { default?: { url?: string } }; customUrl?: string } }[] };
      const it = j.items?.[0];
      if (it?.id?.channelId) {
        return {
          id: it.id.channelId,
          title: it.snippet?.title || handle,
          handle: it.snippet?.customUrl || `@${handle}`,
          thumb: it.snippet?.thumbnails?.default?.url || null,
        };
      }
    }
  }

  // HTML scrape fallback for @handles
  try {
    const page = await fetch(`https://www.youtube.com/@${encodeURIComponent(handle)}`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; NexusBot/1.0)", "Accept-Language": "en" },
      next: { revalidate: 3600 },
    });
    if (page.ok) {
      const html = await page.text();
      const id = html.match(/"channelId":"(UC[\w-]{20,})"/)?.[1] || html.match(/\/channel\/(UC[\w-]{20,})/)?.[1];
      const title = html.match(/"title":"([^"]{1,120})"/)?.[1] || handle;
      if (id) return { id, title: title.replace(/\\u0026/g, "&"), handle: `@${handle}`, thumb: null };
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function feedFromRss(channelId: string, shortsOnly: boolean): Promise<{ videos: YtVideo[]; source: string }> {
  const rss = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; NexusBot/1.0)" },
    next: { revalidate: 300 },
  });
  if (!rss.ok) throw new Error("Couldn't load YouTube channel feed");
  const xml = await rss.text();
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].slice(0, 30);
  const videos: YtVideo[] = [];
  for (const [, body] of entries) {
    const id = body.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1];
    const title = body.match(/<title>([^<]*)<\/title>/)?.[1] || "Video";
    const publishedAt = body.match(/<published>([^<]+)<\/published>/)?.[1] || new Date().toISOString();
    const channelTitle = body.match(/<name>([^<]*)<\/name>/)?.[1] || "YouTube";
    const thumb = body.match(/<media:thumbnail[^>]+url="([^"]+)"/)?.[1] || (id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null);
    if (!id) continue;
    // RSS doesn't mark Shorts reliably — prefer /shorts when title looks short-form or always offer as short-capable
    const isShort = true; // channel feed in Shorts tab: treat as Shorts-capable embeds from original YouTube
    if (shortsOnly && !isShort) continue;
    videos.push(videoOut(id, decodeXml(title), channelId, decodeXml(channelTitle), publishedAt, thumb, true));
  }
  return { videos, source: "youtube-rss" };
}

function decodeXml(s: string) {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

async function searchShorts(q: string): Promise<{ videos: YtVideo[]; source: string }> {
  const key = process.env.YOUTUBE_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) {
    // Without API key, resolve as channel and return its feed
    const ch = await resolveChannel(q);
    if (!ch) throw new Error("Add YOUTUBE_API_KEY to search, or paste a @handle / channel URL");
    return feedFromRss(ch.id, true);
  }
  const url =
    `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoDuration=short&maxResults=20` +
    `&q=${encodeURIComponent(q)}&key=${key}`;
  const r = await fetch(url, { next: { revalidate: 300 } });
  if (!r.ok) throw new Error("YouTube search failed");
  const j = (await r.json()) as {
    items?: {
      id?: { videoId?: string };
      snippet?: {
        title?: string;
        channelId?: string;
        channelTitle?: string;
        publishedAt?: string;
        thumbnails?: { high?: { url?: string }; medium?: { url?: string } };
      };
    }[];
  };
  const videos = (j.items || [])
    .map((it) => {
      const id = it.id?.videoId;
      if (!id) return null;
      return videoOut(
        id,
        it.snippet?.title || "Short",
        it.snippet?.channelId || "",
        it.snippet?.channelTitle || "YouTube",
        it.snippet?.publishedAt || new Date().toISOString(),
        it.snippet?.thumbnails?.high?.url || it.snippet?.thumbnails?.medium?.url || null,
        true,
      );
    })
    .filter(Boolean) as YtVideo[];
  return { videos, source: "youtube-api" };
}

export async function GET(req: NextRequest) {
  try {
    const action = req.nextUrl.searchParams.get("action") || "feed";
    if (action === "resolve") {
      const q = req.nextUrl.searchParams.get("q") || "";
      const channel = await resolveChannel(q);
      if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });
      return NextResponse.json({ channel });
    }
    if (action === "feed") {
      const channelId = req.nextUrl.searchParams.get("channelId") || "";
      if (!channelId.startsWith("UC")) return NextResponse.json({ error: "channelId required" }, { status: 400 });
      const shorts = req.nextUrl.searchParams.get("shorts") !== "0";
      const out = await feedFromRss(channelId, shorts);
      return NextResponse.json(out);
    }
    if (action === "search") {
      const q = req.nextUrl.searchParams.get("q") || "";
      if (!q.trim()) return NextResponse.json({ error: "q required" }, { status: 400 });
      const out = await searchShorts(q.trim());
      return NextResponse.json(out);
    }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "YouTube error" }, { status: 500 });
  }
}
