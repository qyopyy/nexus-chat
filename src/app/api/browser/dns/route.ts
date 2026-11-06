import { NextRequest, NextResponse } from "next/server";
import { parseBrowserDnsFromRequest, resolveDoh } from "@/lib/browserDns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Probe a hostname through the selected DoH / NextDNS endpoint. */
export async function GET(req: NextRequest) {
  const name = (req.nextUrl.searchParams.get("name") || "").trim().slice(0, 253);
  if (!name) return NextResponse.json({ error: "Missing name" }, { status: 400 });
  const dns = parseBrowserDnsFromRequest(req.nextUrl.searchParams);
  const result = await resolveDoh(name, dns.endpoint, dns.dns);
  return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
}
