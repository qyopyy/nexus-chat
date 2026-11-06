// Nexus Profile Defender — watches Spotify artist profiles for releases the artist didn't put out,
// plus name / photo changes, and alerts the owner through Nexus Bot.
//  signed in:  {action:"add", url} · {action:"scan", id}
//  pg_cron:    {action:"scan_all"} with x-push-secret
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.119.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-push-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const URL_ = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(URL_, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const NEXUS_BOT = "00000000-0000-4000-8000-00000000b001";
const CLIENT_ID = Deno.env.get("SPOTIFY_CLIENT_ID") ?? "";
const CLIENT_SECRET = Deno.env.get("SPOTIFY_CLIENT_SECRET") ?? "";

let token: { value: string; exp: number } | null = null;
async function appToken() {
  if (token && token.exp > Date.now() + 30_000) return token.value;
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { Authorization: "Basic " + btoa(`${CLIENT_ID}:${CLIENT_SECRET}`), "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`Spotify auth failed (${res.status})`);
  const j = await res.json();
  token = { value: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return token.value;
}
async function sp(path: string): Promise<any> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`https://api.spotify.com/v1${path}`, { headers: { Authorization: `Bearer ${await appToken()}` } });
    if (res.status === 404 || res.status === 400) return null;
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 1000 * Math.min(10, Number(res.headers.get("retry-after") ?? 2))));
      continue;
    }
    if (!res.ok) throw new Error(`Spotify ${res.status}`);
    return res.json();
  }
  throw new Error("Spotify is rate limiting — try again soon");
}

const img = (a: any) => a?.images?.[0]?.url ?? null;
const albumItem = (a: any) => ({
  id: a.id, name: a.name, image: img(a), url: a.external_urls?.spotify ?? `https://open.spotify.com/album/${a.id}`,
  release_date: a.release_date, type: a.album_group ?? a.album_type, artists: (a.artists ?? []).map((x: any) => x.name).join(", "),
});
function parseArtist(input: string) {
  const s = String(input ?? "").trim();
  const m = s.match(/artist[/:]([A-Za-z0-9]{10,40})/) ?? s.match(/^([A-Za-z0-9]{22})$/);
  return m?.[1] ?? null;
}

/** newest items from each release group (Spotify sorts newest first inside a group) */
async function catalog(id: string) {
  const groups: [string, number][] = [["single", 2], ["album", 1], ["appears_on", 1], ["compilation", 1]];
  const out: any[] = [];
  for (const [g, pages] of groups) {
    for (let p = 0; p < pages; p++) {
      const r = await sp(`/artists/${id}/albums?include_groups=${g}&limit=10&offset=${p * 10}`);
      const items = r?.items ?? [];
      out.push(...items.map((a: any) => ({ ...a, album_group: a.album_group ?? g })));
      if (items.length < 10) break;
    }
  }
  const seen = new Set<string>();
  return out.filter((a) => a?.id && !seen.has(a.id) && seen.add(a.id));
}

/** monthly listeners from the public profile page (not in the Web API any more) */
async function publicStats(id: string): Promise<{ listeners: number | null }> {
  try {
    const r = await fetch(`https://open.spotify.com/artist/${id}`, { headers: { "User-Agent": "facebookexternalhit/1.1", "Accept-Language": "en" } });
    const html = await r.text();
    const m = html.match(/og:description" content="[^"]*?([\d.,]+)\s*([KMB]?)\s+monthly listeners/i);
    if (!m) return { listeners: null };
    const n = parseFloat(m[1].replace(/,/g, ""));
    const mult = { K: 1e3, M: 1e6, B: 1e9 }[m[2].toUpperCase() as "K" | "M" | "B"] ?? 1;
    return { listeners: Math.round(n * mult) };
  } catch {
    return { listeners: null };
  }
}
async function deezerFans(name: string): Promise<number | null> {
  try {
    const r = await fetch(`https://api.deezer.com/search/artist?limit=10&q=${encodeURIComponent(name)}`);
    const j = await r.json();
    const same = (j?.data ?? []).filter((a: any) => String(a.name).toLowerCase() === name.toLowerCase());
    return Math.max(0, ...same.map((a: any) => Number(a.nb_fan) || 0)) || null;
  } catch {
    return null;
  }
}
const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "").replace(/0/g, "o").replace(/1/g, "l").replace(/3/g, "e").replace(/4/g, "a").replace(/5/g, "s").replace(/\$/g, "s");
function lev(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
/** other Spotify artists whose name looks like this one (possible impersonators / mis-deliveries) */
async function lookalikes(name: string, id: string) {
  const r = await sp(`/search?type=artist&limit=10&q=${encodeURIComponent(name)}`).catch(() => null);
  const me = norm(name);
  return ((r?.artists?.items ?? []) as any[])
    .filter((a) => a && a.id !== id)
    .filter((a) => {
      const o = norm(a.name);
      if (o === me || (me.length >= 4 && lev(o, me) <= (me.length >= 8 ? 2 : 1))) return true;
      // "Name Official", "NameMusic", "TheName", "Name2"… — the usual impersonator patterns
      const extra = o.includes(me) ? o.replace(me, "") : null;
      return extra !== null && /^(official|offical|oficial|officiel|music|musik|real|the|tv|ofc|x|hq|fanpage|fans?|vevo|topic|\d{1,4})+$/.test(extra);
    })
    .slice(0, 8)
    .map((a) => ({ id: a.id, name: a.name, image: img(a), url: a.external_urls?.spotify ?? `https://open.spotify.com/artist/${a.id}` }));
}

async function tell(user: string, text: string) {
  try {
    const { data: conv } = await admin.rpc("dm_between", { a: NEXUS_BOT, b: user });
    if (conv) await admin.rpc("bot_say", { p_bot: NEXUS_BOT, p_conv: conv, p_text: text });
  } catch {
    /* best effort */
  }
}

async function scan(w: any) {
  const a = await sp(`/artists/${w.spotify_id}`);
  const now = new Date().toISOString();
  const alerts: { kind: string; item: Record<string, unknown> }[] = [];
  if (!a) {
    if (!w.snapshot?.removed) alerts.push({ kind: "removed", item: { name: w.name } });
    await admin.from("defender_watch").update({ last_scan: now, snapshot: { ...w.snapshot, removed: true } }).eq("id", w.id);
  } else {
    const items = await catalog(w.spotify_id);
    const known = new Set<string>(w.known ?? []);
    const fresh = items.filter((x) => !known.has(x.id));
    for (const x of fresh.slice(0, 15)) alerts.push({ kind: "new_release", item: albumItem(x) });
    const snap = w.snapshot ?? {};
    if (snap.name && snap.name !== a.name) alerts.push({ kind: "name", item: { from: snap.name, to: a.name } });
    if (snap.image && img(a) && snap.image !== img(a)) alerts.push({ kind: "image", item: { from: snap.image, to: img(a) } });
    // monthly listeners: sudden spikes / drops can mean bot streams aimed at the artist
    const { listeners } = await publicStats(w.spotify_id);
    const hist: { t: string; n: number }[] = Array.isArray(snap.history) ? snap.history : [];
    const prev = hist[hist.length - 1]?.n ?? null;
    if (listeners != null && prev != null && prev >= 500) {
      const ratio = listeners / prev;
      if (ratio >= 1.6 || ratio <= 0.55) alerts.push({ kind: "listeners", item: { from: prev, to: listeners, change: Math.round((ratio - 1) * 100) } });
    }
    if (listeners != null) hist.push({ t: now, n: listeners });
    // lookalike profiles that weren't there last time
    const looks = await lookalikes(a.name, w.spotify_id);
    const seenLooks = new Set<string>(Array.isArray(snap.lookalikes) ? snap.lookalikes : []);
    for (const l of looks.filter((x) => !seenLooks.has(x.id))) alerts.push({ kind: "lookalike", item: l });
    await admin
      .from("defender_watch")
      .update({
        name: a.name, image: img(a), last_scan: now, known: [...new Set([...(w.known ?? []), ...items.map((x) => x.id)])].slice(-2000),
        snapshot: { name: a.name, image: img(a), genres: a.genres ?? [], history: hist.slice(-120), lookalikes: [...new Set([...seenLooks, ...looks.map((x) => x.id)])].slice(-200) },
      })
      .eq("id", w.id);
  }
  if (alerts.length) {
    await admin.from("defender_alerts").insert(alerts.map((x) => ({ watch_id: w.id, owner_id: w.owner_id, kind: x.kind, item: x.item })));
    if (w.alerts_on) {
      const lines = alerts.slice(0, 6).map((x) =>
        x.kind === "new_release"
          ? `• New ${x.item.type ?? "release"}: “${x.item.name}” (${x.item.release_date ?? "?"}) — ${x.item.url}`
          : x.kind === "name"
            ? `• Profile name changed: “${x.item.from}” → “${x.item.to}”`
            : x.kind === "image"
              ? "• Profile photo changed"
              : x.kind === "listeners"
                ? `• Monthly listeners jumped ${Number(x.item.change) > 0 ? "+" : ""}${x.item.change}% (${x.item.from} → ${x.item.to}) — check for fake streams`
                : x.kind === "lookalike"
                  ? `• Look-alike profile: “${x.item.name}” — ${x.item.url}`
                  : "• The profile is no longer available on Spotify",
      );
      await tell(w.owner_id, `🛡️ Profile Defender — ${w.name ?? "your artist"}:\n${lines.join("\n")}${alerts.length > 6 ? `\n…and ${alerts.length - 6} more` : ""}\nIs it yours? Open Studio → Profile Defender to confirm or send a takedown.`);
    }
  }
  return { alerts: alerts.length };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    if (!CLIENT_ID || !CLIENT_SECRET) return json({ error: "Spotify keys aren't set up on the server" }, 503);
    const b = await req.json().catch(() => ({}));

    if (b.action === "scan_all") {
      const { data: cfg } = await admin.from("push_config").select("secret").eq("id", 1).maybeSingle();
      if (!cfg?.secret || req.headers.get("x-push-secret") !== cfg.secret) return json({ error: "forbidden" }, 403);
      const { data: list } = await admin.from("defender_watch").select("*").order("last_scan", { ascending: true, nullsFirst: true }).limit(60);
      let alerts = 0;
      for (const w of list ?? []) {
        try {
          alerts += (await scan(w)).alerts;
        } catch {
          /* keep going */
        }
      }
      return json({ scanned: list?.length ?? 0, alerts });
    }

    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: u } = await admin.auth.getUser(jwt);
    if (!u?.user) return json({ error: "Sign in first" }, 401);
    const uid = u.user.id;
    const asUser = createClient(URL_, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false } });

    if (b.action === "add") {
      const id = parseArtist(b.url);
      if (!id) return json({ error: "Paste a Spotify artist link (open.spotify.com/artist/…)" }, 400);
      const { data: tier } = await asUser.rpc("my_tier");
      const { data: lim } = await asUser.rpc("defender_limit", { p_tier: Number(tier ?? 0) });
      const { count } = await admin.from("defender_watch").select("id", { count: "exact", head: true }).eq("owner_id", uid);
      if ((count ?? 0) >= Number(lim ?? 1)) return json({ error: `Your plan protects ${lim} profile${Number(lim) === 1 ? "" : "s"} — upgrade for more` }, 403);
      const a = await sp(`/artists/${id}`);
      if (!a) return json({ error: "Artist not found on Spotify" }, 404);
      const [items, stats, looks] = await Promise.all([catalog(id), publicStats(id), lookalikes(a.name, id)]);
      const now = new Date().toISOString();
      const { data: w, error } = await admin
        .from("defender_watch")
        .upsert({ owner_id: uid, spotify_id: id, name: a.name, image: img(a), known: items.map((x) => x.id), snapshot: { name: a.name, image: img(a), genres: a.genres ?? [], history: stats.listeners != null ? [{ t: now, n: stats.listeners }] : [], lookalikes: looks.map((x) => x.id) }, last_scan: now }, { onConflict: "owner_id,spotify_id" })
        .select()
        .single();
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true, watch: w, baseline: items.length, releases: items.slice(0, 30).map(albumItem), lookalikes: looks, listeners: stats.listeners });
    }

    if (b.action === "profile") {
      const id = parseArtist(b.url);
      if (!id) return json({ error: "Paste a Spotify artist link (open.spotify.com/artist/…)" }, 400);
      const a = await sp(`/artists/${id}`);
      if (!a) return json({ error: "Artist not found on Spotify" }, 404);
      const [items, stats, fans, looks] = await Promise.all([catalog(id), publicStats(id), deezerFans(a.name), lookalikes(a.name, id)]);
      const own = items.filter((x) => x.album_group === "album" || x.album_group === "single");
      const latest = [...own].sort((x, y) => String(y.release_date).localeCompare(String(x.release_date)))[0];
      return json({
        id, name: a.name, image: img(a), genres: a.genres ?? [], url: a.external_urls?.spotify ?? `https://open.spotify.com/artist/${id}`,
        listeners: stats.listeners, fans, releases: own.length, appears_on: items.filter((x) => x.album_group === "appears_on").length,
        latest: latest ? albumItem(latest) : null, lookalikes: looks,
      });
    }

    if (b.action === "scan") {
      const { data: w } = await admin.from("defender_watch").select("*").eq("id", String(b.id ?? "")).maybeSingle();
      if (!w || w.owner_id !== uid) return json({ error: "Not found" }, 404);
      return json({ ok: true, ...(await scan(w)) });
    }

    if (b.action === "catalog") {
      const { data: w } = await admin.from("defender_watch").select("spotify_id, owner_id").eq("id", String(b.id ?? "")).maybeSingle();
      if (!w || w.owner_id !== uid) return json({ error: "Not found" }, 404);
      return json({ releases: (await catalog(w.spotify_id)).map(albumItem) });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
