import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/apiGuard";
import { linkSecurityHeaders, scanLinkUrl } from "@/lib/linkProtect";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const limited = rateLimit(req, "linkbio-click", 90, 60_000);
  if (limited) {
    const h = linkSecurityHeaders(limited.headers);
    return new NextResponse(limited.body, { status: 429, headers: h });
  }

  try {
    const body = (await req.json()) as { u?: string; url?: string };
    const u = String(body.u ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "")
      .slice(0, 24);
    const url = String(body.url ?? "").slice(0, 500);
    if (!u || !url) return new NextResponse(null, { status: 204, headers: linkSecurityHeaders() });
    const scan = scanLinkUrl(url);
    if (!scan.ok) return new NextResponse(null, { status: 204, headers: linkSecurityHeaders({ "X-Nexus-Link-Protect": "malware-block" }) });

    await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/linkbio_click`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
        Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""}`,
      },
      body: JSON.stringify({ p_username: u, p_url: scan.url }),
      cache: "no-store",
    });
  } catch {
    /* ignore */
  }
  return new NextResponse(null, { status: 204, headers: linkSecurityHeaders() });
}
