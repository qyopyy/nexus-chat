import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/apiGuard";
import { linkSecurityHeaders } from "@/lib/linkProtect";

export const dynamic = "force-dynamic";

/** Public Nexus Link presence poll — mirrors Nexus online status for /bio pages. */
export async function GET(req: NextRequest) {
  const limited = rateLimit(req, "linkbio-presence", 60, 60_000);
  if (limited) {
    const h = linkSecurityHeaders(limited.headers);
    return new NextResponse(limited.body, { status: 429, headers: h });
  }

  const u = req.nextUrl.searchParams.get("u")?.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 24);
  if (!u) return NextResponse.json({ status: "offline" }, { status: 400, headers: linkSecurityHeaders() });
  try {
    const r = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/linkbio_presence`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
        Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""}`,
      },
      body: JSON.stringify({ p_username: u }),
      cache: "no-store",
    });
    if (!r.ok) {
      return NextResponse.json({ status: "offline" }, { headers: linkSecurityHeaders({ "Cache-Control": "no-store" }) });
    }
    const data = await r.json();
    return NextResponse.json(data ?? { status: "offline" }, {
      headers: linkSecurityHeaders({ "Cache-Control": "no-store" }),
    });
  } catch {
    return NextResponse.json({ status: "offline" }, { headers: linkSecurityHeaders({ "Cache-Control": "no-store" }) });
  }
}
