/**
 * Nexus Link malware + abuse guards for public pages, link saves, and APIs.
 * Pairs with malwareGuard (uploads) and apiGuard (rate limits / DDoS).
 */

const DANGEROUS_SCHEMES = /^(javascript|data|vbscript|file|blob):/i;
const DANGEROUS_PATH_EXT =
  /\.(exe|dll|msi|bat|cmd|ps1|vbs|js|jse|wsf|hta|scr|apk|dmg|pkg|sh|php|asp|aspx|jsp|cgi)(\?|#|$)/i;

/** High-risk / known-abuse host patterns (substring match on hostname). */
const BLOCKED_HOST_PARTS = [
  "bit.ly/malware",
  "malware.",
  "phishing.",
  "ransom.",
  "cryptolocker",
  "coin-hive",
  "coinhive",
  "grabify",
  "iplogger",
  "2no.co",
  "yip.su",
  "ps3cfw",
  "steamcommunity.com.ru",
];

const LOOKALIKE_BRANDS = [
  /paypa[l1]\./i,
  /faceb[o0]{2}k\./i,
  /micr[o0]soft\./i,
  /app[l1]e\.com\./i,
  /tiktok\.[a-z0-9-]+\.(ru|cn|tk|ml|ga|cf|gq)$/i,
  /snapchat\.[a-z0-9-]+\.(ru|tk|ml)$/i,
];

export type LinkUrlScan = { ok: true; url: string } | { ok: false; reason: string };

export function scanLinkUrl(raw: string): LinkUrlScan {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return { ok: false, reason: "Empty link." };
  if (DANGEROUS_SCHEMES.test(trimmed)) {
    return { ok: false, reason: "That link scheme can run code — blocked." };
  }
  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    return { ok: false, reason: "Invalid URL." };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return { ok: false, reason: "Only http(s) links are allowed." };
  }
  if (u.username || u.password) {
    return { ok: false, reason: "Links with embedded credentials are blocked." };
  }
  const host = u.hostname.toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".local")) {
    return { ok: false, reason: "Localhost links aren't allowed on public pages." };
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) {
    return { ok: false, reason: "Raw IP links are blocked for safety." };
  }
  if (DANGEROUS_PATH_EXT.test(u.pathname)) {
    return { ok: false, reason: "Executable / script downloads are blocked." };
  }
  const full = `${host}${u.pathname}${u.search}`.toLowerCase();
  for (const part of BLOCKED_HOST_PARTS) {
    if (full.includes(part)) return { ok: false, reason: "That destination is on the Nexus Link blocklist." };
  }
  for (const re of LOOKALIKE_BRANDS) {
    if (re.test(host)) return { ok: false, reason: "Suspicious brand look-alike domain blocked." };
  }
  if (/[^\x20-\x7E]/.test(host) && /xn--/i.test(host) === false) {
    // allow IDN via punycode only after URL parser; still soft-check mixed scripts
  }
  return { ok: true, url: u.toString() };
}

/** Scan every link on a Nexus Link page before save. */
export function scanLinkList(links: { url?: string; label?: string; type?: string }[]): LinkUrlScan & { index?: number } {
  for (let i = 0; i < links.length; i++) {
    const r = scanLinkUrl(String(links[i]?.url ?? ""));
    if (!r.ok) return { ...r, index: i };
  }
  return { ok: true, url: "" };
}

/** Security headers for public /bio HTML and Link API responses. */
export function linkSecurityHeaders(extra?: HeadersInit): Headers {
  const h = new Headers(extra);
  h.set("X-Content-Type-Options", "nosniff");
  h.set("X-Frame-Options", "SAMEORIGIN");
  h.set("Referrer-Policy", "strict-origin-when-cross-origin");
  h.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  h.set("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  h.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'self'",
      "img-src 'self' data: blob: https:",
      "media-src 'self' https: blob:",
      "font-src 'self' https://fonts.gstatic.com data:",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "script-src 'self' 'unsafe-inline'",
      "connect-src 'self' https:",
      "frame-src https://open.spotify.com https://embed.spotify.com https://w.soundcloud.com https://embed.music.apple.com https:",
    ].join("; "),
  );
  return h;
}

export function rateLimitHeaders(retryAfterSec = 30): Record<string, string> {
  return {
    "Retry-After": String(retryAfterSec),
    "X-Nexus-Link-Protect": "rate-limit",
  };
}
