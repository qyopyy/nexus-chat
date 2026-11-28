import { NextResponse } from "next/server";
import { ERROR_TEXT } from "@/lib/ipaRelease";
import { downloadTarget, isKind } from "@/lib/ipaServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Always-latest download address, e.g. /api/ipa/file?kind=nexus.
 * Looks up the newest release with the server-side token, then redirects to the short-lived signed link GitHub gives for
 * that file. The token never reaches the visitor and the signed link is never stored, so this address works forever.
 */
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("kind");
  if (!isKind(raw)) return NextResponse.json({ error: "unknown_kind" }, { status: 400 });
  const t = await downloadTarget(raw);
  if (!t.ok) return NextResponse.json({ error: t.error, message: ERROR_TEXT[t.error] ?? "Unavailable" }, { status: t.status, headers: { "Cache-Control": "no-store" } });
  return NextResponse.redirect(t.url, { status: 302, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}
