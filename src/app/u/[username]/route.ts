import { renderGramProfile, gramNotFound, type PublicGram } from "@/lib/gramPage";

export const dynamic = "force-dynamic";

/** public NexusGram profile: /u/<username> (no login needed) */
export async function GET(req: Request, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const name = decodeURIComponent(username).toLowerCase().replace(/^@/, "").replace(/[^a-z0-9_.]/g, "").slice(0, 24);
  const html = { "Content-Type": "text/html; charset=utf-8" };
  const base = new URL(req.url).origin;
  let data: PublicGram | null = null;
  try {
    const r = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/gram_profile`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "", Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""}` },
      body: JSON.stringify({ p_username: name }),
      cache: "no-store",
    });
    if (r.ok) data = (await r.json()) as PublicGram | null;
  } catch {
    /* network */
  }
  if (!data) return new Response(gramNotFound(name, base), { status: 404, headers: html });
  return new Response(renderGramProfile(data, base), { headers: { ...html, "Cache-Control": "public, max-age=30, s-maxage=30" } });
}
