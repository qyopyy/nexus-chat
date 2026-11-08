// Nexus ↔ Too Lost bridge (Too Lost External API v1, OAuth 2.0 Authorization Code + PKCE).
// Docs: https://developer.toolost.com/docs  ·  Reference: https://developer.toolost.com/docs/api
//
// Admins save the app's Client ID / Secret in Distro → Settings → Too Lost (RPC admin_set_toolost_client),
// then "Connect" runs the OAuth flow; tokens live in dist_settings (service role only) and refresh automatically.
// Delivery: create draft → artwork + audio (pre-signed S3 PUTs, done here) → tracklist → submit → sync status/UPC/ISRCs.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.119.0";

type Env = "sandbox" | "production";
const HOSTS: Record<Env, { api: string; auth: string }> = {
  production: { api: "https://api.toolost.com/v1", auth: "https://toolost.com" },
  sandbox: { api: "https://api-sandbox.toolost.com/v1", auth: "https://sandbox.toolost.com" },
};
const SCOPES = "read:profile read:catalog read:releases write:releases";
const SITE = (Deno.env.get("SITE_URL") || "https://nexusproject.cc").replace(/\/+$/, "");
const REDIRECT = `${SITE}/distro/toolost-callback`;
const MAX_TRANSFER = 140 * 1024 * 1024; // edge memory headroom

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

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
  const { error } = await admin.from("dist_settings").upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) throw new HttpError(500, error.message);
}
async function dropSetting(...keys: string[]) {
  await admin.from("dist_settings").delete().in("key", keys);
}
async function activeEnv(): Promise<Env> {
  return ((await setting("toolost_env")) as Env) || "sandbox";
}

// ── PKCE helpers ──
const b64url = (buf: Uint8Array) => btoa(String.fromCharCode(...buf)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const randomString = (n = 32) => b64url(crypto.getRandomValues(new Uint8Array(n)));
const challengeOf = async (v: string) => b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v))));

type Tokens = { access_token: string; refresh_token: string; expires_at: string; refresh_expires_at: string };

async function client(env: Env) {
  const id = await setting(`toolost_client_id_${env}`);
  const secret = await setting(`toolost_client_secret_${env}`);
  if (!id) throw new HttpError(400, `Add your Too Lost ${env} Client ID first (Distro → Settings → Too Lost).`);
  return { id, secret };
}

async function tokenRequest(env: Env, form: Record<string, string>) {
  const res = await fetch(`${HOSTS[env].auth}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(form).toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new HttpError(502, `Too Lost sign-in failed: ${data.error_description || data.message || data.error || res.statusText}`);
  const now = Date.now();
  const t: Tokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: new Date(now + (Number(data.expires_in) || 1_296_000) * 1000).toISOString(),
    refresh_expires_at: new Date(now + 30 * 86_400_000).toISOString(),
  };
  await saveSetting(`toolost_token_${env}`, JSON.stringify(t));
  return t;
}

async function accessToken(env: Env) {
  const raw = await setting(`toolost_token_${env}`);
  if (!raw) throw new HttpError(400, `Too Lost (${env}) isn't connected — open Distro → Settings → Too Lost and press Connect.`);
  const t = JSON.parse(raw) as Tokens;
  if (Date.parse(t.expires_at) - Date.now() > 3_600_000) return t.access_token;
  if (!t.refresh_token || Date.parse(t.refresh_expires_at) < Date.now()) throw new HttpError(401, "Too Lost connection expired — press Connect again in Settings.");
  const c = await client(env);
  const form: Record<string, string> = { grant_type: "refresh_token", client_id: c.id, refresh_token: t.refresh_token };
  if (c.secret) form.client_secret = c.secret;
  return (await tokenRequest(env, form)).access_token;
}

async function tl(env: Env, path: string, init: { method?: string; body?: unknown } = {}) {
  const res = await fetch(HOSTS[env].api + path, {
    method: init.method ?? "GET",
    headers: { Authorization: `Bearer ${await accessToken(env)}`, Accept: "application/json", ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}) },
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
    const errs = data?.errors && typeof data.errors === "object" ? " — " + Object.entries(data.errors).map(([k, v]) => `${k}: ${(Array.isArray(v) ? v : [v]).join(", ")}`).join("; ") : "";
    const msg = res.status === 429 ? "Too Lost rate limit / quota reached — try again shortly" : `Too Lost: ${data?.message ?? data?.error ?? res.statusText}${errs}`;
    throw new HttpError(res.status === 401 ? 401 : res.status === 422 ? 422 : 502, msg.slice(0, 1500), data);
  }
  return data;
}

// ── data mapping ──
const LANG: Record<string, string> = {
  english: "en", hungarian: "hu", magyar: "hu", spanish: "es", french: "fr", german: "de", italian: "it", portuguese: "pt", russian: "ru", polish: "pl",
  dutch: "nl", swedish: "sv", norwegian: "no", danish: "da", finnish: "fi", turkish: "tr", arabic: "ar", japanese: "ja", korean: "ko", chinese: "zh",
  romanian: "ro", czech: "cs", slovak: "sk", greek: "el", ukrainian: "uk", hindi: "hi", instrumental: "zxx", "no linguistic content": "zxx",
};
const langCode = (l?: string | null) => {
  const v = (l || "English").trim().toLowerCase();
  return LANG[v] ?? (/^[a-z]{2,3}$/.test(v) ? v : "en");
};
const splitNames = (s?: string | null) => (s || "").split(/\s*(?:,|&|;|\bfeat\.?|\bft\.?|\bx\b)\s*/i).map((x) => x.trim()).filter(Boolean);
const releaseType = (t: string) => (["Single", "EP", "Album", "Compilation"].includes(t) ? t : "Single");

async function genreList(env: Env): Promise<string[]> {
  const d = await tl(env, "/lookup/genres");
  const arr = Array.isArray(d?.data) ? d.data : Array.isArray(d) ? d : [];
  return arr.map((g: any) => (typeof g === "string" ? g : g?.name ?? g?.title ?? g?.label)).filter(Boolean);
}
function bestGenre(ours: string | null | undefined, list: string[]) {
  if (!ours || !list.length) return null;
  const o = ours.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const norm = (g: string) => g.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const ALIAS: Record<string, string> = { phonk: "Hip-Hop/Rap", "hip hop": "Hip-Hop/Rap", rap: "Hip-Hop/Rap", trap: "Hip-Hop/Rap", drill: "Hip-Hop/Rap", "lo fi": "Downtempo", lofi: "Downtempo", edm: "Dance", rnb: "R&B", "r b": "R&B" };
  if (ALIAS[o] && list.includes(ALIAS[o])) return ALIAS[o];
  return list.find((g) => norm(g) === o) ?? list.find((g) => norm(g).startsWith(o)) ?? list.find((g) => norm(g).includes(o)) ?? null;
}

async function loadRelease(id: string) {
  const { data: r } = await admin.from("dist_releases").select("*").eq("id", id).maybeSingle();
  if (!r) throw new HttpError(404, "Release not found");
  const { data: tracks } = await admin.from("dist_tracks").select("*").eq("release_id", id).order("position");
  let artists: any[] = [];
  if (r.artist_ids?.length) artists = (await admin.from("dist_artists").select("*").in("id", r.artist_ids)).data ?? [];
  return { r, tracks: tracks ?? [], artists };
}
async function setRelease(id: string, patch: Record<string, unknown>) {
  await admin.from("dist_releases").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
}
const tlId = (r: any) => {
  if (r.distributor !== "Too Lost" || !r.distributor_ref) throw new HttpError(409, "Create the Too Lost draft first");
  return Number(r.distributor_ref);
};

function participants(r: any, artists: any[]) {
  const names = splitNames(r.primary_artist_name);
  const list = (names.length ? names : [r.primary_artist_name]).map((name: string) => {
    const a = artists.find((x) => x.name?.toLowerCase() === name.toLowerCase());
    const connect: Record<string, { url: string }> = {};
    if (a?.spotify_id) connect.spotify = { url: `https://open.spotify.com/artist/${a.spotify_id}` };
    if (a?.apple_id) connect.apple = { url: `https://music.apple.com/artist/${a.apple_id}` };
    return { name: name.slice(0, 120), role: ["primary"], ...(Object.keys(connect).length ? { connect } : {}) };
  });
  return list;
}

function trackPayload(t: any, r: any, fileKey: string) {
  const primary = splitNames(t.primary_artist_name || r.primary_artist_name);
  const feats = splitNames(t.featured_artist_names);
  const artists = [
    ...(primary.length ? primary : [r.primary_artist_name]).map((name: string, i: number) => ({ name, role: ["primary"], default: i === 0 })),
    ...feats.map((name) => ({ name, role: ["featuring"] })),
    ...splitNames(t.remixer).map((name) => ({ name, role: ["remixer"] })),
  ];
  const writers = new Map<string, Set<string>>();
  const add = (names: string | null | undefined, role: string) => splitNames(names).forEach((n) => writers.set(n, (writers.get(n) ?? new Set()).add(role)));
  add(t.composer, "instrumentalist"); // Too Lost: "instrumentalist" = Composer (music) for DSP delivery
  add(t.songwriter, "instrumentalist");
  add(t.songwriter, "lyricist");
  add(t.lyricist, "lyricist");
  if (![...writers.values()].some((s) => s.has("instrumentalist"))) add(primary[0] || r.primary_artist_name, "instrumentalist");
  const credits = splitNames(t.producer).map((name) => ({ name, role: ["producer"] }));
  return {
    title: t.title,
    language: langCode(t.language || r.language),
    audioFileKey: fileKey,
    ...(t.isrc ? { isrc: String(t.isrc).replace(/[^A-Z0-9]/gi, "").toUpperCase() } : {}),
    lyrics: { content: t.lyrics ? String(t.lyrics).slice(0, 6499) : null, explicit: !!t.explicit, cleanVersion: false },
    artists,
    writers: [...writers.entries()].map(([name, roles]) => ({ name: name.slice(0, 120), role: [...roles] })),
    ...(credits.length ? { credits } : {}),
  };
}

/** download from our storage and PUT to Too Lost's pre-signed S3 URL */
async function transfer(path: string, up: { uploadUrl: string; method?: string; headers?: Record<string, string> }) {
  const { data: blob, error } = await admin.storage.from("dist-files").download(path);
  if (error || !blob) throw new HttpError(500, `Couldn't read ${path}`);
  if (blob.size > MAX_TRANSFER) throw new HttpError(413, `${path.split("/").pop()} is ${(blob.size / 1048576).toFixed(0)} MB — too big to relay; upload it in the Too Lost portal`);
  const res = await fetch(up.uploadUrl, { method: up.method || "PUT", headers: { ...(up.headers ?? {}), "Content-Length": String(blob.size) }, body: blob });
  if (!res.ok) throw new HttpError(502, `Upload to Too Lost storage failed (${res.status}) ${(await res.text()).slice(0, 200)}`);
}
const audioCT = (p: string) => (/\.flac$/i.test(p) ? "audio/flac" : /\.mp3$/i.test(p) ? "audio/mpeg" : "audio/wav");
const imageCT = (p: string) => (/\.png$/i.test(p) ? "image/png" : "image/jpeg");
const fileName = (p: string, fallback: string) => (p.split("/").pop() || fallback).replace(/[^\w.\-]+/g, "_").slice(-120);

function mapStatus(s: string): { status: string; last_error?: string | null } {
  switch (s) {
    case "live":
      return { status: "live", last_error: null };
    case "rejected":
      return { status: "error", last_error: "Too Lost rejected this release — check the Too Lost portal for the reason" };
    case "needs_documentation":
      return { status: "error", last_error: "Too Lost needs documentation for this release (rights / samples) — answer in the Too Lost portal" };
    case "takedown_pending":
      return { status: "takedown_requested" };
    case "takedown_complete":
      return { status: "taken_down" };
    case "draft":
      return { status: "sending" };
    default:
      return { status: "pending", last_error: null }; // in_review, review_accepted, exported, edited, wl_*
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: u } = await admin.auth.getUser(jwt);
    if (!u?.user) throw new HttpError(401, "Sign in first");
    const uid = u.user.id;
    const { data: prof } = await admin.from("profiles").select("site_role").eq("id", uid).maybeSingle();
    if ((RANK[prof?.site_role ?? "member"] ?? 0) < 3) throw new HttpError(403, "Admins only");

    const b = await req.json().catch(() => ({}));
    const action = String(b.action ?? "");
    const env: Env = b.env === "production" || b.env === "sandbox" ? b.env : await activeEnv();

    switch (action) {
      // ── connection ──
      case "redirect_uri":
        return json({ redirect_uri: REDIRECT });

      case "auth_url": {
        const c = await client(env);
        const state = randomString(24);
        const verifier = randomString(48);
        await saveSetting("toolost_oauth_pending", JSON.stringify({ state, verifier, env, uid, at: Date.now() }));
        const q = new URLSearchParams({ client_id: c.id, redirect_uri: REDIRECT, response_type: "code", scope: SCOPES, state, code_challenge: await challengeOf(verifier), code_challenge_method: "S256" });
        return json({ url: `${HOSTS[env].auth}/oauth/authorize?${q}`, redirect_uri: REDIRECT });
      }

      case "exchange": {
        const pending = JSON.parse((await setting("toolost_oauth_pending")) || "null");
        if (!pending || pending.state !== String(b.state ?? "")) throw new HttpError(400, "This sign-in link is stale — press Connect again");
        if (Date.now() - pending.at > 15 * 60_000) throw new HttpError(400, "Sign-in took too long — press Connect again");
        await dropSetting("toolost_oauth_pending");
        const e = pending.env as Env;
        const c = await client(e);
        const form: Record<string, string> = { grant_type: "authorization_code", client_id: c.id, redirect_uri: REDIRECT, code: String(b.code ?? ""), code_verifier: pending.verifier };
        if (c.secret) form.client_secret = c.secret;
        await tokenRequest(e, form);
        await saveSetting("toolost_env", e);
        let account = "Connected";
        try {
          const me = (await tl(e, "/me"))?.data ?? {};
          account = [me.first_name, me.last_name].filter(Boolean).join(" ") || me.username || me.email || account;
          if (me.email && account !== me.email) account += ` · ${me.email}`;
        } catch {
          /* profile scope missing — still connected */
        }
        await saveSetting(`toolost_account_${e}`, account.slice(0, 200));
        return json({ ok: true, env: e, account });
      }

      case "disconnect":
        await dropSetting(`toolost_token_${env}`, `toolost_account_${env}`);
        return json({ ok: true });

      case "test": {
        const me = (await tl(env, "/me"))?.data ?? {};
        const rel = await tl(env, "/releases?perPage=1").catch(() => null);
        return json({ ok: true, account: me.email || me.username || null, releases: rel?.meta?.total ?? null });
      }

      case "genres":
        return json({ genres: await genreList(env) });

      // ── delivery ──
      case "create": {
        const { r, artists } = await loadRelease(String(b.release_id));
        const genres = await genreList(env).catch(() => [] as string[]);
        const genre = (b.genre && genres.includes(b.genre) ? b.genre : null) ?? bestGenre(r.primary_genre, genres);
        if (!genre) throw new HttpError(422, `Pick a Too Lost genre for “${r.primary_genre}”`, { genres });
        let id = r.distributor === "Too Lost" && /^\d+$/.test(r.distributor_ref ?? "") ? Number(r.distributor_ref) : null;
        if (id) {
          const cur = await tl(env, `/releases/${id}`).catch(() => null);
          if (!cur?.data || cur.data.status !== "draft") id = null; // gone or already submitted → start a fresh draft
        }
        if (!id) {
          const created = await tl(env, "/releases", { method: "POST", body: { type: releaseType(r.release_type), title: r.title.slice(0, 120), label: (r.label_name || "Self-released").slice(0, 120), participants: participants(r, artists) } });
          id = created.data.id as number;
          await setRelease(r.id, { distributor: "Too Lost", distributor_ref: String(id), status: "sending", last_error: null, reviewed_by: uid });
        }
        const year = r.copyright_year || new Date(r.release_date).getFullYear();
        const holder = (r.copyright_holder || r.label_name || r.primary_artist_name).slice(0, 120);
        await tl(env, `/releases/${id}/metadata`, {
          method: "PATCH",
          body: {
            title: r.title.slice(0, 120),
            label: (r.label_name || "Self-released").slice(0, 120),
            primaryGenre: genre,
            ...(r.secondary_genre && genres.includes(r.secondary_genre) ? { secondaryGenre: r.secondary_genre } : {}),
            language: langCode(r.language),
            releaseDate: r.release_date,
            licenseType: "Copyright",
            cYear: year,
            cLine: holder,
            pYear: year,
            pLine: holder,
            ...(r.upc ? { upc: String(r.upc).replace(/\D/g, "") } : {}),
          },
        });
        return json({ ok: true, toolost_id: id, genre, env });
      }

      case "upload_artwork": {
        const { r } = await loadRelease(String(b.release_id));
        const id = tlId(r);
        if (!r.artwork_path) throw new HttpError(400, "This release has no artwork");
        const up = (await tl(env, `/releases/${id}/artwork/upload-url`, { method: "POST", body: { fileName: fileName(r.artwork_path, "cover.jpg"), contentType: imageCT(r.artwork_path) } })).data;
        await transfer(r.artwork_path, up);
        await tl(env, `/releases/${id}/metadata`, { method: "PATCH", body: { coverFileKey: up.fileKey } });
        return json({ ok: true });
      }

      case "upload_track": {
        const { r, tracks } = await loadRelease(String(b.release_id));
        const id = tlId(r);
        const t = tracks.find((x: any) => x.id === b.track_id);
        if (!t?.audio_path) throw new HttpError(400, "Track has no audio");
        const up = (await tl(env, `/releases/${id}/tracks/upload-url`, { method: "POST", body: { kind: "audio", fileName: fileName(t.audio_path, `track-${t.position}.wav`), contentType: audioCT(t.audio_path) } })).data;
        await transfer(t.audio_path, up);
        return json({ ok: true, fileKey: up.fileKey });
      }

      case "tracks": {
        const { r, tracks } = await loadRelease(String(b.release_id));
        const id = tlId(r);
        const keys = (b.file_keys ?? {}) as Record<string, string>;
        const missing = tracks.filter((t: any) => !keys[t.id]);
        if (missing.length) throw new HttpError(400, `Audio not uploaded for: ${missing.map((t: any) => t.title).join(", ")}`);
        await tl(env, `/releases/${id}/tracks`, { method: "PUT", body: { tracks: tracks.map((t: any) => trackPayload(t, r, keys[t.id])) } });
        return json({ ok: true });
      }

      case "submit": {
        const { r } = await loadRelease(String(b.release_id));
        const id = tlId(r);
        const res = await tl(env, `/releases/${id}/submit`, { method: "POST", body: { acceptTerms: true, confirmRights: true, confirmYoutubeRights: true, idempotencyKey: `nexus-${r.id}`.slice(0, 128) } });
        const m = mapStatus(res?.data?.status ?? "in_review");
        await setRelease(r.id, { ...m, sent_at: new Date().toISOString() });
        await admin.rpc("dist_notify_owner", { p_owner: r.owner_id, p_text: `✅ “${r.title}” was approved and sent to the stores. You'll get your UPC, ISRCs and links here once it's live.` });
        return json({ ok: true, status: res?.data?.status ?? null });
      }

      case "sync": {
        const { r, tracks } = await loadRelease(String(b.release_id));
        const id = tlId(r);
        const d = (await tl(env, `/releases/${id}`)).data;
        const m = mapStatus(d.status);
        const patch: Record<string, unknown> = { ...m };
        if (d.upc) patch.upc = String(d.upc);
        const remote = Array.isArray(d.tracks) && d.tracks.length ? d.tracks : ((await tl(env, `/releases/${id}/tracks`).catch(() => null))?.data ?? []);
        let isrcs = 0;
        for (const [i, t] of tracks.entries()) {
          const rt = remote.find((x: any) => x?.title?.toLowerCase() === t.title.toLowerCase()) ?? remote[i];
          if (rt?.isrc && rt.isrc !== t.isrc) {
            await admin.from("dist_tracks").update({ isrc: rt.isrc }).eq("id", t.id);
            isrcs++;
          }
        }
        const wasLive = r.status === "live";
        await setRelease(r.id, patch);
        if (m.status === "live" && !wasLive) {
          await admin.rpc("dist_notify_owner", { p_owner: r.owner_id, p_text: `🎉 “${r.title}” is live!${d.upc ? `\nUPC: ${d.upc}` : ""}\nOpen Distro → Releases to see your codes and links.` });
        }
        return json({ ok: true, toolost_status: d.status, status: m.status, upc: d.upc ?? null, isrcs_updated: isrcs });
      }

      default:
        throw new HttpError(400, "Unknown action");
    }
  } catch (e) {
    const err = e as HttpError;
    const status = err.status ?? 500;
    if (status >= 500) console.error("toolost", err.message, err.detail ?? "");
    return json({ error: err.message ?? "Something went wrong", detail: status === 422 ? err.detail : undefined }, status);
  }
});
