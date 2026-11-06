/** Compact ad / tracker lists inspired by Brave Shields + EasyList / EasyPrivacy. */

export type ShieldFilterOptions = {
  blockAds: boolean;
  blockTrackers: boolean;
  blockFingerprinting: boolean;
  blockScripts: boolean;
};

export type ShieldStats = {
  blocked: number;
  ads: number;
  trackers: number;
  scripts: number;
  fingerprinting: number;
};

const AD_HOSTS = new Set(
  [
    "doubleclick.net",
    "googlesyndication.com",
    "googleadservices.com",
    "googletagservices.com",
    "pagead2.googlesyndication.com",
    "adservice.google.com",
    "adservice.google.hu",
    "ads.yahoo.com",
    "ad.doubleclick.net",
    "adnxs.com",
    "adsrvr.org",
    "advertising.com",
    "adform.net",
    "adcash.com",
    "adcolony.com",
    "adsafeprotected.com",
    "moatads.com",
    "criteo.com",
    "criteo.net",
    "taboola.com",
    "outbrain.com",
    "mgid.com",
    "revcontent.com",
    "popads.net",
    "popcash.net",
    "propellerads.com",
    "exoclick.com",
    "openx.net",
    "pubmatic.com",
    "rubiconproject.com",
    "casalemedia.com",
    "smartadserver.com",
    "media.net",
    "amazon-adsystem.com",
    "aax.amazon-adsystem.com",
    "ads-twitter.com",
    "ads.linkedin.com",
    "ads.facebook.com",
    "an.facebook.com",
    "carbonads.net",
    "carbonads.com",
    "buysellads.com",
  ].map((h) => h.toLowerCase()),
);

const TRACKER_HOSTS = new Set(
  [
    "google-analytics.com",
    "www.google-analytics.com",
    "ssl.google-analytics.com",
    "googletagmanager.com",
    "www.googletagmanager.com",
    "googleoptimize.com",
    "stats.g.doubleclick.net",
    "connect.facebook.net",
    "facebook.net",
    "pixel.facebook.com",
    "analytics.twitter.com",
    "static.ads-twitter.com",
    "snap.licdn.com",
    "px.ads.linkedin.com",
    "hotjar.com",
    "static.hotjar.com",
    "script.hotjar.com",
    "clarity.ms",
    "www.clarity.ms",
    "mixpanel.com",
    "cdn.mxpnl.com",
    "segment.com",
    "cdn.segment.com",
    "segment.io",
    "amplitude.com",
    "api.amplitude.com",
    "fullstory.com",
    "rs.fullstory.com",
    "sentry.io",
    "browser.sentry-cdn.com",
    "newrelic.com",
    "nr-data.net",
    "mouseflow.com",
    "quantserve.com",
    "scorecardresearch.com",
    "chartbeat.com",
    "chartbeat.net",
    "parsely.com",
    "pingdom.net",
    "matomo.cloud",
    "statcounter.com",
    "yandex.ru",
    "mc.yandex.ru",
    "bat.bing.com",
    "c.bing.com",
    "tr.snapchat.com",
    "sc-static.net",
    "tiktok.com",
    "analytics.tiktok.com",
    "pinterest.com",
    "ct.pinterest.com",
    "branch.io",
    "app.link",
    "appsflyer.com",
    "adjust.com",
    "kochava.com",
    "doubleverify.com",
    "adobedtm.com",
    "omtrdc.net",
    "demdex.net",
    "everesttech.net",
    "bluekai.com",
    "krxd.net",
    "liadm.com",
    "rlcdn.com",
    "agkn.com",
    "exelator.com",
    "tapad.com",
    "bidswitch.net",
    "3lift.com",
    "sharethrough.com",
    "spotxchange.com",
    "teads.tv",
    "yieldmo.com",
  ].map((h) => h.toLowerCase()),
);

const FINGERPRINT_HOSTS = new Set(
  [
    "fingerprint.com",
    "fpjs.io",
    "api.fpjs.io",
    "cdn.fingerprintjs.com",
    "perimeterx.net",
    "px-cdn.net",
    "px-client.net",
    "datadome.co",
    "captcha-delivery.com",
    "kasada.io",
    "akamaihd.net",
    "akamaized.net",
    "threatmetrix.com",
    "iovation.com",
  ].map((h) => h.toLowerCase()),
);

const AD_PATH_RE =
  /(?:^|\/)(?:ads?|adserver|advert|banner|sponsor|promo|popunder|clicktrack)(?:\/|$|\.)/i;
const TRACKER_PATH_RE =
  /(?:^|\/)(?:analytics|pixel|tracking|beacon|collect|gtag|ga\.js|gtm\.js|fbevents|hotjar|clarity)(?:\/|$|\.)/i;

function hostOf(raw: string): string | null {
  try {
    const u = new URL(raw, "https://example.invalid");
    return u.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function hostMatches(host: string, set: Set<string>) {
  if (set.has(host)) return true;
  for (const d of set) {
    if (host === d || host.endsWith(`.${d}`)) return true;
  }
  return false;
}

export function classifyBlockedUrl(raw: string, opts: ShieldFilterOptions): "ads" | "trackers" | "fingerprinting" | null {
  const host = hostOf(raw);
  if (!host) return null;
  let path = "";
  try {
    path = new URL(raw, "https://example.invalid").pathname;
  } catch {
    /* ignore */
  }

  if (opts.blockFingerprinting && hostMatches(host, FINGERPRINT_HOSTS)) return "fingerprinting";
  if (opts.blockAds && (hostMatches(host, AD_HOSTS) || AD_PATH_RE.test(path))) return "ads";
  if (opts.blockTrackers && (hostMatches(host, TRACKER_HOSTS) || TRACKER_PATH_RE.test(path))) return "trackers";
  return null;
}

export function emptyShieldStats(): ShieldStats {
  return { blocked: 0, ads: 0, trackers: 0, scripts: 0, fingerprinting: 0 };
}

/** Strip ads/trackers/scripts from HTML and rewrite resource URLs to about:blank when blocked. */
export function applyShieldsToHtml(html: string, pageUrl: string, opts: ShieldFilterOptions): { html: string; stats: ShieldStats } {
  const stats = emptyShieldStats();
  if (!opts.blockAds && !opts.blockTrackers && !opts.blockFingerprinting && !opts.blockScripts) {
    return { html, stats };
  }

  let out = html;

  const bump = (kind: ReturnType<typeof classifyBlockedUrl> | "scripts") => {
    stats.blocked += 1;
    if (kind === "ads") stats.ads += 1;
    else if (kind === "trackers") stats.trackers += 1;
    else if (kind === "fingerprinting") stats.fingerprinting += 1;
    else if (kind === "scripts") stats.scripts += 1;
  };

  // Remove known tracking / ad scripts wholesale
  out = out.replace(/<script\b[^>]*src=["']([^"']+)["'][^>]*>\s*<\/script>/gi, (full, src: string) => {
    let abs = src;
    try {
      abs = new URL(src, pageUrl).toString();
    } catch {
      /* keep */
    }
    const kind = classifyBlockedUrl(abs, opts);
    if (kind || opts.blockScripts) {
      bump(kind || "scripts");
      return "<!-- nexus-shield: blocked script -->";
    }
    return full;
  });

  if (opts.blockScripts) {
    out = out.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, () => {
      bump("scripts");
      return "<!-- nexus-shield: blocked inline script -->";
    });
  } else {
    // Inline scripts that pull trackers by common patterns
    out = out.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gi, (full, body: string) => {
      if (
        /google-analytics|googletagmanager|fbq\(|ttq\.|hotjar|clarity\(|doubleclick|adsbygoogle/i.test(body)
      ) {
        bump("trackers");
        return "<!-- nexus-shield: blocked tracker script -->";
      }
      return full;
    });
  }

  out = out.replace(/<(iframe|img|video|audio|source|embed|object|link|script)\b([^>]*?)>/gi, (full, tag: string, attrs: string) => {
    const srcMatch = attrs.match(/\b(?:src|href)=["']([^"']+)["']/i);
    if (!srcMatch) return full;
    let abs = srcMatch[1];
    try {
      abs = new URL(srcMatch[1], pageUrl).toString();
    } catch {
      /* keep */
    }
    const kind = classifyBlockedUrl(abs, opts);
    if (!kind) return full;
    bump(kind);
    if (/^iframe$/i.test(tag)) return `<!-- nexus-shield: blocked ${kind} iframe -->`;
    if (/^link$/i.test(tag)) return `<!-- nexus-shield: blocked ${kind} link -->`;
    return `<${tag}${attrs.replace(/\b(?:src|href)=["'][^"']+["']/i, ' src="about:blank"')}>`;
  });

  // Meta refresh / tracking pixels in CSS urls are out of scope; inject CSP nudge
  const csp = `<meta http-equiv="Content-Security-Policy" content="upgrade-insecure-requests">`;
  if (/<head[\s>]/i.test(out)) {
    out = out.replace(/<head([^>]*)>/i, `<head$1>${csp}`);
  } else {
    out = csp + out;
  }

  const badge = `<div id="nexus-shield-badge" style="all:initial;position:fixed;z-index:2147483646;right:12px;bottom:12px;font:600 11px/1.2 system-ui,sans-serif;color:#e2e8f0;background:rgba(15,23,42,.92);border:1px solid rgba(96,165,250,.35);border-radius:999px;padding:8px 12px;box-shadow:0 8px 24px rgba(0,0,0,.35)">Nexus Shields · ${stats.blocked} blocked</div>`;
  if (/<\/body>/i.test(out)) out = out.replace(/<\/body>/i, `${badge}</body>`);
  else out += badge;

  return { html: out, stats };
}

export function summarizeShields(stats: ShieldStats) {
  if (!stats.blocked) return "Shields up · nothing blocked yet";
  const parts = [
    stats.ads ? `${stats.ads} ads` : null,
    stats.trackers ? `${stats.trackers} trackers` : null,
    stats.fingerprinting ? `${stats.fingerprinting} fingerprinting` : null,
    stats.scripts ? `${stats.scripts} scripts` : null,
  ].filter(Boolean);
  return `${stats.blocked} blocked · ${parts.join(" · ")}`;
}
