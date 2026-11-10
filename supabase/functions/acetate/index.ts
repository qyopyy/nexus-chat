// Public Acetate share playback.
// {action:"open", token, password?} → tracks with signed URLs
// {action:"download", token, password?, version_id}
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.119.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});
const fails = new Map<string, { n: number; at: number }>();

type VersionRow = { id: string; label: string | null; path: string; mime: string | null; bytes: number; duration: number | null; peaks: unknown; version: number };
type TrackRow = {
  id: string;
  title: string;
  note: string | null;
  position?: number;
  artwork_path: string | null;
  versions: VersionRow[];
  comments: unknown[];
};
type OpenRow = {
  ok: boolean;
  reason?: string;
  kind?: string;
  listing?: string;
  download?: boolean;
  title?: string;
  note?: string | null;
  artwork_path?: string | null;
  owner?: string | null;
  owner_name?: string | null;
  tracks?: TrackRow[];
};

async function sign(path: string | null | undefined, downloadName?: string) {
  if (!path) return null;
  const { data, error } = await admin.storage.from("acetate").createSignedUrl(
    path,
    downloadName ? 120 : 3600,
    downloadName ? { download: downloadName } : undefined,
  );
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const token = String(body.token ?? "").replace(/[^a-f0-9]/gi, "").slice(0, 64);
    if (token.length < 16) return json({ ok: false, reason: "missing" }, 404);
    const hit = fails.get(token);
    if (hit && hit.n >= 8 && Date.now() - hit.at < 10 * 60_000) return json({ ok: false, reason: "too_many" }, 429);

    const { data, error } = await admin.rpc("acetate_share_open", {
      p_token: token,
      p_password: body.password ?? null,
      p_touch: body.action === "open",
    });
    if (error) return json({ ok: false, reason: "missing" }, 500);
    const opened = (data ?? { ok: false, reason: "missing" }) as OpenRow;
    if (!opened.ok) {
      if (opened.reason === "password") fails.set(token, { n: (hit?.n ?? 0) + 1, at: Date.now() });
      return json(opened, opened.reason === "password" || opened.reason === "too_many" ? 403 : 404);
    }
    fails.delete(token);
    const tracks = opened.tracks ?? [];

    if (body.action === "download") {
      if (!opened.download) return json({ ok: false, reason: "download" }, 403);
      const versionId = String(body.version_id ?? "");
      let found: { track: TrackRow; version: VersionRow } | null = null;
      for (const track of tracks) {
        const version = (track.versions ?? []).find((v) => v.id === versionId);
        if (version) found = { track, version };
      }
      if (!found) return json({ ok: false, reason: "missing" }, 404);
      const name = `${found.track.title}${found.version.label ? ` — ${found.version.label}` : ""}`;
      const url = await sign(found.version.path, name);
      if (!url) return json({ ok: false, reason: "storage" }, 500);
      return json({ ok: true, url, name });
    }

    const art = await sign(opened.artwork_path);
    const signedTracks = [];
    for (const track of tracks) {
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
          url: await sign(version.path),
        });
      }
      signedTracks.push({
        id: track.id,
        title: track.title,
        note: null,
        lyrics: (track as { lyrics?: string | null }).lyrics ?? null,
        position: track.position,
        art: await sign(track.artwork_path),
        versions,
        comments: track.comments ?? [],
      });
    }
    return json({
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
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
