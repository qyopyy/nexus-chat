import { callUntitled, renderSharePage, type ShareInfo, type ShareOpen } from "@/lib/untitledPage";

export const dynamic = "force-dynamic";

/** Public Untitled share link: /t/<token> */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token: raw } = await params;
  const token = raw.replace(/[^A-Za-z0-9]/g, "").slice(0, 64);
  const info = (await callUntitled<ShareInfo>({ action: "info", token })) ?? { ok: false, reason: "missing" };
  let open: ShareOpen | null = null;
  if (info.ok && !info.password) {
    open = (await callUntitled<ShareOpen>({ action: "open", token })) ?? null;
  }
  return new Response(renderSharePage(token, info, open), {
    status: info.ok ? 200 : 404,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token: raw } = await params;
  const token = raw.replace(/[^A-Za-z0-9]/g, "").slice(0, 64);
  const form = await req.formData().catch(() => null);
  const password = String(form?.get("password") ?? "");
  const info = (await callUntitled<ShareInfo>({ action: "info", token })) ?? { ok: false, reason: "missing" };
  const open = (await callUntitled<ShareOpen>({ action: "open", token, password })) ?? null;
  const error = open && !open.ok ? open.reason : !open?.ok ? "password" : undefined;
  return new Response(renderSharePage(token, info, open?.ok ? open : null, error), {
    status: open?.ok ? 200 : 401,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  });
}
