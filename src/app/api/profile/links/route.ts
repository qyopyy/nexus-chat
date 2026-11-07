import { NextResponse } from "next/server";
import { MUSIC_PLATFORMS, PLATFORMS } from "@/lib/links";

/** The link platforms profiles support (music / artist profiles and socials). Links are edited in the app. */
export async function GET() {
  return NextResponse.json({
    platforms: PLATFORMS.map((p) => ({ id: p.id, label: p.label, music: MUSIC_PLATFORMS.has(p.id) })),
  });
}
