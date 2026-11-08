/**
 * Server-only SSRF guard for routes that fetch user-supplied URLs (browser proxy, reader, link previews, image proxy).
 * Blocks private / loopback / link-local / CGNAT / metadata / multicast addresses — including names that *resolve*
 * to them — and re-checks every redirect hop.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export function privateIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith("::ffff:")) return privateIp(v.slice(7)) || !/^\d+\.\d+\.\d+\.\d+$/.test(v.slice(7));
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe8") || v.startsWith("fe9") || v.startsWith("fea") || v.startsWith("feb") || v.startsWith("ff") || v.startsWith("64:ff9b") || v.startsWith("2001:db8");
}

/** returns the URL if it is a public http(s) address, otherwise null */
export async function safePublicUrl(raw: string | URL): Promise<URL | null> {
  let u: URL;
  try {
    u = new URL(String(raw));
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (u.username || u.password) return null;
  if (u.port && !["80", "443", "8080", "8443"].includes(u.port)) return null;
  const host = u.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  if (isIP(host)) return privateIp(host) ? null : u;
  if (!host.includes(".") || /(^|\.)(local|internal|localhost|localdomain|home|lan|intranet|corp)$/i.test(host)) return null;
  try {
    const addrs = await lookup(host, { all: true });
    if (!addrs.length || addrs.some((a) => privateIp(a.address))) return null;
  } catch {
    return null;
  }
  return u;
}

/** fetch() that follows at most `maxHops` redirects, validating each hop with safePublicUrl */
export async function fetchPublic(raw: string | URL, init: RequestInit & { maxHops?: number } = {}): Promise<{ res: Response; url: URL }> {
  let url = await safePublicUrl(raw);
  if (!url) throw new Error("That address isn't allowed");
  const hops = init.maxHops ?? 5;
  for (let i = 0; i <= hops; i++) {
    const res = await fetch(url, { ...init, redirect: "manual" });
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) {
      const next = await safePublicUrl(new URL(loc, url));
      if (!next) throw new Error("Redirected to an address that isn't allowed");
      url = next;
      continue;
    }
    return { res, url };
  }
  throw new Error("Too many redirects");
}

export const escHtml = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** proxied third-party pages render in an opaque origin: they can run, but can't touch nexusproject.cc storage/cookies */
export const SANDBOX_HEADERS = {
  "content-security-policy": "sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation; frame-ancestors 'self'",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
} as const;
