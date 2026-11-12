import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/apiGuard";
import { assertMetadataOnly } from "@/lib/acetateImportParse";
import {
  cookieOptions,
  flagEnabled,
  liveSession,
  resolveTrack,
  SC_COOKIE,
  soundCloudConfigured,
  soundCloudMe,
  userFromRequest,
} from "@/lib/soundcloudServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cookieValue(req: Request) {
  const cookie = req.headers.get("cookie") || "";
  const raw = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${SC_COOKIE}=`));
  return raw ? decodeURIComponent(raw.slice(SC_COOKIE.length + 1)) : undefined;
}

export async function POST(req: Request) {
  const limited = rateLimit(req, "sc-resolve", 30, 10 * 60_000);
  if (limited) return limited;
  if (!soundCloudConfigured()) return NextResponse.json({ configured: false, error: "SoundCloud not configured" }, { status: 503 });
  if (!(await flagEnabled("soundcloud_import"))) return NextResponse.json({ error: "SoundCloud import is turned off" }, { status: 403 });
  const user = await userFromRequest(req);
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { url?: string } | null;
  try {
    const { session, sealed } = await liveSession(cookieValue(req));
    if (!session || session.userId !== user.id) return NextResponse.json({ error: "Connect SoundCloud first" }, { status: 401 });
    const me = await soundCloudMe(session.access);
    const track = await resolveTrack(session.access, me?.id || session.scId, String(body?.url || ""));
    assertMetadataOnly(track);
    const res = NextResponse.json({ track });
    if (sealed) res.cookies.set(SC_COOKIE, sealed, cookieOptions(60 * 60 * 24 * 30));
    return res;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "SoundCloud didn't return that track" }, { status: 400 });
  }
}
