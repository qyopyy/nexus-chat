import { NextResponse } from "next/server";
import { validateUsername } from "@/lib/validation/profile";

export const dynamic = "force-dynamic";

/** Public profile JSON: GET /api/profile/<username> → username, name, bio, links, custom domain. */
export async function GET(_req: Request, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const v = validateUsername(decodeURIComponent(username));
  if (!v.ok) return NextResponse.json({ profile: null, error: v.error }, { status: 400 });
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  try {
    const r = await fetch(`${base}/rest/v1/profiles?select=id,username,display_name,bio,links,avatar_url&username=eq.${encodeURIComponent(v.value)}&limit=1`, { headers, cache: "no-store" });
    const row = r.ok ? ((await r.json()) as { id: string; username: string; display_name: string | null; bio: string | null; links: unknown; avatar_url: string | null }[])[0] : undefined;
    if (!row) return NextResponse.json({ profile: null }, { status: 404 });
    const d = await fetch(`${base}/rest/v1/rpc/profile_domain_of`, { method: "POST", headers, body: JSON.stringify({ p_user: row.id }), cache: "no-store" });
    const domain = d.ok ? ((await d.json()) as string | null) : null;
    const { id: _id, ...pub } = row;
    void _id;
    return NextResponse.json({ profile: { ...pub, custom_domain: domain, url: `https://nexusproject.cc/u/${row.username}` } }, { headers: { "Cache-Control": "public, max-age=30, s-maxage=30" } });
  } catch {
    return NextResponse.json({ profile: null, error: "Unavailable" }, { status: 503 });
  }
}
