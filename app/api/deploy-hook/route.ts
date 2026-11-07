import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Vercel (Pro) deploy webhook → Supabase Realtime.
 * In Vercel: Settings → Webhooks → add https://nexusproject.cc/api/deploy-hook for "Deployment Succeeded",
 * then save the webhook's secret as VERCEL_WEBHOOK_SECRET in the project's environment variables.
 * Every open Nexus app hears the announcement instantly and refreshes to the new build.
 */
export async function POST(req: Request) {
  const secret = process.env.VERCEL_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "VERCEL_WEBHOOK_SECRET is not set" }, { status: 503 });
  const raw = await req.text();
  const sig = req.headers.get("x-vercel-signature") ?? "";
  const want = createHmac("sha1", secret).update(raw).digest("hex");
  const ok = sig.length === want.length && timingSafeEqual(Buffer.from(sig), Buffer.from(want));
  if (!ok) return NextResponse.json({ error: "Bad signature" }, { status: 401 });

  let body: { type?: string; payload?: { target?: string | null; deployment?: { id?: string; meta?: Record<string, string> } } } = {};
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }
  if (!/deployment\.(succeeded|ready|promoted)/.test(body.type ?? "")) return NextResponse.json({ skipped: body.type ?? "unknown" });
  if (body.payload?.target && body.payload.target !== "production") return NextResponse.json({ skipped: "preview" });

  // same id /api/version reports (commit SHA, else deployment id)
  const build = body.payload?.deployment?.meta?.githubCommitSha || body.payload?.deployment?.id || "";
  if (!build) return NextResponse.json({ skipped: "no build id" });
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const r = await fetch(`${base}/rest/v1/rpc/announce_release`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_build: build.slice(0, 64), p_source: "vercel" }),
    cache: "no-store",
  }).catch(() => null);
  return NextResponse.json({ announced: !!r?.ok, build: build.slice(0, 12) });
}
