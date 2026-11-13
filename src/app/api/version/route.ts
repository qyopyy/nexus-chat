import { NextResponse } from "next/server";
import { ACETATE_RELEASE, NEXUS_RELEASE } from "@/lib/releaseNotes";

/** Build identity the Capacitor shells poll so a web deploy reloads them instantly. */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET() {
  const build =
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ||
    process.env.VERCEL_DEPLOYMENT_ID ||
    process.env.CF_PAGES_COMMIT_SHA ||
    "dev";
  const deployedAt = process.env.VERCEL_DEPLOYMENT_ID
    ? new Date().toISOString()
    : new Date().toISOString();
  return NextResponse.json(
    {
      build,
      short: build.slice(0, 12),
      at: deployedAt,
      nexus: NEXUS_RELEASE.version,
      acetate: ACETATE_RELEASE.version,
      // Phone shells load this host remotely — no APK/IPA rebuild needed for UI.
      live: true,
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "CDN-Cache-Control": "no-store",
        "Vercel-CDN-Cache-Control": "no-store",
      },
    },
  );
}
