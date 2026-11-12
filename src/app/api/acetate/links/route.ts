import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/apiGuard";
import { resolveLink } from "@/lib/linkResolve";
import { flagEnabled } from "@/lib/soundcloudServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const limited = rateLimit(req, "link-import", 30, 10 * 60_000);
  if (limited) return limited;
  if (!(await flagEnabled("link_import"))) {
    return NextResponse.json({ error: "Link import is turned off" }, { status: 403 });
  }
  const body = (await req.json().catch(() => null)) as { url?: string } | null;
  const url = String(body?.url || "").trim();
  if (!url || url.length > 500) return NextResponse.json({ error: "Paste a Spotify, YouTube, or SoundCloud link." }, { status: 400 });
  try {
    const result = await resolveLink(url);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Couldn't read that link" }, { status: 400 });
  }
}
