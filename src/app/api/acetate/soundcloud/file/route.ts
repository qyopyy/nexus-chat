import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/apiGuard";
import {
  cookieOptions,
  sniffAudioExt,
  flagEnabled,
  liveSession,
  readDownload,
  SC_COOKIE,
  soundCloudConfigured,
  soundCloudMe,
  userFromRequest,
} from "@/lib/soundcloudServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function cookieValue(req: Request) {
  const cookie = req.headers.get("cookie") || "";
  const raw = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${SC_COOKIE}=`));
  return raw ? decodeURIComponent(raw.slice(SC_COOKIE.length + 1)) : undefined;
}

export async function GET(req: Request) {
  const limited = rateLimit(req, "sc-file", 20, 10 * 60_000);
  if (limited) return limited;
  if (!soundCloudConfigured()) return NextResponse.json({ error: "SoundCloud not configured" }, { status: 503 });
  if (!(await flagEnabled("soundcloud_import"))) return NextResponse.json({ error: "SoundCloud import is turned off" }, { status: 403 });
  const user = await userFromRequest(req);
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id") || "";
  if (!/^[0-9]{1,20}$/.test(id)) return NextResponse.json({ error: "Unknown SoundCloud track" }, { status: 400 });
  try {
    const { session, sealed } = await liveSession(cookieValue(req));
    if (!session || session.userId !== user.id) return NextResponse.json({ error: "Connect SoundCloud first" }, { status: 401 });
    const me = await soundCloudMe(session.access);
    const file = await readDownload(session.access, me?.id || session.scId, id);
    const ext = sniffAudioExt(file.bytes, file.type);
    const headers = new Headers({
      "Content-Type": file.type.startsWith("audio/") ? file.type : "application/octet-stream",
      "Cache-Control": "no-store",
      "X-Acetate-Title": encodeURIComponent(file.card.title),
      "X-Acetate-Artist": encodeURIComponent(file.card.artist),
      "X-Acetate-Source": encodeURIComponent(file.card.permalink),
      "X-Acetate-Art": encodeURIComponent(file.card.artwork || ""),
      "X-Acetate-Ext": ext,
    });
    const res = new NextResponse(Buffer.from(file.bytes), { headers });
    if (sealed) res.cookies.set(SC_COOKIE, sealed, cookieOptions(60 * 60 * 24 * 30));
    return res;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "SoundCloud didn't provide that download" }, { status: 400 });
  }
}
