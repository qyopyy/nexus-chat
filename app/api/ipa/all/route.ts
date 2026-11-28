import { NextResponse } from "next/server";
import { ERROR_TEXT } from "@/lib/ipaRelease";
import { ALL_KINDS, latestBuilds } from "@/lib/ipaServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Every app's newest build from a single GitHub call. */
export async function GET() {
  const r = await latestBuilds(ALL_KINDS);
  if (!r.ok) return NextResponse.json({ error: r.error, message: ERROR_TEXT[r.error] }, { status: r.error === "rate_limited" ? 429 : 503 });
  return NextResponse.json({ builds: r.builds, checkedAt: new Date().toISOString() }, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } });
}
