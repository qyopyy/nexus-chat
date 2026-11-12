import { NextResponse } from "next/server";
import { cookieOptions, exchangeCode, open, SC_COOKIE, SC_PKCE, seal, soundCloudConfigured, soundCloudMe } from "@/lib/soundcloudServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function back(req: Request, sc: string) {
  const url = new URL("/acetate/app", new URL(req.url).origin);
  url.searchParams.set("sc", sc);
  const res = NextResponse.redirect(url);
  res.cookies.set(SC_PKCE, "", cookieOptions(0));
  return res;
}

export async function GET(req: Request) {
  if (!soundCloudConfigured()) return back(req, "config");
  const url = new URL(req.url);
  if (url.searchParams.get("error")) return back(req, "denied");
  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  const cookie = req.headers.get("cookie") || "";
  const raw = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${SC_PKCE}=`))?.slice(SC_PKCE.length + 1);
  const pkce = open<{ verifier: string; state: string; userId: string }>(raw ? decodeURIComponent(raw) : undefined);
  if (!pkce || pkce.state !== state || !code) return back(req, "state");
  try {
    const token = await exchangeCode(req, code, pkce.verifier);
    const me = await soundCloudMe(token.access_token || "");
    if (!me || !token.access_token || !token.refresh_token) return back(req, "token");
    const res = back(req, "connected");
    res.cookies.set(SC_COOKIE, seal({
      access: token.access_token,
      refresh: token.refresh_token,
      exp: Date.now() + (token.expires_in ?? 3600) * 1000,
      scId: me.id,
      name: me.name,
      userId: pkce.userId,
    }), cookieOptions(60 * 60 * 24 * 30));
    return res;
  } catch {
    return back(req, "token");
  }
}
