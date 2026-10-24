import { callShare, renderShare, type ShareInfo } from "@/lib/sharePage";

export const dynamic = "force-dynamic";

/** public vault share link: /s/<token> */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const info = (await callShare<ShareInfo>({ action: "info", token })) ?? { ok: false, reason: "missing" };
  return new Response(renderShare(token, info), { status: info.ok ? 200 : 404, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}
