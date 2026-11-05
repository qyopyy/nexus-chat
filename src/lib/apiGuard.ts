import { NextRequest, NextResponse } from "next/server";

/** Simple sliding-window rate limit per IP (process-local). */
const hits = new Map<string, number[]>();

export function clientIp(req: NextRequest) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

export function rateLimit(req: NextRequest, key: string, limit: number, windowMs: number): NextResponse | null {
  const id = `${key}:${clientIp(req)}`;
  const now = Date.now();
  const windowStart = now - windowMs;
  const prev = (hits.get(id) ?? []).filter((t) => t > windowStart);
  prev.push(now);
  hits.set(id, prev);
  if (prev.length > limit) {
    return NextResponse.json({ error: "Too many requests — slow down" }, { status: 429, headers: { "Retry-After": "30" } });
  }
  // opportunistic cleanup
  if (hits.size > 5_000) {
    for (const [k, times] of hits) {
      const kept = times.filter((t) => t > windowStart);
      if (!kept.length) hits.delete(k);
      else hits.set(k, kept);
    }
  }
  return null;
}

/** Authorize Vercel Cron / manual purge with CRON_SECRET (or Vercel's cron header). */
export function authorizeCron(req: NextRequest): boolean {
  // Vercel automatically attaches this on scheduled invocations
  if (req.headers.get("x-vercel-cron") === "1") return true;
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // allow in local/dev when unset so health tools still work; production should set CRON_SECRET for manual calls
    return process.env.NODE_ENV !== "production";
  }
  const auth = req.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const q = req.nextUrl.searchParams.get("secret") || "";
  return bearer === secret || q === secret;
}
