import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/apiGuard";
import { authorizeUrl, cookieOptions, flagEnabled, pkcePair, SC_PKCE, seal, soundCloudConfigured, userFromRequest } from "@/lib/soundcloudServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const limited = rateLimit(req, "sc-connect", 10, 10 * 60_000);
  if (limited) return limited;
  if (!soundCloudConfigured()) {
    return NextResponse.json({ configured: false, error: "SoundCloud not configured" }, { status: 503 });
  }
  if (!(await flagEnabled("soundcloud_import"))) {
    return NextResponse.json({ error: "SoundCloud import is turned off" }, { status: 403 });
  }
  const user = await userFromRequest(req);
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const pkce = pkcePair();
  const res = NextResponse.json({ url: authorizeUrl(req, pkce.challenge, pkce.state) });
  res.cookies.set(SC_PKCE, seal({ ...pkce, userId: user.id }), cookieOptions(10 * 60));
  return res;
}
