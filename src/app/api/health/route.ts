import { NextResponse } from "next/server";
import { cacheStats } from "@/lib/serverCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Lightweight liveness for uptime monitors + deploy checks. */
export async function GET() {
  const started = Date.now();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  let db: "ok" | "skip" | "down" = "skip";
  if (supabaseUrl) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 2500);
      const r = await fetch(`${supabaseUrl.replace(/\/$/, "")}/auth/v1/health`, {
        signal: ctrl.signal,
        headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "" },
      }).catch(() => null);
      clearTimeout(t);
      db = r && r.status < 500 ? "ok" : "down";
    } catch {
      db = "down";
    }
  }

  const ok = db !== "down";
  return NextResponse.json(
    {
      ok,
      service: "nexus",
      at: new Date().toISOString(),
      processUptimeSec: Math.round(process.uptime()),
      latencyMs: Date.now() - started,
      db,
      cache: cacheStats(),
      build: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || "dev",
    },
    {
      status: ok ? 200 : 503,
      headers: {
        "Cache-Control": "no-store",
        "CDN-Cache-Control": "no-store",
      },
    },
  );
}
