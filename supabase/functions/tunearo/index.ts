// Nexus ↔ Tunearo distribution bridge (Tunearo Public API v1).
// The API key lives server-side only: TUNEARO_API_KEY secret, or saved by an admin in Studio (dist_settings).
// Big files never pass through here: we hand the admin's browser Tunearo's pre-signed upload URLs.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const API = "https://dashboard.tunearo.com/api/public/v1";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(SB_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const RANK: Record<string, number> = { owner: 4, admin: 3, moderator: 2, vip: 1, member: 0 };

class HttpError extends Error {
  constructor(public status: number, message: string, public detail?: unknown) {
    super(message);
  }
}

async function setting(key: string) {
  const { data } = await admin.from("dist_settings").select("value").eq("key", key).maybeSingle();
  return (data?.value as string | undefined) ?? null;
}
async function saveSetting(key: string, value: string) {
  await admin.from("dist_settings").upsert({ key, value, updated_at: new Date().toISOString() });
}
async function apiKey() {
  return Deno.env.get("TUNEARO_API_KEY") || (await setting("api_key"));
}

async function tn(path: string, init: { method?: string; body?: unknown } = {}, key?: string | null) {
  const k = key ?? (await apiKey());
  if (!k) throw new HttpError(503, "Tunearo isn't connected — an admin needs to add the API key in Studio → Distribution → Settings.");
  const res = await fetch(API + path, {
    method: init.method ?? "GET",
    headers: { Authorization: `Bearer ${k}`, "Content-Type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text.slice(0, 300) };
  }
  if (!res.ok) {
    const issues = Array.isArray(data?.issues) ? ` (${data.issues.map((i: any) => `${i.field}: ${i.message}`).join("; ")})` : "";
    throw new HttpError(res.status === 401 || res.status === 403 ? 502 : res.status, `Tunearo: ${data?.error ?? res.statusText}${issues}`, data);
  }
  return data;
}

const clean = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== ""));

function releaseBody(r: any, artistIds: string[]) {
  return clean({
    title: r.title,
    primary_artist_name: r.primary_artist_name,
    artist_ids: artistIds.length ? artistIds : undefined,
    release_type: r.release_type,
    primary_genre: r.primary_genre,
    secondary_genre: r.secondary_genre,
    release_date: r.release_date,
    label_name: r.label_name || "Self-released",
    language: r.language,
    explicit_content: !!r.explicit,
    copyright_year: r.copyright_year,
    copyright_holder: r.copyright_holder,
    licensed_territories_include: r.territories_include || "WORLD",
    licensed_territories_exclude: r.territories_exclude,
  });
}

function trackBody(t: any, r: any) {
  return clean({
    title: t.title,
    track_number: t.position,
    primary_artist_name: t.primary_artist_name || r.primary_artist_name,
    featured_artist_names: t.featured_artist_names,
    explicit_content: !!t.explicit,
    isrc: t.isrc,
    language: t.language || r.language,
    lyrics: t.lyrics,
    composer: t.composer,
    producer: t.producer,
    mixer: t.mixer,
    songwriter: t.songwriter,
    lyricist: t.lyricist,
    mastering_engineer: t.mastering_engineer,
    publisher: t.publisher,
    remixer: t.remixer,
  });
}

async function setRelease(id: string, patch: Record<string, unknown>) {
  await admin.from("dist_releases").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
}

async function loadRelease(id: string) {
  const { data: r } = await admin.from("dist_releases").select("*").eq("id", id).maybeSingle();
  if (!r) throw new HttpError(404, "Release not found");
  const { data: tracks } = await admin.from("dist_tracks").select("*").eq("release_id", id).order("position");
  return { r, tracks: tracks ?? [] };
}

const audioType = (path: string) => (path.toLowerCase().endsWith(".flac") ? { content_type: "audio/flac", extension: "flac" } : { content_type: "audio/wav", extension: "wav" });
const imageType = (path: string) => (/\.png$/i.test(path) ? "image/png" : "image/jpeg");

async function signed(path: string) {
  const { data, error } = await admin.storage.from("dist-files").createSignedUrl(path, 7200);
  if (error) throw new HttpError(500, `Couldn't read ${path}: ${error.message}`);
  return data.signedUrl;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: u } = await admin.auth.getUser(jwt);
    if (!u?.user) throw new HttpError(401, "Sign in first");
    const uid = u.user.id;
    const { data: prof } = await admin.from("profiles").select("site_role, banned_until").eq("id", uid).maybeSingle();
    const rank = RANK[prof?.site_role ?? "member"] ?? 0;
    const staff = rank >= 3;
    const needStaff = () => {
      if (!staff) throw new HttpError(403, "Admins only");
    };
    // reviewers = admins, moderators and members with the Moderator badge (they approve & send releases)
    let reviewer = rank >= 2;
    if (!reviewer) {
      const { data: mb } = await admin.from("user_badges").select("badge:badges!inner(key)").eq("user_id", uid).is("revoked_at", null).eq("badge.key", "moderator").limit(1);
      reviewer = !!mb?.length;
    }
    const needReviewer = () => {
      if (!reviewer) throw new HttpError(403, "Only admins and moderators can do that");
    };

    const b = await req.json().catch(() => ({}));
    const action = String(b.action ?? "");

    switch (action) {
      case "status": {
        const key = await apiKey();
        return json({ configured: !!key, webhook: !!(await setting("webhook_id")), staff });
      }

      case "set_key": {
        needStaff();
        const key = String(b.key ?? "").trim();
        if (!/^tn_live_[A-Za-z0-9_-]{8,}$/.test(key)) throw new HttpError(400, "That doesn't look like a Tunearo key (starts with tn_live_)");
        await tn("/artists", {}, key); // validates the key
        await saveSetting("api_key", key);
        return json({ ok: true });
      }

      case "register_webhook": {
        needStaff();
        const url = `${SB_URL}/functions/v1/tunearo-webhook`;
        const old = await setting("webhook_id");
        if (old) await tn(`/webhooks/${old}`, { method: "DELETE" }).catch(() => null);
        const r = await tn("/webhooks", {
          method: "POST",
          body: { url, events: ["release.submitted", "release.approved", "release.rejected", "release.live", "release.takedown_completed", "royalties.imported"] },
        });
        await saveSetting("webhook_id", r.webhook.id);
        await saveSetting("webhook_secret", r.webhook.secret);
        return json({ ok: true, url });
      }

      // 1) create/refresh artists, release and tracks on Tunearo; hand back pre-signed upload URLs
      case "prepare": {
        needReviewer();
        const { r, tracks } = await loadRelease(String(b.release_id));
        if (!["in_review", "error", "rejected", "sending"].includes(r.status)) throw new HttpError(409, `Release is ${r.status}`);
        if (!tracks.length) throw new HttpError(400, "No tracks");
        await setRelease(r.id, { status: "sending", last_error: null, reviewed_by: uid });
        try {
          // artists
          const artistIds: string[] = [];
          if (r.artist_ids?.length) {
            const { data: artists } = await admin.from("dist_artists").select("*").in("id", r.artist_ids);
            for (const id of r.artist_ids as string[]) {
              const a = (artists ?? []).find((x: any) => x.id === id);
              if (!a) continue;
              let tid = a.tunearo_id as string | null;
              if (!tid) {
                const res = await tn("/artists", { method: "POST", body: clean({ artist_name: a.name, biography: a.bio, spotify_id: a.spotify_id, apple_id: a.apple_id }) });
                tid = res.artist.id;
                await admin.from("dist_artists").update({ tunearo_id: tid }).eq("id", a.id);
              }
              artistIds.push(tid!);
            }
          }
          // release
          let rid = r.tunearo_id as string | null;
          if (!rid) {
            const res = await tn("/releases", { method: "POST", body: releaseBody(r, artistIds) });
            rid = res.release.id;
            await setRelease(r.id, { tunearo_id: rid });
          } else {
            await tn(`/releases/${rid}`, { method: "PATCH", body: releaseBody(r, artistIds) });
          }
          if (r.upc) await tn(`/releases/${rid}`, { method: "PATCH", body: { upc: r.upc } });

          // tracks: drop remote ones we no longer have, then create/update ours
          const remote = (await tn(`/releases/${rid}/tracks`)).tracks ?? [];
          const keep = new Set(tracks.map((t: any) => t.tunearo_track_id).filter(Boolean));
          for (const rt of remote) if (!keep.has(rt.id)) await tn(`/releases/${rid}/tracks/${rt.id}`, { method: "DELETE" });
          const uploads: { track_id: string; title: string; source: string; upload_url: string; content_type: string; path: string }[] = [];
          for (const t of tracks) {
            let tid = t.tunearo_track_id as string | null;
            if (tid && remote.some((x: any) => x.id === tid)) {
              await tn(`/releases/${rid}/tracks/${tid}`, { method: "PATCH", body: trackBody(t, r) });
            } else {
              const res = await tn(`/releases/${rid}/tracks`, { method: "POST", body: trackBody(t, r) });
              tid = res.track.id;
              await admin.from("dist_tracks").update({ tunearo_track_id: tid, audio_sent: false }).eq("id", t.id);
              t.audio_sent = false;
            }
            if (!t.audio_sent || b.resend_audio) {
              const ty = audioType(t.audio_path);
              const up = await tn(`/releases/${rid}/tracks/${tid}/audio-upload-url`, { method: "POST", body: ty });
              uploads.push({ track_id: t.id, title: t.title, source: await signed(t.audio_path), upload_url: up.upload_url, content_type: ty.content_type, path: up.path });
            }
          }
          const ct = imageType(r.artwork_path);
          const art = await tn(`/releases/${rid}/artwork-upload-url`, { method: "POST", body: { content_type: ct } });
          return json({
            tunearo_id: rid,
            artwork: { source: await signed(r.artwork_path), upload_url: art.upload_url, content_type: ct, path: art.path },
            uploads,
          });
        } catch (e) {
          await setRelease(r.id, { status: "error", last_error: (e as Error).message.slice(0, 500) });
          throw e;
        }
      }

      // 2) after the browser PUT the files: save artwork path, mark audio, submit for Tunearo review
      case "finalize": {
        needReviewer();
        const { r } = await loadRelease(String(b.release_id));
        if (!r.tunearo_id) throw new HttpError(409, "Run prepare first");
        try {
          if (b.artwork_path) await tn(`/releases/${r.tunearo_id}`, { method: "PATCH", body: { cover_artwork_url: String(b.artwork_path) } });
          const sent = (Array.isArray(b.sent_tracks) ? b.sent_tracks : []).map(String);
          if (sent.length) await admin.from("dist_tracks").update({ audio_sent: true }).in("id", sent).eq("release_id", r.id);
          const res = await tn(`/releases/${r.tunearo_id}/submit`, { method: "POST" });
          await setRelease(r.id, { status: res.release?.status ?? "pending", sent_at: new Date().toISOString(), rejection_reason: null, last_error: null });
          return json({ ok: true, status: res.release?.status ?? "pending" });
        } catch (e) {
          await setRelease(r.id, { status: "error", last_error: (e as Error).message.slice(0, 500) });
          throw e;
        }
      }

      case "fail": {
        needReviewer();
        await setRelease(String(b.release_id), { status: "error", last_error: String(b.message ?? "Upload failed").slice(0, 500) });
        return json({ ok: true });
      }

      case "sync": {
        const q = admin.from("dist_releases").select("id, owner_id, tunearo_id, status").not("tunearo_id", "is", null);
        const { data: rows } = b.release_id ? await q.eq("id", String(b.release_id)) : staff ? await q.in("status", ["pending", "approved", "live", "takedown_requested", "sending", "error"]) : await q.eq("owner_id", uid);
        const out: Record<string, string> = {};
        for (const row of rows ?? []) {
          if (row.owner_id !== uid && !reviewer) continue;
          if (row.status === "sending") continue;
          const s = await tn(`/releases/${row.tunearo_id}/status`).catch(() => null);
          if (!s) continue;
          await setRelease(row.id, clean({ status: s.status, rejection_reason: s.rejection_reason ?? null, upc: s.upc }));
          if (s.status === "rejected") await setRelease(row.id, { rejection_reason: s.rejection_reason ?? "Rejected by Tunearo" });
          out[row.id] = s.status;
        }
        return json({ synced: out });
      }

      case "royalties": {
        if (b.release_id) {
          const { r } = await loadRelease(String(b.release_id));
          if (r.owner_id !== uid && !staff) throw new HttpError(403, "Not your release");
          if (!r.tunearo_id) return json({ currency: "GBP", lifetime_earnings: 0, this_month_earnings: 0, by_source: [], by_territory: [], by_track: [] });
          return json(await tn(`/releases/${r.tunearo_id}/royalties`));
        }
        needStaff();
        const qs = new URLSearchParams(clean({ period: b.period, from: b.from, to: b.to }) as Record<string, string>);
        return json(await tn(`/royalties${qs.size ? `?${qs}` : ""}`));
      }

      case "takedown": {
        const { r } = await loadRelease(String(b.release_id));
        if (r.owner_id !== uid && !staff) throw new HttpError(403, "Not your release");
        if (r.status !== "live" || !r.tunearo_id) throw new HttpError(409, "Only live releases can be taken down");
        const reason = String(b.reason ?? "").trim();
        if (reason.length < 3) throw new HttpError(400, "Give a reason");
        await tn(`/releases/${r.tunearo_id}/takedown`, { method: "POST", body: { reason } });
        await setRelease(r.id, { status: "takedown_requested" });
        return json({ ok: true });
      }

      case "update_live": {
        // edits to a live release go back to Tunearo review
        needStaff();
        const { r } = await loadRelease(String(b.release_id));
        if (r.status !== "live" || !r.tunearo_id) throw new HttpError(409, "Release isn't live");
        const patch = clean(b.patch ?? {});
        await tn(`/releases/${r.tunearo_id}/metadata`, { method: "PATCH", body: patch });
        await setRelease(r.id, { status: "pending" });
        return json({ ok: true });
      }

      default:
        throw new HttpError(400, "Unknown action");
    }
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message, detail: e.detail ?? null }, e.status);
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
