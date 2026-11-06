import { NextRequest, NextResponse } from "next/server";
import { parseBrowserDnsFromRequest, resolveDoh } from "@/lib/browserDns";
import { applyShieldsToHtml, emptyShieldStats, type ShieldFilterOptions } from "@/lib/browserShields";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseShields(sp: URLSearchParams): ShieldFilterOptions & { enabled: boolean; httpsOnly: boolean } {
  const enabled = sp.get("shields") !== "0";
  return {
    enabled,
    blockAds: sp.get("ads") !== "0",
    blockTrackers: sp.get("trackers") !== "0",
    blockFingerprinting: sp.get("fp") !== "0",
    blockScripts: sp.get("scripts") === "1",
    httpsOnly: sp.get("httpsOnly") !== "0",
  };
}

function rewriteAssetUrls(html: string, pageUrl: string, proxyBase: string, shieldQs: string) {
  // Point same-document navigations / relative links through our proxy when possible for <a href>
  return html.replace(/\b(href|src)=["']([^"']+)["']/gi, (full, attr: string, raw: string) => {
    if (/^(#|mailto:|tel:|javascript:|data:|about:)/i.test(raw)) return full;
    let abs: string;
    try {
      abs = new URL(raw, pageUrl).toString();
    } catch {
      return full;
    }
    if (!/^https?:/i.test(abs)) return full;
    // Keep stylesheets/images on origin when not proxied deeply — only rewrite top-level navigations for href of anchors is enough via <base>
    if (attr.toLowerCase() === "href" && !/\.(css|js|png|jpe?g|gif|webp|svg|woff2?|ico)(\?|$)/i.test(abs)) {
      return `${attr}="${proxyBase}?url=${encodeURIComponent(abs)}${shieldQs}"`;
    }
    return full;
  });
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const raw = (sp.get("url") || "").trim();
  const shields = parseShields(sp);
  const dns = parseBrowserDnsFromRequest(sp);

  let url: URL;
  try {
    url = new URL(raw);
    if (!/^https?:$/i.test(url.protocol)) throw new Error("Only http(s)");
  } catch {
    return new NextResponse("Invalid url", { status: 400 });
  }

  if (shields.httpsOnly && url.protocol === "http:") {
    url.protocol = "https:";
  }

  // Optional DoH / NextDNS preflight — block page if DNS says so
  if (dns.endpoint) {
    const lookup = await resolveDoh(url.hostname, dns.endpoint, dns.dns);
    if (lookup.blocked) {
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>Blocked by DNS</title>
<style>body{font-family:system-ui;background:#0b1220;color:#e2e8f0;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px;text-align:center}
card{max-width:420px}h1{font-size:1.25rem;margin:0 0 8px}p{color:#94a3b8;line-height:1.5}</style></head>
<body><div><h1>Blocked by ${dns.dns === "nextdns" ? "NextDNS" : "DNS"}</h1>
<p><code>${url.hostname}</code> was blocked by your DNS shield before the page loaded.</p>
<p style="font-size:12px;opacity:.7">${url.toString()}</p></div></body></html>`;
      return new NextResponse(html, {
        status: 200,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "x-nexus-shield-blocked": "dns",
          "cache-control": "no-store",
        },
      });
    }
  }

  try {
    const res = await fetch(url.toString(), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 NexusBrowser/1.0",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });

    const ctype = res.headers.get("content-type") || "";
    const finalUrl = res.url || url.toString();

    if (!/text\/html|application\/xhtml/i.test(ctype)) {
      // Pass through non-HTML (rare for iframe navigations)
      const buf = await res.arrayBuffer();
      return new NextResponse(buf, {
        status: res.status,
        headers: {
          "content-type": ctype || "application/octet-stream",
          "cache-control": "no-store",
        },
      });
    }

    let html = await res.text();
    if (html.length > 1_500_000) html = html.slice(0, 1_500_000);

    let stats = emptyShieldStats();
    if (shields.enabled) {
      const applied = applyShieldsToHtml(html, finalUrl, shields);
      html = applied.html;
      stats = applied.stats;
    }

    // <base> keeps relative assets loading from the origin site
    const baseTag = `<base href="${finalUrl.replace(/"/g, "")}">`;
    if (/<head[\s>]/i.test(html)) html = html.replace(/<head([^>]*)>/i, `<head$1>${baseTag}`);
    else html = `<head>${baseTag}</head>${html}`;

    const proxyBase = `${req.nextUrl.origin}/api/browser/proxy`;
    const shieldQs =
      `&shields=${shields.enabled ? "1" : "0"}` +
      `&ads=${shields.blockAds ? "1" : "0"}` +
      `&trackers=${shields.blockTrackers ? "1" : "0"}` +
      `&fp=${shields.blockFingerprinting ? "1" : "0"}` +
      `&scripts=${shields.blockScripts ? "1" : "0"}` +
      `&httpsOnly=${shields.httpsOnly ? "1" : "0"}` +
      (dns.dns !== "system" ? `&dns=${encodeURIComponent(dns.dns)}` : "") +
      (dns.nextDnsConfig ? `&nextdns=${encodeURIComponent(dns.nextDnsConfig)}` : "") +
      (dns.customDohUrl ? `&doh=${encodeURIComponent(dns.customDohUrl)}` : "");

    if (shields.enabled) {
      html = rewriteAssetUrls(html, finalUrl, proxyBase, shieldQs);
    }

    return new NextResponse(html, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "x-nexus-shield-blocked": String(stats.blocked),
        "x-nexus-shield-ads": String(stats.ads),
        "x-nexus-shield-trackers": String(stats.trackers),
        "x-nexus-final-url": finalUrl,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Proxy failed";
    const html = `<!doctype html><html><body style="font-family:system-ui;background:#0b1220;color:#fff;padding:24px"><h1>Couldn't load page</h1><p>${msg}</p></body></html>`;
    return new NextResponse(html, { status: 502, headers: { "content-type": "text/html; charset=utf-8" } });
  }
}
