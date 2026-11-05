import { NextRequest, NextResponse } from "next/server";
import type { BrowserSearchHit } from "@/lib/browserTypes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function decodeHtml(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function unwrapGoogleUrl(href: string): string | null {
  try {
    if (href.startsWith("/url?")) {
      const u = new URL(href, "https://www.google.com");
      const q = u.searchParams.get("q") || u.searchParams.get("url");
      if (q && /^https?:\/\//i.test(q)) return q;
    }
    if (/^https?:\/\//i.test(href) && !/google\.[a-z.]+\/(search|aclk|imgres)/i.test(href)) return href;
  } catch {
    /* ignore */
  }
  return null;
}

function parseGoogleHtml(html: string): BrowserSearchHit[] {
  const hits: BrowserSearchHit[] = [];
  const seen = new Set<string>();
  const re = /<a[^>]+href="(\/url\?[^"]+|https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && hits.length < 12) {
    const url = unwrapGoogleUrl(m[1].replace(/&amp;/g, "&"));
    if (!url || seen.has(url)) continue;
    if (/accounts\.google|support\.google|maps\.google|policies\.google|youtube\.com\/results/i.test(url)) continue;
    const title = decodeHtml(m[2].replace(/<[^>]+>/g, "").trim());
    if (!title || title.length < 2 || title.length > 200) continue;
    const after = html.slice(m.index, m.index + 900);
    const snipMatch =
      after.match(/class="BNeawe[^"]*"[^>]*>([\s\S]*?)<\/(?:div|span)>/i) ||
      after.match(/<div[^>]*class="[^"]*s[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    let snippet = snipMatch ? decodeHtml(snipMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()) : "";
    if (snippet.length > 280) snippet = snippet.slice(0, 277) + "…";
    seen.add(url);
    hits.push({ title, url, snippet });
  }
  return hits;
}

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") || "").trim().slice(0, 200);
  if (!q) return NextResponse.json({ error: "Missing q" }, { status: 400 });

  const engine = (req.nextUrl.searchParams.get("engine") || "google").toLowerCase();
  const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(q)}&hl=en&gl=us&gbv=1&num=10`;

  try {
    const target =
      engine === "bing"
        ? `https://www.bing.com/search?q=${encodeURIComponent(q)}`
        : engine === "duckduckgo"
          ? `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`
          : googleUrl;

    const res = await fetch(target, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      cache: "no-store",
    });
    const html = await res.text();
    let results: BrowserSearchHit[] = [];

    if (engine === "google" || !engine) {
      results = parseGoogleHtml(html);
    } else if (engine === "duckduckgo") {
      const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
      let m: RegExpExecArray | null;
      while ((m = re.exec(html)) && results.length < 12) {
        const url = m[1].startsWith("http") ? m[1] : `https:${m[1]}`;
        const title = decodeHtml(m[2].replace(/<[^>]+>/g, "").trim());
        if (title && url) results.push({ title, url, snippet: "" });
      }
    } else {
      const re = /<h2[^>]*>\s*<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
      let m: RegExpExecArray | null;
      while ((m = re.exec(html)) && results.length < 12) {
        if (/bing\.com|microsoft\.com/i.test(m[1])) continue;
        results.push({ title: decodeHtml(m[2].replace(/<[^>]+>/g, "").trim()), url: m[1], snippet: "" });
      }
    }

    return NextResponse.json({
      q,
      engine: engine === "bing" || engine === "duckduckgo" ? engine : "google",
      source: target,
      google: `https://www.google.com/search?q=${encodeURIComponent(q)}`,
      results,
      fetched: results.length > 0,
      status: res.status,
    });
  } catch (e) {
    return NextResponse.json({
      q,
      engine: "google",
      google: `https://www.google.com/search?q=${encodeURIComponent(q)}`,
      results: [] as BrowserSearchHit[],
      fetched: false,
      error: e instanceof Error ? e.message : "Fetch failed",
    });
  }
}
