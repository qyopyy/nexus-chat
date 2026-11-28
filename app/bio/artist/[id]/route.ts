import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/apiGuard";
import { artistSiteResponse } from "@/lib/artistSiteServer";

export const dynamic = "force-dynamic";

/** Public artist website: /bio/artist/<spotify artist id | nexus handle> */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (rateLimit(req, "artist-site", 120, 60_000)) return new NextResponse("<h1>Too many requests</h1>", { status: 429, headers: { "Content-Type": "text/html; charset=utf-8", "Retry-After": "30" } });
  return (await artistSiteResponse(req, decodeURIComponent((await params).id)))!;
}
