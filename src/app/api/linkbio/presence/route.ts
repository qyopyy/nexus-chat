export const dynamic = "force-dynamic";

/** Public Nexus Link presence poll — mirrors Nexus online status for /bio pages. */
export async function GET(req: Request) {
  const u = new URL(req.url).searchParams.get("u")?.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 24);
  if (!u) return Response.json({ status: "offline" }, { status: 400 });
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
    if (!r.ok) return Response.json({ status: "offline" }, { headers: { "Cache-Control": "no-store" } });
    const data = await r.json();
    return Response.json(data ?? { status: "offline" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ status: "offline" }, { headers: { "Cache-Control": "no-store" } });
  }
}
