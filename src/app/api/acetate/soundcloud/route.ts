import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/apiGuard";
import {
  cookieOptions,
  flagEnabled,
  listOwnTracks,
  liveSession,
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

function stamp(res: NextResponse, sealed: string | null) {
  if (sealed) res.cookies.set(SC_COOKIE, sealed, cookieOptions(60 * 60 * 24 * 30));
  return res;
}

export async function GET(req: Request) {
  const limited = rateLimit(req, "sc-status", 60, 10 * 60_000);
  if (limited) return limited;
  if (!soundCloudConfigured()) {
    return NextResponse.json({ configured: false, connected: false, error: "SoundCloud not configured" });
  }
  if (!(await flagEnabled("soundcloud_import"))) {
    return NextResponse.json({ configured: true, connected: false, disabled: true, error: "SoundCloud import is turned off" }, { status: 403 });
  }
  const user = await userFromRequest(req);
  if (!user) return NextResponse.json({ configured: true, connected: false, error: "Sign in required" }, { status: 401 });
  try {
    const { session, sealed } = await liveSession(cookieValue(req));
    if (!session || session.userId !== user.id) {
      return stamp(NextResponse.json({ configured: true, connected: false }), sealed);
    }
    const me = await soundCloudMe(session.access);
    const view = new URL(req.url).searchParams.get("view");
    const tracks = view === "library" ? await listOwnTracks(session.access, me?.id || session.scId) : undefined;
    return stamp(NextResponse.json({
      configured: true,
      connected: true,
      username: me?.name || session.name,
      tracks,
    }), sealed);
  } catch (error) {
    return NextResponse.json({ configured: true, connected: false, error: error instanceof Error ? error.message : "SoundCloud isn't available" }, { status: 502 });
  }
}

export async function DELETE(req: Request) {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SC_COOKIE, "", cookieOptions(0));
  return res;
}
