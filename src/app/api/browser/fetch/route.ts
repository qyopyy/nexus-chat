import { NextRequest, NextResponse } from "next/server";
import { parseBrowserDnsFromRequest, resolveDoh } from "@/lib/browserDns";
import { extractArticleFromHtml } from "@/lib/browserReading";
import { applyShieldsToHtml, emptyShieldStats } from "@/lib/browserShields";
import { rateLimit } from "@/lib/apiGuard";
import { fetchPublic } from "@/lib/netGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Fetch a page from the open internet and return a readable text preview (+ shield stats). */
export async function GET(req: NextRequest) {
  const limited = rateLimit(req, "browser-fetch", 60, 60_000);
  if (limited) return limited;
  const raw = (req.nextUrl.searchParams.get("url") || "").trim();
  const shieldsOn = req.nextUrl.searchParams.get("shields") !== "0";
  const blockAds = req.nextUrl.searchParams.get("ads") !== "0";
  const blockTrackers = req.nextUrl.searchParams.get("trackers") !== "0";
  const blockFp = req.nextUrl.searchParams.get("fp") !== "0";
  const blockScripts = req.nextUrl.searchParams.get("scripts") === "1";
  const httpsOnly = req.nextUrl.searchParams.get("httpsOnly") !== "0";
  const dns = parseBrowserDnsFromRequest(req.nextUrl.searchParams);

  let url: URL;
  try {
    url = new URL(raw);
    if (!/^https?:$/i.test(url.protocol)) throw new Error("Only http(s)");
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }

  if (httpsOnly && url.protocol === "http:") url.protocol = "https:";

  if (dns.endpoint) {
    const lookup = await resolveDoh(url.hostname, dns.endpoint, dns.dns);
    if (lookup.blocked) {
      return NextResponse.json({
        url: url.toString(),
        title: "Blocked by DNS",
        text: `${url.hostname} was blocked by your ${dns.dns === "nextdns" ? "NextDNS" : "DNS"} configuration.`,
        status: 451,
        shields: { ...emptyShieldStats(), blocked: 1, trackers: 1 },
        dns: lookup,
      });
    }
  }

  try {
    const { res, url: landed } = await fetchPublic(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 NexusBrowser/1.0",
        Accept: "text/html,application/xhtml+xml",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    const ctype = res.headers.get("content-type") || "";
    const finalUrl = landed.toString();
    if (!/text\/html|application\/xhtml/i.test(ctype) && !ctype.includes("text/")) {
      return NextResponse.json({
        url: finalUrl,
        title: url.hostname,
        text: `Binary or non-HTML content (${ctype || "unknown"}). Open in a new tab to view.`,
        status: res.status,
        shields: emptyShieldStats(),
      });
    }
    let html = await res.text();
    if (html.length > 500_000) html = html.slice(0, 500_000);

    let stats = emptyShieldStats();
    if (shieldsOn) {
      const applied = applyShieldsToHtml(html, finalUrl, {
        blockAds,
        blockTrackers,
        blockFingerprinting: blockFp,
        blockScripts,
      });
      html = applied.html;
      stats = applied.stats;
    }

    const article = extractArticleFromHtml(html, finalUrl);
    const title = article.title || url.hostname;
    const text =
      article.paragraphs.join("\n\n").slice(0, 8000) ||
      html
        .replace(/<!--[\s\S]*?-->/g, " ")
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 8000);
    return NextResponse.json({
      url: finalUrl,
      title,
      text,
      article,
      status: res.status,
      shields: stats,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Fetch failed" }, { status: 502 });
  }
}
