import { NextResponse } from "next/server";
import { IPA_KIND_META, type IpaKind } from "@/lib/ipaDownloads";

export const runtime = "edge";
export const dynamic = "force-dynamic";

type GhRelease = {
  tag_name: string;
  name: string | null;
  html_url: string;
  published_at: string | null;
  assets: { name: string; browser_download_url: string }[];
};

function kindOf(raw: string | null): IpaKind {
  if (raw === "wump" || raw === "link" || raw === "browser" || raw === "nexus" || raw === "appstore") return raw;
  return "nexus";
}

/** Public latest IPA asset from GitHub Releases (Sideloadly / AltStore / App Store signed). */
export async function GET(req: Request) {
  const kind = kindOf(new URL(req.url).searchParams.get("kind"));
  const meta = IPA_KIND_META[kind];

  try {
    const r = await fetch("https://api.github.com/repos/qyopyy/nexus-chat/releases?per_page=40", {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "nexus-chat-ipa-latest",
      },
      next: { revalidate: 120 },
    });
    if (!r.ok) {
      return NextResponse.json({ error: "github_unavailable", status: r.status }, { status: 502 });
    }
    const releases = (await r.json()) as GhRelease[];
    for (const rel of releases) {
      const tag = rel.tag_name || "";
      // Sideloadly Nexus tags are `ios-N` — never match `ios-appstore-N` for kind=nexus.
      if (kind === "nexus") {
        if (!/^ios-\d+$/.test(tag)) continue;
      } else if (!tag.startsWith(meta.tagPrefix)) {
        continue;
      }
      const asset =
        rel.assets?.find((a) => a.name === meta.assetHint) ||
        rel.assets?.find((a) => a.name.toLowerCase().endsWith(".ipa"));
      if (!asset) continue;
      return NextResponse.json({
        kind,
        tag: rel.tag_name,
        name: rel.name || rel.tag_name,
        url: asset.browser_download_url,
        publishedAt: rel.published_at,
        htmlUrl: rel.html_url,
        transporterOk: !!meta.transporterOk,
      });
    }
    return NextResponse.json({ error: "not_found", kind }, { status: 404 });
  } catch (e) {
    return NextResponse.json({ error: "fetch_failed", message: String(e) }, { status: 500 });
  }
}
