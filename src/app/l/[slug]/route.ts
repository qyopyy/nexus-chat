import { callSmartlink, notFound, renderPage, type PageData } from "@/lib/smartlinkPage";

export const dynamic = "force-dynamic";

/** public smart link: /l/<slug> */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { data } = await callSmartlink<PageData>({ action: "page", slug });
  const html = { "Content-Type": "text/html; charset=utf-8" };
  if (!data) return new Response(notFound(), { status: 404, headers: html });
  const country = req.headers.get("x-vercel-ip-country") ?? "";
  const bot = /bot|crawl|spider|preview|facebookexternalhit|whatsapp|telegram|discord|slack/i.test(req.headers.get("user-agent") ?? "");
  if (!bot) await callSmartlink({ action: "track", slug, kind: "view", country });
  const base = new URL(req.url).origin;
  return new Response(renderPage(data, base), { headers: { ...html, "Cache-Control": "no-store" } });
}
