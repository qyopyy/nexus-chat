import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/apiGuard";
import { linkSecurityHeaders } from "@/lib/linkProtect";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limited = rateLimit(req, "linkbio-hit", 120, 60_000);
  if (limited) {
    const h = linkSecurityHeaders(limited.headers);
    return new NextResponse(limited.body, { status: 429, headers: h });
  }

  const u = req.nextUrl.searchParams.get("u")?.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 24);
  if (!u) return new NextResponse(null, { status: 204, headers: linkSecurityHeaders() });
  try {
    await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/linkbio_hit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
        Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""}`,
      },
      body: JSON.stringify({ p_username: u }),
      cache: "no-store",
    });
  } catch {
    /* ignore */
  }
  return new NextResponse(null, { status: 204, headers: linkSecurityHeaders() });
}
