import { NextRequest, NextResponse } from "next/server";
import type { BrowserSearchHit } from "@/lib/browserTypes";
import { parseBrowserDnsFromRequest, resolveDoh } from "@/lib/browserDns";

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
    const cleaned = href.replace(/&amp;/g, "&");
    if (cleaned.startsWith("/url?")) {
      const u = new URL(cleaned, "https://www.google.com");
      const q = u.searchParams.get("q") || u.searchParams.get("url");
      if (q && /^https?:\/\//i.test(q)) return q;
    }
    if (/^https?:\/\//i.test(cleaned) && !/google\.[a-z.]+\/(search|aclk|imgres|httpservice)/i.test(cleaned)) {
      return cleaned;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function unwrapDdgUrl(href: string): string | null {
  try {
    let h = href.replace(/&amp;/g, "&");
    if (h.startsWith("//")) h = `https:${h}`;
    if (h.startsWith("/")) h = `https://duckduckgo.com${h}`;
    const u = new URL(h);
    const uddg = u.searchParams.get("uddg");
    if (uddg && /^https?:\/\//i.test(uddg)) return uddg;
    if (/^https?:\/\//i.test(h) && !/duckduckgo\.com/i.test(u.hostname)) return h;
  } catch {
    /* ignore */
  }
  return null;
}

function parseGoogleHtml(html: string): BrowserSearchHit[] {
  // Google often returns a JS challenge page to datacenter IPs — may yield 0 hits.
  if (/enablejs|sorry\/index|consent\.google/i.test(html) && !/\/url\?q=/i.test(html)) {
    return [];
  }
  const hits: BrowserSearchHit[] = [];
  const seen = new Set<string>();
  const patterns = [
    /<a[^>]+href="(\/url\?[^"]+|https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
    /href="(\/url\?q=[^"]+)"[^>]*>\s*<h3[^>]*>([\s\S]*?)<\/h3>/gi,
    /<h3[^>]*>\s*<a[^>]+href="(\/url\?[^"]+|https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(html)) && hits.length < 12) {
      const url = unwrapGoogleUrl(m[1]);
      if (!url || seen.has(url)) continue;
      if (/accounts\.google|support\.google|maps\.google|policies\.google|youtube\.com\/results/i.test(url)) continue;
      const title = decodeHtml(m[2].replace(/<[^>]+>/g, "").trim());
      if (!title || title.length < 2 || title.length > 200) continue;
      const after = html.slice(m.index, m.index + 900);
      const snipMatch =
        after.match(/class="BNeawe[^"]*"[^>]*>([\s\S]*?)<\/(?:div|span)>/i) ||
        after.match(/<div[^>]*class="[^"]*VwiC3b[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
      let snippet = snipMatch ? decodeHtml(snipMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()) : "";
      if (snippet.length > 280) snippet = snippet.slice(0, 277) + "…";
      seen.add(url);
      hits.push({ title, url, snippet });
    }
    if (hits.length) break;
  }
  return hits;
}

function parseDdgHtml(html: string): BrowserSearchHit[] {
  const hits: BrowserSearchHit[] = [];
  const seen = new Set<string>();
  const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && hits.length < 12) {
    const url = unwrapDdgUrl(m[1]);
    if (!url || seen.has(url)) continue;
    const title = decodeHtml(m[2].replace(/<[^>]+>/g, "").trim());
    if (!title) continue;
    const after = html.slice(m.index, m.index + 600);
    const snip = after.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|td|div)/i);
    let snippet = snip ? decodeHtml(snip[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()) : "";
    if (snippet.length > 280) snippet = snippet.slice(0, 277) + "…";
    seen.add(url);
    hits.push({ title, url, snippet });
  }
  return hits;
}

function parseBingHtml(html: string): BrowserSearchHit[] {
  const hits: BrowserSearchHit[] = [];
  const seen = new Set<string>();
  const patterns = [
    /<h2[^>]*>\s*<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
    /<a[^>]+class="[^"]*tilk[^"]*"[^>]+href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
    /<li[^>]+class="[^"]*b_algo[^"]*"[^>]*>[\s\S]*?<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) && hits.length < 12) {
      if (/bing\.com|microsoft\.com|msn\.com/i.test(m[1])) continue;
      if (seen.has(m[1])) continue;
      const title = decodeHtml(m[2].replace(/<[^>]+>/g, "").trim());
      if (!title || title.length < 2) continue;
      seen.add(m[1]);
      hits.push({ title, url: m[1], snippet: "" });
    }
    if (hits.length) break;
  }
  return hits;
}

function parseGenericLinks(html: string): BrowserSearchHit[] {
  const hits: BrowserSearchHit[] = [];
  const seen = new Set<string>();
  const re = /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && hits.length < 12) {
    const url = m[1];
    if (seen.has(url)) continue;
    if (/accounts\.|login\.|support\.|policies\./i.test(url)) continue;
    const title = decodeHtml(m[2].replace(/<[^>]+>/g, "").trim());
    if (!title || title.length < 3 || title.length > 200) continue;
    seen.add(url);
    hits.push({ title, url, snippet: "" });
  }
  return hits;
}

function engineTarget(engine: string, q: string, custom?: string | null) {
  switch (engine) {
    case "bing":
      return `https://www.bing.com/search?q=${encodeURIComponent(q)}`;
    case "duckduckgo":
      return `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`;
    case "brave":
      return `https://search.brave.com/search?q=${encodeURIComponent(q)}`;
    case "startpage":
      return `https://www.startpage.com/sp/search?query=${encodeURIComponent(q)}`;
    case "ecosia":
      return `https://www.ecosia.org/search?q=${encodeURIComponent(q)}`;
    case "qwant":
      return `https://www.qwant.com/?q=${encodeURIComponent(q)}`;
    case "custom": {
      const tpl = (custom || "https://duckduckgo.com/?q={q}").trim();
      return tpl.includes("{q}") ? tpl.replaceAll("{q}", encodeURIComponent(q)) : `${tpl}${encodeURIComponent(q)}`;
    }
    default:
      return `https://www.google.com/search?q=${encodeURIComponent(q)}&hl=en&gl=us&gbv=1&num=10`;
  }
}

function liveOpenUrl(engine: string, q: string, custom?: string | null) {
  // Prefer the full JS site for “Live results”, not the lite scrape URL
  if (engine === "duckduckgo") return `https://duckduckgo.com/?q=${encodeURIComponent(q)}`;
  if (engine === "google") return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
  return engineTarget(engine, q, custom);
}

const FETCH_HEADERS: HeadersInit = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
};

async function fetchHtml(url: string) {
  const res = await fetch(url, {
    headers: FETCH_HEADERS,
    redirect: "follow",
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  const html = await res.text();
  return { res, html };
}

function parseForEngine(engine: string, html: string): BrowserSearchHit[] {
  if (engine === "google" || !engine) return parseGoogleHtml(html);
  if (engine === "duckduckgo") return parseDdgHtml(html);
  if (engine === "bing") return parseBingHtml(html);
  return parseGenericLinks(html).filter((h) => {
    try {
      const host = new URL(h.url).hostname;
      return !/brave\.com$|startpage\.com$|ecosia\.org$|qwant\.com$|duckduckgo\.com$/i.test(host);
    } catch {
      return false;
    }
  });
}

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") || "").trim().slice(0, 200);
  if (!q) return NextResponse.json({ error: "Missing q" }, { status: 400 });

  const engine = (req.nextUrl.searchParams.get("engine") || "google").toLowerCase();
  const custom = req.nextUrl.searchParams.get("custom");
  const dns = parseBrowserDnsFromRequest(req.nextUrl.searchParams);
  const target = engineTarget(engine, q, custom);
  const openUrl = liveOpenUrl(engine, q, custom);
  const livePreferred = req.nextUrl.searchParams.get("live") === "1";

  try {
    let dnsMeta: Awaited<ReturnType<typeof resolveDoh>> | null = null;
    if (dns.endpoint) {
      try {
        dnsMeta = await resolveDoh(new URL(target).hostname, dns.endpoint, dns.dns);
        if (dnsMeta.blocked) {
          return NextResponse.json({
            q,
            engine,
            google: openUrl,
            results: [] as BrowserSearchHit[],
            fetched: false,
            live: true,
            dns: dnsMeta,
            error: `Search host blocked by ${dns.dns === "nextdns" ? "NextDNS" : "DNS"} — open Live results`,
          });
        }
      } catch {
        /* ignore */
      }
    }

    if (livePreferred) {
      return NextResponse.json({
        q,
        engine,
        source: target,
        google: openUrl,
        results: [] as BrowserSearchHit[],
        fetched: false,
        live: true,
        dns: dnsMeta,
      });
    }

    let results: BrowserSearchHit[] = [];
    let status = 0;
    let source = target;
    let scrapeEngine = engine;

    try {
      const { res, html } = await fetchHtml(target);
      status = res.status;
      results = parseForEngine(engine, html);
    } catch {
      /* fall through to DDG backup */
    }

    // Google (and some others) block datacenter scrapes — always fall back to DDG HTML lite
    if (!results.length && engine !== "duckduckgo") {
      try {
        const ddgUrl = engineTarget("duckduckgo", q);
        const { res, html } = await fetchHtml(ddgUrl);
        const ddgHits = parseDdgHtml(html);
        if (ddgHits.length) {
          results = ddgHits;
          status = res.status;
          source = ddgUrl;
          scrapeEngine = "duckduckgo";
        }
      } catch {
        /* ignore */
      }
    }

    // Still empty → tell client to open live view immediately
    const live = results.length === 0;

    return NextResponse.json({
      q,
      engine,
      scrapeEngine,
      source,
      google: openUrl,
      results,
      fetched: results.length > 0,
      live,
      status,
      dns: dnsMeta,
      ...(live
        ? { error: "Live results — search page opened with Shields (scrape blocked by the engine)." }
        : scrapeEngine !== engine
          ? { note: `Showing results via ${scrapeEngine} (primary engine blocked scraping).` }
          : {}),
    });
  } catch (e) {
    return NextResponse.json({
      q,
      engine,
      google: openUrl,
      results: [] as BrowserSearchHit[],
      fetched: false,
      live: true,
      error: e instanceof Error ? e.message : "Fetch failed",
    });
  }
}
