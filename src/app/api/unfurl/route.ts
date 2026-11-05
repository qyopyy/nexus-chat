import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Preview = {
  url: string;
  finalUrl: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
  favicon: string | null;
};

const TIMEOUT_MS = 8000;
const MAX_BYTES = 1_200_000;
const CACHE_TTL_MS = 30 * 60_000;
const cache = new Map<string, { at: number; body: Preview | null; status: number }>();

function blockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h === "0.0.0.0") return true;
  // bare IPv4
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return true;
  }
  if (h.includes(":")) return true; // IPv6 / weird
  return false;
}

function absUrl(base: string, maybe: string | null | undefined): string | null {
  if (!maybe) return null;
  const s = maybe.trim().replace(/^<|>$/g, "");
  if (!s || s.startsWith("data:")) return null;
  try {
    return new URL(s, base).toString();
  } catch {
    return null;
  }
}

function meta(html: string, key: string): string | null {
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${esc}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${esc}["']`, "i"),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return decodeEntities(m[1].trim());
  }
  return null;
}

function decodeEntities(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

function parseHtml(url: string, finalUrl: string, html: string): Preview {
  const title =
    meta(html, "og:title") ||
    meta(html, "twitter:title") ||
    (() => {
      const m = html.match(/<title[^>]*>([^<]{1,300})<\/title>/i);
      return m ? decodeEntities(m[1].trim()) : null;
    })();
  const description = meta(html, "og:description") || meta(html, "twitter:description") || meta(html, "description");
  const image = absUrl(finalUrl, meta(html, "og:image") || meta(html, "og:image:url") || meta(html, "twitter:image") || meta(html, "twitter:image:src"));
  const siteName = meta(html, "og:site_name") || (() => {
    try {
      return new URL(finalUrl).hostname.replace(/^www\./, "");
    } catch {
      return null;
    }
  })();
  const favicon =
    absUrl(
      finalUrl,
      (() => {
        const m =
          html.match(/<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']+)["']/i) ||
          html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["'](?:shortcut )?icon["']/i);
        return m?.[1];
      })(),
    ) || absUrl(finalUrl, "/favicon.ico");

  return {
    url,
    finalUrl,
    title: title?.slice(0, 200) || null,
    description: description?.slice(0, 400) || null,
    image,
    siteName: siteName?.slice(0, 80) || null,
    favicon,
  };
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("url")?.trim() ?? "";
  if (!raw) return NextResponse.json({ error: "url required" }, { status: 400 });

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return NextResponse.json({ error: "invalid url" }, { status: 400 });
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return NextResponse.json({ error: "unsupported protocol" }, { status: 400 });
  }
  if (blockedHost(target.hostname)) {
    return NextResponse.json({ error: "blocked host" }, { status: 400 });
  }

  const key = target.toString();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return NextResponse.json(hit.body, { status: hit.status, headers: { "Cache-Control": "private, max-age=300" } });
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(target.toString(), {
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        "User-Agent": "NexusBot/1.0 (+https://nexusproject.cc; link-preview)",
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.8",
      },
    });
    const finalUrl = res.url || target.toString();
    try {
      const finalHost = new URL(finalUrl).hostname;
      if (blockedHost(finalHost)) {
        cache.set(key, { at: Date.now(), body: null, status: 400 });
        return NextResponse.json({ error: "blocked redirect" }, { status: 400 });
      }
    } catch {
      /* ignore */
    }

    const type = res.headers.get("content-type") ?? "";
    if (!type.includes("text/html") && !type.includes("application/xhtml")) {
      // non-HTML: still return a minimal card from the URL itself
      const body: Preview = {
        url: key,
        finalUrl,
        title: (() => {
          try {
            return decodeURIComponent(new URL(finalUrl).pathname.split("/").filter(Boolean).pop() || new URL(finalUrl).hostname);
          } catch {
            return new URL(finalUrl).hostname;
          }
        })(),
        description: null,
        image: type.startsWith("image/") ? finalUrl : null,
        siteName: new URL(finalUrl).hostname.replace(/^www\./, ""),
        favicon: absUrl(finalUrl, "/favicon.ico"),
      };
      cache.set(key, { at: Date.now(), body, status: 200 });
      return NextResponse.json(body, { headers: { "Cache-Control": "private, max-age=300" } });
    }

    const reader = res.body?.getReader();
    if (!reader) {
      cache.set(key, { at: Date.now(), body: null, status: 502 });
      return NextResponse.json({ error: "empty body" }, { status: 502 });
    }
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        reader.cancel().catch(() => {});
        break;
      }
      chunks.push(value);
    }
    const html = new TextDecoder("utf-8").decode(Buffer.concat(chunks.map((c) => Buffer.from(c))));
    const body = parseHtml(key, finalUrl, html);
    if (!body.title && !body.description && !body.image) {
      cache.set(key, { at: Date.now(), body: null, status: 404 });
      return NextResponse.json({ error: "no preview" }, { status: 404 });
    }
    cache.set(key, { at: Date.now(), body, status: 200 });
    return NextResponse.json(body, { headers: { "Cache-Control": "private, max-age=300" } });
  } catch {
    cache.set(key, { at: Date.now(), body: null, status: 502 });
    return NextResponse.json({ error: "fetch failed" }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}
