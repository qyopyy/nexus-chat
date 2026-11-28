import { NextResponse } from "next/server";
import { ERROR_TEXT } from "@/lib/ipaRelease";
import { isKind, latestBuilds } from "@/lib/ipaServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE = { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" };

/** Newest build for one app. The link in the answer is OUR download address, so the repo can stay private. */
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("kind");
  const kind = isKind(raw) ? raw : "nexus";
  const r = await latestBuilds([kind]);
  if (!r.ok) return NextResponse.json({ error: r.error, message: ERROR_TEXT[r.error] }, { status: r.error === "rate_limited" ? 429 : 503 });
  const b = r.builds[kind];
  if (!b) return NextResponse.json({ error: "not_found", message: ERROR_TEXT.not_found, kind }, { status: 404 });
  return NextResponse.json(b, { headers: CACHE });
}
