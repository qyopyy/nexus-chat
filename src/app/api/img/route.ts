import { safePublicUrl } from "@/lib/netGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX = 8 * 1024 * 1024;

const safeUrl = (raw: string) => safePublicUrl(raw);

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
