// Nexus copyright audio check — audio fingerprint matching.
// Provider: ACRCloud "identify" (self-serve; music database of 100M+ tracks).
// Audible Magic needs an enterprise agreement and private API docs; once you have them it plugs in as another provider here.
// The browser sends a ~12 s, 8 kHz mono WAV clip (≈190 KB) — full files never pass through this function.
// Credentials live server-side only (dist_settings, service role), entered by an admin in Studio → Copyright check.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const RANK: Record<string, number> = { owner: 4, admin: 3, moderator: 2, vip: 1, member: 0 };
const DAILY_LIMIT = 150;

class HttpError extends Error {
  constructor(public status: number, message: string) {
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

type Acr = { host: string; key: string; secret: string };
async function acrConfig(): Promise<Acr | null> {
  const [host, key, secret] = await Promise.all([setting("acr_host"), setting("acr_key"), setting("acr_secret")]);
  return host && key && secret ? { host, key, secret } : null;
}

async function hmacSha1B64(secret: string, msg: string) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg)));
  let s = "";
  for (const b of sig) s += String.fromCharCode(b);
  return btoa(s);
}

/** ACRCloud identify (signature v1) */
async function acrIdentify(cfg: Acr, sample: Uint8Array) {
  const ts = Math.floor(Date.now() / 1000).toString();
  const toSign = ["POST", "/v1/identify", cfg.key, "audio", "1", ts].join("\n");
  const form = new FormData();
  form.append("sample", new Blob([sample], { type: "audio/wav" }), "sample.wav");
  form.append("sample_bytes", String(sample.length));
  form.append("access_key", cfg.key);
  form.append("data_type", "audio");
  form.append("signature_version", "1");
  form.append("signature", await hmacSha1B64(cfg.secret, toSign));
  form.append("timestamp", ts);
  const res = await fetch(`https://${cfg.host.replace(/^https?:\/\//, "").replace(/\/.*$/, "")}/v1/identify`, { method: "POST", body: form });
  const data = await res.json().catch(() => null);
  if (!data?.status) throw new HttpError(502, `ACRCloud: HTTP ${res.status}`);
  return data as {
    status: { code: number; msg: string };
    metadata?: { music?: any[] };
  };
}

// ---------------------------------------------------------------- ACRCloud custom bucket (Nexus Shield 360)
const CONSOLE = "https://api-v2.acrcloud.com/api";
async function bucketConfig() {
  const [token, bucket] = await Promise.all([setting("acr_token"), setting("acr_bucket")]);
  return token && bucket ? { token, bucket } : null;
}
async function acrConsole(path: string, token: string, init: RequestInit = {}) {
  const res = await fetch(CONSOLE + path, { ...init, headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...(init.headers ?? {}) } });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text.slice(0, 200) };
  }
  if (!res.ok) throw new HttpError(res.status === 401 || res.status === 403 ? 400 : 502, `ACRCloud: ${data?.message ?? data?.error ?? res.statusText}`);
  return data;
}

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, "");

function silenceWav(seconds = 3, rate = 8000) {
  const n = seconds * rate;
  const buf = new Uint8Array(44 + n * 2);
  const v = new DataView(buf.buffer);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF");
  v.setUint32(4, 36 + n * 2, true);
  w(8, "WAVE");
  w(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, "data");
  v.setUint32(40, n * 2, true);
  return buf;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: u } = await admin.auth.getUser(jwt);
    if (!u?.user) throw new HttpError(401, "Sign in first");
    const uid = u.user.id;
    const { data: prof } = await admin.from("profiles").select("site_role, display_name, username").eq("id", uid).maybeSingle();
    const rank = RANK[prof?.site_role ?? "member"] ?? 0;
    const staff = rank >= 3;
    const b = await req.json().catch(() => ({}));

    switch (String(b.action ?? "")) {
      case "status": {
        const cfg = await acrConfig();
        return json({ configured: !!cfg, provider: cfg ? "ACRCloud" : null, staff, shieldBucket: !!(await bucketConfig()) });
      }

      case "set_bucket": {
        if (!staff) throw new HttpError(403, "Admins only");
        const token = String(b.token ?? "").trim();
        const bucket = String(b.bucket ?? "").trim();
        if (token.length < 20 || !/^\d+$/.test(bucket)) throw new HttpError(400, "Paste the console access token and the numeric bucket ID");
        await acrConsole(`/buckets/${bucket}`, token); // validates both
        await Promise.all([saveSetting("acr_token", token), saveSetting("acr_bucket", bucket)]);
        return json({ ok: true });
      }

      case "shield_upload": {
        const cfgB = await bucketConfig();
        const { data: w } = await admin.from("shield_works").select("*").eq("id", String(b.work_id ?? "")).maybeSingle();
        if (!w || (w.owner_id !== uid && !staff)) throw new HttpError(403, "Not your song");
        const mark = (patch: Record<string, unknown>) => admin.from("shield_works").update(patch).eq("id", w.id);
        if (!cfgB) {
          await mark({ acr_status: "skipped", acr_error: "ACRCloud bucket not connected" });
          return json({ ok: false, skipped: true });
        }
        if (!w.file_path) {
          await mark({ acr_status: "skipped", acr_error: "No vault copy — re-protect with “keep the original” on" });
          return json({ ok: false, skipped: true });
        }
        if ((w.bytes ?? 0) > 60 * 1024 * 1024) {
          await mark({ acr_status: "error", acr_error: "File is over 60 MB — protect an MP3/FLAC version for ACRCloud" });
          throw new HttpError(400, "File is over 60 MB — protect an MP3 or FLAC version for ACRCloud");
        }
        await mark({ acr_status: "pending", acr_error: null });
        try {
          const { data: blob, error } = await admin.storage.from("shield-vault").download(w.file_path);
          if (error || !blob) throw new HttpError(500, "Couldn't read the vault copy");
          const form = new FormData();
          form.append("file", blob, w.file_name ?? "audio");
          form.append("title", `${w.title}${w.artist ? ` — ${w.artist}` : ""}`.slice(0, 200));
          form.append("data_type", "audio");
          form.append("audio_id", w.id);
          form.append("user_defined", JSON.stringify({ work_id: w.id, owner_id: w.owner_id, isrc: w.isrc, upc: w.upc, artist: w.artist }));
          if (w.acr_id) await acrConsole(`/buckets/${cfgB.bucket}/files/${w.acr_id}`, cfgB.token, { method: "DELETE" }).catch(() => null);
          const r = await acrConsole(`/buckets/${cfgB.bucket}/files`, cfgB.token, { method: "POST", body: form });
          const id = String(r?.data?.id ?? r?.data?.acr_id ?? r?.id ?? "");
          await mark({ acr_id: id || null, acr_status: "ready", acr_error: null });
          return json({ ok: true, acr_id: id });
        } catch (e) {
          await mark({ acr_status: "error", acr_error: String((e as Error).message).slice(0, 500) });
          throw e;
        }
      }

      case "shield_remove": {
        const cfgB = await bucketConfig();
        const { data: w } = await admin.from("shield_works").select("id, owner_id, acr_id").eq("id", String(b.work_id ?? "")).maybeSingle();
        if (!w || (w.owner_id !== uid && !staff)) throw new HttpError(403, "Not your song");
        if (cfgB && w.acr_id) await acrConsole(`/buckets/${cfgB.bucket}/files/${w.acr_id}`, cfgB.token, { method: "DELETE" }).catch(() => null);
        return json({ ok: true });
      }

      case "set_config": {
        if (!staff) throw new HttpError(403, "Admins only");
        const host = String(b.host ?? "").trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
        const key = String(b.key ?? "").trim();
        const secret = String(b.secret ?? "").trim();
        if (!/^[a-z0-9.-]+\.acrcloud\.com$/i.test(host)) throw new HttpError(400, "Host looks like identify-eu-west-1.acrcloud.com");
        if (key.length < 8 || secret.length < 8) throw new HttpError(400, "Paste the project's access key and access secret");
        // validate: silence gives "no result" (1001) with good credentials, 3001/3014 with bad ones
        const r = await acrIdentify({ host, key, secret }, silenceWav());
        if (![0, 1001, 2004].includes(r.status.code)) throw new HttpError(400, `ACRCloud rejected these credentials: ${r.status.msg} (${r.status.code})`);
        await Promise.all([saveSetting("acr_host", host), saveSetting("acr_key", key), saveSetting("acr_secret", secret)]);
        return json({ ok: true });
      }

      case "clear_config": {
        if (!staff) throw new HttpError(403, "Admins only");
        await admin.from("dist_settings").delete().in("key", ["acr_host", "acr_key", "acr_secret"]);
        return json({ ok: true });
      }

      case "check": {
        const kind = String(b.target_kind ?? "tool");
        if (!["track", "video", "tool"].includes(kind)) throw new HttpError(400, "Bad target");
        const targetId = kind === "tool" ? null : String(b.target_id ?? "");
        // permission: your own track/video, or staff. `subject` = whose upload this is (Shield exemptions)
        let subject = uid;
        if (kind === "track") {
          const { data: t } = await admin.from("dist_tracks").select("id, release:dist_releases(owner_id)").eq("id", targetId).maybeSingle();
          const owner = (t?.release as any)?.owner_id;
          if (!t || (owner !== uid && !staff)) throw new HttpError(403, "Not your track");
          subject = owner;
        } else if (kind === "video") {
          const { data: v } = await admin.from("videos").select("owner_id").eq("id", targetId).maybeSingle();
          if (!v || (v.owner_id !== uid && !staff)) throw new HttpError(403, "Not your video");
          subject = v.owner_id;
        }
        const since = new Date(Date.now() - 86400_000).toISOString();
        const { count } = await admin.from("audio_checks").select("id", { count: "exact", head: true }).eq("user_id", uid).gte("created_at", since);
        if ((count ?? 0) >= DAILY_LIMIT && !staff) throw new HttpError(429, "Daily check limit reached — try again tomorrow");

        const b64 = String(b.sample ?? "");
        if (!b64 || b64.length > 900_000) throw new HttpError(400, "Audio sample missing or too big");
        const sample = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        if (String.fromCharCode(...sample.slice(0, 4)) !== "RIFF") throw new HttpError(400, "Sample must be WAV");

        const cfg = await acrConfig();
        if (!cfg) throw new HttpError(503, "Copyright check isn't connected yet — an admin adds the ACRCloud keys in Studio → Copyright check.");

        const r = await acrIdentify(cfg, sample);
        let status: "clean" | "match" | "own" | "error" = "clean";
        let note: string | null = null;
        let matches: any[] = [];
        // songs protected with Nexus Shield (ACRCloud custom bucket attached to this project)
        const custom = (r.metadata as any)?.custom_files ?? [];
        const shieldHits: any[] = [];
        for (const c of custom) {
          let ud: any = c.user_defined ?? {};
          if (typeof ud === "string") {
            try {
              ud = JSON.parse(ud);
            } catch {
              ud = {};
            }
          }
          const wid = ud.work_id ?? c.audio_id ?? null;
          if (!wid) continue;
          const { data: w } = await admin.from("shield_works").select("id, title, artist, owner_id, status, unlock_at, allow_users, isrc, upc").eq("id", wid).maybeSingle();
          if (!w) continue;
          const live = w.status === "locked" && (!w.unlock_at || new Date(w.unlock_at) > new Date());
          const exempt = w.owner_id === subject || (w.allow_users ?? []).includes(subject);
          if (!live || (exempt && kind !== "tool")) continue;
          shieldHits.push({ title: w.title, artists: [w.artist ?? "Protected"], album: null, label: "Nexus Shield 360", release_date: null, isrc: w.isrc, upc: w.upc, score: c.score ?? null, offset_s: c.play_offset_ms != null ? Math.round(c.play_offset_ms / 1000) : null, spotify_id: null, youtube_id: null, shield: true, work_id: w.id });
          if (kind !== "tool") await admin.from("shield_events").insert({ work_id: w.id, user_id: subject, context: kind === "track" ? "release" : kind === "video" ? "video" : "tool", score: Math.round(c.score ?? 100) });
        }
        if (r.status.code === 0) {
          matches = (r.metadata?.music ?? []).slice(0, 5).map((m) => ({
            title: m.title ?? "",
            artists: (m.artists ?? []).map((a: any) => a.name).filter(Boolean),
            album: m.album?.name ?? null,
            label: m.label ?? null,
            release_date: m.release_date ?? null,
            isrc: m.external_ids?.isrc ?? null,
            upc: m.external_ids?.upc ?? null,
            score: m.score ?? null,
            offset_s: m.play_offset_ms != null ? Math.round(m.play_offset_ms / 1000) : null,
            spotify_id: m.external_metadata?.spotify?.track?.id ?? null,
            youtube_id: m.external_metadata?.youtube?.vid ?? null,
          }));
          // matches on your own artist names (or your own ISRCs) are your own music, not a claim
          const { data: arts } = await admin.from("dist_artists").select("name").eq("owner_id", uid);
          const own = new Set([...(arts ?? []).map((a) => norm(a.name)), norm(prof?.display_name ?? ""), norm(prof?.username ?? "")].filter((x) => x.length >= 2));
          const { data: myTracks } = await admin.from("dist_tracks").select("isrc, release:dist_releases!inner(owner_id)").eq("release.owner_id", uid).not("isrc", "is", null);
          const ownIsrc = new Set((myTracks ?? []).map((t) => t.isrc));
          const isOwn = (m: any) => (m.isrc && ownIsrc.has(m.isrc)) || m.artists.some((a: string) => own.has(norm(a)));
          status = matches.length && matches.every(isOwn) ? "own" : matches.length ? "match" : "clean";
          if (shieldHits.length) {
            matches = [...shieldHits, ...matches].slice(0, 6);
            status = "match";
          }
        } else if (r.status.code === 1001) {
          status = "clean";
        } else {
          status = "error";
          note = `${r.status.msg} (${r.status.code})`.slice(0, 500);
        }
        const { data: row, error } = await admin
          .from("audio_checks")
          .insert({ user_id: uid, target_kind: kind, target_id: targetId, provider: "acrcloud", status, matches, note })
          .select()
          .single();
        if (error) throw new HttpError(500, error.message);
        return json(row);
      }

      default:
        throw new HttpError(400, "Unknown action");
    }
  } catch (e) {
    const err = e as HttpError;
    return json({ error: err.message ?? String(e) }, err.status ?? 500);
  }
});
