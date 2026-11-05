import { inviteNotFound, renderInvitePage, type InvitePreview } from "@/lib/invitePage";

export const dynamic = "force-dynamic";

async function fetchPreview(code: string): Promise<InvitePreview | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  try {
    const r = await fetch(`${url.replace(/\/$/, "")}/rest/v1/rpc/space_invite_preview`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ p_code: code }),
      cache: "no-store",
    });
    if (!r.ok) return null;
    const j = (await r.json()) as InvitePreview | null;
    if (!j || !j.id || !j.name) return null;
    return j;
  } catch {
    return null;
  }
}

/** Public server invite landing + OG embed banner: /i/<code> */
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params;
  const code = decodeURIComponent(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 64);
  const origin = new URL(req.url).origin;
  const html = { "Content-Type": "text/html; charset=utf-8" };

  if (!code) {
    return new Response(inviteNotFound("empty", origin), { status: 404, headers: html });
  }

  const preview = await fetchPreview(code);
  if (!preview) {
    return new Response(inviteNotFound(code, origin), {
      status: 404,
      headers: { ...html, "Cache-Control": "public, max-age=30" },
    });
  }

  return new Response(renderInvitePage({ ...preview, invite_code: preview.invite_code || code }, origin), {
    headers: {
      ...html,
      "Cache-Control": "public, max-age=60, s-maxage=120, stale-while-revalidate=600",
    },
  });
}
