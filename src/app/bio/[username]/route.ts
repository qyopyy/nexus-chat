import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/apiGuard";
import { linkSecurityHeaders } from "@/lib/linkProtect";
import { renderLinkBio, linkBioNotFound, type PublicLinkBio } from "@/lib/linkbioPage";

export const dynamic = "force-dynamic";

/** Public Nexus Link page: /bio/<username> — rate-limited + security headers */
export async function GET(req: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  const limited = rateLimit(req, "linkbio-page", 180, 60_000);
  if (limited) {
    return new NextResponse(
      `<!doctype html><html><head><meta charset="utf-8"><title>Slow down · Nexus Link</title></head><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#07060f;color:#f4f2ff;font:15px system-ui;text-align:center;padding:24px"><div><h1>Too many requests</h1><p style="color:#a9a3c9">Nexus Link DDoS protection kicked in. Try again in a moment.</p></div></body></html>`,
      { status: 429, headers: linkSecurityHeaders({ "Content-Type": "text/html; charset=utf-8", "Retry-After": "30" }) },
    );
  }

  const { username } = await params;
  const name = decodeURIComponent(username).toLowerCase().replace(/^@/, "").replace(/[^a-z0-9_]/g, "").slice(0, 24);
  const base = req.nextUrl.origin;
  const cookie = req.headers.get("cookie") || "";
  const m = cookie.match(new RegExp(`(?:^|;\\s*)lb_unlock_${name}=([^;]+)`));
  const unlock = m ? decodeURIComponent(m[1]) : null;

  let data: PublicLinkBio | null = null;
  try {
    const r = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/linkbio_public`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
        Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""}`,
      },
      body: JSON.stringify({ p_username: name, p_unlock: unlock }),
      cache: "no-store",
    });
    if (r.ok) data = (await r.json()) as PublicLinkBio | null;
  } catch {
    /* network */
  }
  if (!data) {
    return new NextResponse(linkBioNotFound(name, base), {
      status: 404,
      headers: linkSecurityHeaders({ "Content-Type": "text/html; charset=utf-8" }),
    });
  }
  return new NextResponse(renderLinkBio(data, base), {
    headers: linkSecurityHeaders({
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, max-age=10",
    }),
  });
}
