import { renderLinkBio, linkBioNotFound, type PublicLinkBio } from "@/lib/linkbioPage";

export const dynamic = "force-dynamic";

/** Public Nexus Link page: /bio/<username> */
export async function GET(req: Request, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const name = decodeURIComponent(username).toLowerCase().replace(/^@/, "").replace(/[^a-z0-9_]/g, "").slice(0, 24);
  const html = { "Content-Type": "text/html; charset=utf-8" };
  const base = new URL(req.url).origin;
  let data: PublicLinkBio | null = null;
  try {
    const r = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/linkbio_public`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
        Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""}`,
      },
      body: JSON.stringify({ p_username: name }),
      cache: "no-store",
    });
    if (r.ok) data = (await r.json()) as PublicLinkBio | null;
  } catch {
    /* network */
  }
  if (!data) return new Response(linkBioNotFound(name, base), { status: 404, headers: html });
  return new Response(renderLinkBio(data, base), { headers: { ...html, "Cache-Control": "public, max-age=20, s-maxage=20" } });
}
