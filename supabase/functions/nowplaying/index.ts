// Nexus — Spotify "Listening to" sync.
// The user's Spotify login (PKCE) is stored server-side in music_links, so their profile keeps
// updating even when Nexus is closed. pg_cron calls { action: "tick" } every minute (x-push-secret).
// Secrets used: SPOTIFY_CLIENT_ID (already set for the spotify function).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.119.0";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const CLIENT_ID = Deno.env.get("SPOTIFY_CLIENT_ID") ?? "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

type Link = {
  user_id: string;
  refresh_token: string;
  access_token: string | null;
  expires_at: string | null;
  share: boolean;
  fail_count: number;
};

const REDIRECT_OK = /^(https:\/\/([a-z0-9-]+\.)*(nexusproject\.cc|vercel\.app)|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)\/spotify-callback$/;

async function tokenCall(params: Record<string, string>) {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: CLIENT_ID, ...params }),
  });
  const j = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, j };
}

/** a valid access token for this link (refreshing + saving the rotated refresh token) */
async function access(l: Link): Promise<string | null> {
  if (l.access_token && l.expires_at && new Date(l.expires_at).getTime() > Date.now() + 60_000) return l.access_token;
  const r = await tokenCall({ grant_type: "refresh_token", refresh_token: l.refresh_token });
  if (!r.ok) {
    // invalid_grant = the user revoked access on Spotify → drop the link after a few tries
    const fails = l.fail_count + 1;
    if (r.j?.error === "invalid_grant" || fails >= 5) {
      await admin.from("music_links").delete().eq("user_id", l.user_id);
      await admin.from("profiles").update({ now_playing: null }).eq("id", l.user_id);
    } else await admin.from("music_links").update({ fail_count: fails }).eq("user_id", l.user_id);
    return null;
  }
  const exp = new Date(Date.now() + (r.j.expires_in ?? 3600) * 1000).toISOString();
  l.access_token = r.j.access_token;
  l.expires_at = exp;
  if (r.j.refresh_token) l.refresh_token = r.j.refresh_token;
  await admin
    .from("music_links")
    .update({ access_token: l.access_token, expires_at: exp, refresh_token: l.refresh_token, fail_count: 0 })
    .eq("user_id", l.user_id);
  return l.access_token;
}

const big = (imgs?: { url: string; width?: number }[]) => imgs?.slice().sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]?.url ?? null;

/** fetch what the user is playing and write it to their profile (only when it changed) */
async function poll(l: Link, force = false) {
  const tk = await access(l);
  if (!tk) return { linked: false, now: null };
  const res = await fetch("https://api.spotify.com/v1/me/player/currently-playing?additional_types=track,episode", { headers: { Authorization: `Bearer ${tk}` } });
  if (res.status === 429) return { linked: true, now: undefined };
  let now: Record<string, unknown> | null = null;
  if (res.status === 200) {
    const cur = await res.json().catch(() => null);
    const it = cur?.item;
    if (it && cur.is_playing) {
      const ep = it.type === "episode";
      now = {
        source: "spotify",
        id: it.id,
        title: it.name,
        artist: ep ? (it.show?.publisher ?? it.show?.name ?? "") : (it.artists ?? []).map((a: { name: string }) => a.name).join(", "),
        artists: ep ? [] : (it.artists ?? []).slice(0, 6).map((a: { name: string; external_urls?: { spotify?: string } }) => ({ name: a.name, url: a.external_urls?.spotify ?? null })),
        album: ep ? (it.show?.name ?? null) : (it.album?.name ?? null),
        album_url: ep ? (it.show?.external_urls?.spotify ?? null) : (it.album?.external_urls?.spotify ?? null),
        release: ep ? (it.release_date ?? null) : (it.album?.release_date ?? null),
        album_type: ep ? "podcast" : (it.album?.album_type ?? null),
        url: it.external_urls?.spotify ?? null,
        image: big(ep ? (it.images ?? it.show?.images) : it.album?.images),
        explicit: !!it.explicit,
        progress_ms: cur.progress_ms ?? 0,
        duration_ms: it.duration_ms ?? 0,
        at: new Date().toISOString(),
      };
    }
  } else if (res.status !== 204) {
    return { linked: true, now: undefined };
  }
  await admin.from("music_links").update({ last_poll: new Date().toISOString() }).eq("user_id", l.user_id);
  if (!l.share) return { linked: true, now };

  const { data: p } = await admin.from("profiles").select("now_playing").eq("id", l.user_id).maybeSingle();
  const old = p?.now_playing as Record<string, number | string> | null;
  let changed = force || !!old !== !!now;
  if (!changed && old && now) {
    if (old.id !== now.id) changed = true;
    else {
      // same track: only write when the user seeked/restarted (> 8 s off from where we'd expect)
      const expected = Number(old.progress_ms ?? 0) + (Date.now() - new Date(String(old.at)).getTime());
      if (Math.abs(expected - Number(now.progress_ms)) > 8000) changed = true;
    }
  }
  if (changed) await admin.from("profiles").update({ now_playing: now }).eq("id", l.user_id);
  return { linked: true, now };
}

async function getLink(userId: string) {
  const { data } = await admin.from("music_links").select("user_id,refresh_token,access_token,expires_at,share,fail_count").eq("user_id", userId).maybeSingle();
  return data as Link | null;
}

async function saveNewLink(userId: string, tok: { access_token: string; refresh_token?: string; expires_in?: number }, fallbackRefresh?: string) {
  const refresh = tok.refresh_token ?? fallbackRefresh;
  if (!refresh) throw new Error("Spotify didn't return a refresh token");
  const meRes = await fetch("https://api.spotify.com/v1/me", { headers: { Authorization: `Bearer ${tok.access_token}` } });
  const me = meRes.ok ? await meRes.json() : null;
  const row = {
    user_id: userId,
    provider: "spotify",
    refresh_token: refresh,
    access_token: tok.access_token,
    expires_at: new Date(Date.now() + (tok.expires_in ?? 3600) * 1000).toISOString(),
    account_name: me?.display_name ?? me?.id ?? null,
    account_avatar: big(me?.images) ?? null,
    product: me?.product ?? null,
    fail_count: 0,
    last_poll: null,
  };
  const { error } = await admin.from("music_links").upsert(row, { onConflict: "user_id" });
  if (error) throw new Error(error.message);
  const l = await getLink(userId);
  return l ? await poll(l, true) : { linked: false, now: null };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  let b: Record<string, unknown> = {};
  try {
    b = await req.json();
  } catch {
    /* empty body */
  }
  const action = String(b.action ?? "");

  // ── cron: refresh everyone who shares ──
  if (action === "tick") {
    const { data: cfg } = await admin.from("push_config").select("secret").eq("id", 1).maybeSingle();
    if (!cfg?.secret || req.headers.get("x-push-secret") !== cfg.secret) return new Response("forbidden", { status: 403 });
    if (!CLIENT_ID) return json({ skipped: "no client id" });
    const before = new Date(Date.now() - 45_000).toISOString();
    const { data } = await admin
      .from("music_links")
      .select("user_id,refresh_token,access_token,expires_at,share,fail_count")
      .eq("share", true)
      .or(`last_poll.is.null,last_poll.lt.${before}`)
      .order("last_poll", { ascending: true, nullsFirst: true })
      .limit(150);
    const links = (data ?? []) as Link[];
    let done = 0;
    for (let i = 0; i < links.length; i += 10) {
      await Promise.all(links.slice(i, i + 10).map((l) => poll(l).then(() => done++).catch(() => {})));
    }
    return json({ polled: done });
  }

  // ── user actions ──
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: u } = await admin.auth.getUser(jwt);
  const userId = u?.user?.id;
  if (!userId) return json({ error: "Sign in first" }, 401);
  if (!CLIENT_ID) return json({ error: "Spotify isn't set up on this server yet." }, 503);

  try {
    if (action === "link") {
      const code = String(b.code ?? "");
      const verifier = String(b.verifier ?? "");
      const redirect = String(b.redirect_uri ?? "");
      if (!code || !verifier || !REDIRECT_OK.test(redirect)) return json({ error: "Invalid Spotify login" }, 400);
      const r = await tokenCall({ grant_type: "authorization_code", code, redirect_uri: redirect, code_verifier: verifier });
      if (!r.ok) return json({ error: r.j?.error_description || r.j?.error || "Spotify login failed" }, 400);
      return json(await saveNewLink(userId, r.j));
    }
    if (action === "adopt") {
      // move an older browser-only login to the server
      const refresh = String(b.refresh_token ?? "");
      if (!refresh) return json({ error: "Missing token" }, 400);
      const r = await tokenCall({ grant_type: "refresh_token", refresh_token: refresh });
      if (!r.ok) return json({ error: "That Spotify login expired — connect again" }, 400);
      return json(await saveNewLink(userId, r.j, refresh));
    }
    const l = await getLink(userId);
    if (action === "now") {
      if (!l) return json({ linked: false, now: null });
      return json(await poll(l, b.force === true));
    }
    if (action === "token") {
      if (!l) return json({ linked: false });
      const tk = await access(l);
      return tk ? json({ linked: true, access_token: tk, expires_at: l.expires_at }) : json({ linked: false });
    }
    if (action === "unlink") {
      await admin.from("music_links").delete().eq("user_id", userId);
      await admin.from("profiles").update({ now_playing: null }).eq("id", userId);
      return json({ linked: false });
    }
    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
