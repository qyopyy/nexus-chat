import { callShare, renderShare, type ShareInfo } from "@/lib/sharePage";

export const dynamic = "force-dynamic";

type Got = { ok: boolean; url?: string; reason?: string };
const html = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };

async function go(token: string, mode: string, password: string | null) {
  const r = await callShare<Got>({ action: "get", token, mode, password });
  if (r?.ok && r.url) return Response.redirect(r.url, 303);
  // show the page again with the reason (wrong password, expired…)
  const info = (await callShare<ShareInfo>({ action: "info", token })) ?? { ok: false, reason: "missing" };
  return new Response(renderShare(token, info, r?.reason ?? "storage"), { status: 403, headers: html });
}

/** inline preview for links without a password (audio / video / image tags) */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const mode = new URL(req.url).searchParams.get("mode") === "download" ? "download" : "preview";
  return go(token, mode, null);
}

/** form submit: download / open, with optional password */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const f = await req.formData();
  return go(token, f.get("mode") === "preview" ? "preview" : "download", (f.get("password") as string | null) || null);
}
