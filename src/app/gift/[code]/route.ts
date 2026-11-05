import { giftNotFound, renderGiftPage, type GiftPreview } from "@/lib/giftPage";

export const dynamic = "force-dynamic";

async function fetchPreview(code: string): Promise<GiftPreview | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  try {
    const r = await fetch(`${url.replace(/\/$/, "")}/rest/v1/rpc/premium_gift_preview`, {
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
    const j = (await r.json()) as GiftPreview | null;
    if (!j || !j.code) return null;
    return j;
  } catch {
    return null;
  }
}

/** Public premium gift landing (Nitro-style): /gift/<code> */
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params;
  const code = decodeURIComponent(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 32);
  const origin = new URL(req.url).origin;
  const html = { "Content-Type": "text/html; charset=utf-8" };

  if (!code) {
    return new Response(giftNotFound("empty", origin), { status: 404, headers: html });
  }

  const preview = await fetchPreview(code);
  if (!preview) {
    return new Response(giftNotFound(code, origin), {
      status: 404,
      headers: { ...html, "Cache-Control": "public, max-age=30" },
    });
  }

  return new Response(renderGiftPage(preview, origin), {
    headers: {
      ...html,
      "Cache-Control": "public, max-age=30, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
