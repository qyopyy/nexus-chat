import { fetchUntitledProfile, renderProfilePage } from "@/lib/untitledPage";

export const dynamic = "force-dynamic";

/** Public Untitled profile: /m/<username> */
export async function GET(_req: Request, { params }: { params: Promise<{ username: string }> }) {
  const { username: raw } = await params;
  const username = decodeURIComponent(raw).toLowerCase().replace(/[^a-z0-9_.]/g, "").slice(0, 24);
  const p = username ? await fetchUntitledProfile(username) : null;
  if (!p) {
    return new Response(
      `<!doctype html><html><body style="background:#12100e;color:#8a8478;font:16px system-ui;display:grid;place-items:center;min-height:100vh">Profile not found. <a href="/" style="color:#c4a574">Nexus</a></body></html>`,
      { status: 404, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
    );
  }
  return new Response(renderProfilePage(p), {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  });
}
