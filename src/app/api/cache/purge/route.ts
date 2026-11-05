import { NextRequest, NextResponse } from "next/server";
import { authorizeCron } from "@/lib/apiGuard";
import { cacheClearAll, cachePrune, cacheStats } from "@/lib/serverCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Daily cron (vercel.json — Hobby-safe) + manual admin purge.
 * Clears process-local API caches so the server stays fast and fresh.
 * Use `0 * * * *` on Vercel Pro if you want hourly.
 */
export async function GET(req: NextRequest) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const before = cacheStats();
  const pruned = cachePrune();
  const cleared = cacheClearAll();
  return NextResponse.json(
    {
      ok: true,
      at: new Date().toISOString(),
      pruned,
      cleared,
      before,
      after: cacheStats(),
      note: "In-memory API caches cleared. Static /_next chunks stay immutable; HTML/API already no-store.",
    },
    {
      headers: {
        "Cache-Control": "no-store",
        "CDN-Cache-Control": "no-store",
      },
    },
  );
}

export async function POST(req: NextRequest) {
  return GET(req);
}
