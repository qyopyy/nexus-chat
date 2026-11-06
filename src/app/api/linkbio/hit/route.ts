export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = new URL(req.url).searchParams.get("u")?.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 24);
  if (!u) return new Response(null, { status: 204 });
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
  return new Response(null, { status: 204 });
}
