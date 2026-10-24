import { callSmartlink } from "@/lib/smartlinkPage";

export const dynamic = "force-dynamic";

/** counts the click, then sends the fan to the store */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string; service: string }> }) {
  const { slug, service } = await params;
  const country = req.headers.get("x-vercel-ip-country") ?? "";
  const { data } = await callSmartlink<{ url: string | null }>({ action: "track", slug, kind: "click", service, country });
  const url = data?.url && /^https:\/\//.test(data.url) ? data.url : `/l/${encodeURIComponent(slug)}`;
  return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "no-store" } });
}
