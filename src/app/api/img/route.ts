import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX = 8 * 1024 * 1024;

/** private, loopback, link-local, CGNAT, metadata … — never fetched */
function privateIp(ip: string) {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("::ffff:") || v.startsWith("64:ff9b");
}

async function safeUrl(raw: string): Promise<URL | null> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (u.username || u.password) return null;
  if (u.port && !["80", "443", "8080", "8443"].includes(u.port)) return null;
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) return privateIp(host) ? null : u;
  if (!host.includes(".") || /\.(local|internal|localhost)$/i.test(host)) return null;
  try {
    const addrs = await lookup(host, { all: true });
    if (!addrs.length || addrs.some((a) => privateIp(a.address))) return null;
  } catch {
    return null;
  }
  return u;
}

/** Privacy image proxy for link previews: GET /api/img?u=<image url>. Images only, 8 MB max. */
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("u") ?? "";
  let url = await safeUrl(raw);
  if (!url) return new Response("Blocked", { status: 400 });
  for (let hop = 0; hop < 4; hop++) {
    let r: Response;
    try {
      r = await fetch(url, {
        redirect: "manual",
        headers: { "User-Agent": "NexusImageProxy/1.0 (+https://nexusproject.cc)", Accept: "image/avif,image/webp,image/*;q=0.9" },
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      return new Response("Fetch failed", { status: 502 });
    }
    if (r.status >= 300 && r.status < 400 && r.headers.get("location")) {
      url = await safeUrl(new URL(r.headers.get("location")!, url).toString());
      if (!url) return new Response("Blocked redirect", { status: 400 });
      continue;
    }
    const type = r.headers.get("content-type") ?? "";
    if (!r.ok || !/^image\/(png|jpe?g|gif|webp|avif|bmp|x-icon|vnd\.microsoft\.icon)/i.test(type)) return new Response("Not an image", { status: 415 });
    const len = Number(r.headers.get("content-length") ?? 0);
    if (len > MAX) return new Response("Too large", { status: 413 });
    const buf = await r.arrayBuffer();
    if (buf.byteLength > MAX) return new Response("Too large", { status: 413 });
    return new Response(buf, {
      headers: {
        "Content-Type": type,
        "Cache-Control": "public, max-age=86400, s-maxage=604800, immutable",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      },
    });
  }
  return new Response("Too many redirects", { status: 508 });
}
