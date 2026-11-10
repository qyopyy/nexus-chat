import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fails = new Map<string, { n: number; at: number }>();

type VersionRow = {
  id: string;
  label: string | null;
  version: number;
  path: string;
  mime: string | null;
  bytes: number;
  duration: number | null;
  peaks: unknown;
};

type TrackRow = {
  id: string;
  title: string;
  note: string | null;
  position?: number;
  artwork_path: string | null;
  versions: VersionRow[];
  comments: { id: string; at: number; body: string; name: string; created_at: string }[];
};

type OpenRow = {
  ok: boolean;
  reason?: string;
  share_id?: string;
  kind?: "track" | "project";
  listing?: string;
  download?: boolean;
  title?: string;
  note?: string | null;
  artwork_path?: string | null;
  owner?: string | null;
  owner_name?: string | null;
  tracks?: TrackRow[];
};

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function locked(token: string) {
  const hit = fails.get(token);
  return !!hit && hit.n >= 8 && Date.now() - hit.at < 10 * 60_000;
}

function noteFail(token: string) {
  const hit = fails.get(token);
  fails.set(token, { n: (hit?.n ?? 0) + 1, at: Date.now() });
}

async function sign(admin: SupabaseClient, path: string | null | undefined, downloadName?: string) {
  if (!path) return null;
  const { data, error } = await admin.storage.from("acetate").createSignedUrl(
    path,
    downloadName ? 120 : 3600,
    downloadName ? { download: downloadName } : undefined,
  );
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

function findVersion(tracks: TrackRow[], versionId: string) {
  for (const track of tracks) {
    const version = (track.versions ?? []).find((v) => v.id === versionId);
    if (version) return { track, version };
  }
  return null;
}

export async function POST(req: Request) {
  const admin = adminClient();
  if (!admin) {
    return NextResponse.json(
      {
        ok: false,
        reason: "signer",
        message: "Set SUPABASE_SERVICE_ROLE_KEY on the server, or deploy the acetate edge function.",
      },
      { status: 501 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    token?: string;
    password?: string | null;
    version_id?: string | null;
  };
  const token = String(body.token ?? "").replace(/[^a-f0-9]/gi, "").slice(0, 64);
  if (token.length < 16) return NextResponse.json({ ok: false, reason: "missing" }, { status: 404 });
  if (locked(token)) return NextResponse.json({ ok: false, reason: "too_many" }, { status: 429 });

  const touch = body.action === "open";
  const { data, error } = await admin.rpc("acetate_share_open", {
    p_token: token,
    p_password: body.password ?? null,
    p_touch: touch,
  });
  if (error) return NextResponse.json({ ok: false, reason: "missing", message: error.message }, { status: 500 });
  const opened = (data ?? { ok: false, reason: "missing" }) as OpenRow;
  if (!opened.ok) {
    if (opened.reason === "password") noteFail(token);
    const status = opened.reason === "password" || opened.reason === "too_many" ? 403 : 404;
    return NextResponse.json(opened, { status });
  }
  fails.delete(token);
  const tracks = opened.tracks ?? [];

  if (body.action === "download") {
    if (!opened.download) return NextResponse.json({ ok: false, reason: "download" }, { status: 403 });
    const found = findVersion(tracks, String(body.version_id ?? ""));
    if (!found) return NextResponse.json({ ok: false, reason: "missing" }, { status: 404 });
    const name = `${found.track.title}${found.version.label ? ` — ${found.version.label}` : ""}`;
    const url = await sign(admin, found.version.path, name);
    if (!url) return NextResponse.json({ ok: false, reason: "storage" }, { status: 500 });
    return NextResponse.json({ ok: true, url, name });
  }

  const art = await sign(admin, opened.artwork_path);
  const signedTracks = [];
  for (const track of tracks) {
    const trackArt = await sign(admin, track.artwork_path);
    const versions = [];
    for (const version of track.versions ?? []) {
      versions.push({
        id: version.id,
        label: version.label,
        version: version.version,
        mime: version.mime,
        bytes: version.bytes,
        duration: version.duration,
        peaks: version.peaks,
        url: await sign(admin, version.path),
      });
    }
    signedTracks.push({
      id: track.id,
      title: track.title,
      note: null,
      lyrics: (track as { lyrics?: string | null }).lyrics ?? null,
      position: track.position,
      art: trackArt,
      versions,
      comments: track.comments ?? [],
    });
  }

  return NextResponse.json({
    ok: true,
    kind: opened.kind,
    listing: opened.listing,
    download: opened.download,
    title: opened.title,
    note: opened.note,
    owner: opened.owner,
    owner_name: opened.owner_name,
    art,
    tracks: signedTracks,
  });
}
