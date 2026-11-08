import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/apiGuard";
import { linkSecurityHeaders } from "@/lib/linkProtect";

export const dynamic = "force-dynamic";

/** Public Nexus Link "Listening on Spotify" poll — what the page owner is playing right now. */
export async function GET(req: NextRequest) {
  const limited = rateLimit(req, "linkbio-nowplaying", 90, 60_000);
  if (limited) return new NextResponse(limited.body, { status: 429, headers: linkSecurityHeaders(limited.headers) });

  const u = req.nextUrl.searchParams.get("u")?.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 24);
  const none = (status = 200) => NextResponse.json({ show: false, now: null }, { status, headers: linkSecurityHeaders({ "Cache-Control": "no-store" }) });
  if (!u) return none(400);
  try {
    const r = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/linkbio_now_playing`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
        Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""}`,
      },
      body: JSON.stringify({ p_username: u }),
      cache: "no-store",
    });
    if (!r.ok) return none();
    const data = await r.json();
    return NextResponse.json(data ?? { show: false, now: null }, { headers: linkSecurityHeaders({ "Cache-Control": "no-store" }) });
  } catch {
    return none();
  }
}
