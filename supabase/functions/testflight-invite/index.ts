// TestFlight email invites.
//   POST { action: "signup", app, email, first_name, last_name }  (public, from nexusproject.cc/beta)
//   POST { action: "status" | "retry" }                             (site admins only)
// Adds the tester to the app's external TestFlight group through the App Store Connect API;
// Apple then emails them the invite. Needs Edge Function secrets ASC_ISSUER_ID, ASC_KEY_ID and
// ASC_PRIVATE_KEY (the .p8 contents, or its base64). Optional: ASC_GROUP_<APP> (beta group id).
// Without the secrets, signups are kept as "pending" and sent later with "retry".
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const LIMIT = 10_000;
const BUNDLES: Record<string, string> = {
  nexus: "hu.qyopy.nexus.B44X8B76QR",
  wump: "hu.qyopy.bump.B44X8B76QR",
  browser: "hu.qyopy.browser.B44X8B76QR",
  link: "hu.qyopy.link",
};
const ASC = "https://api.appstoreconnect.apple.com/v1";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });

// ───────────── App Store Connect auth (ES256 JWT, 20 min max) ─────────────
const b64url = (b: ArrayBuffer | Uint8Array | string) => {
  const bytes = typeof b === "string" ? new TextEncoder().encode(b) : b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = "";
  for (const x of bytes) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
let keyCache: CryptoKey | null = null;
let tokenCache: { t: string; exp: number } | null = null;

function ascConfigured() {
  return !!(Deno.env.get("ASC_ISSUER_ID") && Deno.env.get("ASC_KEY_ID") && Deno.env.get("ASC_PRIVATE_KEY"));
}
async function signingKey() {
  if (keyCache) return keyCache;
  let pem = (Deno.env.get("ASC_PRIVATE_KEY") ?? "").trim();
  if (!pem.includes("BEGIN")) pem = atob(pem.replace(/\s+/g, "")); // base64 of the .p8 file
  const body = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  keyCache = await crypto.subtle.importKey("pkcs8", der, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  return keyCache;
}
async function ascToken() {
  const now = Math.floor(Date.now() / 1000);
  if (tokenCache && tokenCache.exp - 60 > now) return tokenCache.t;
  const exp = now + 15 * 60;
  const head = b64url(JSON.stringify({ alg: "ES256", kid: Deno.env.get("ASC_KEY_ID"), typ: "JWT" }));
  const claims = b64url(JSON.stringify({ iss: Deno.env.get("ASC_ISSUER_ID"), iat: now, exp, aud: "appstoreconnect-v1" }));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, await signingKey(), new TextEncoder().encode(`${head}.${claims}`));
  tokenCache = { t: `${head}.${claims}.${b64url(sig)}`, exp };
  return tokenCache.t;
}
async function asc(path: string, init: RequestInit = {}) {
  const r = await fetch(path.startsWith("http") ? path : `${ASC}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${await ascToken()}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const text = await r.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: r.status, body };
}
const ascError = (b: any) => b?.errors?.[0]?.detail || b?.errors?.[0]?.title || "App Store Connect error";

const appIds = new Map<string, string>();
const groupIds = new Map<string, { id: string; name: string }>();
async function appId(app: string) {
  if (appIds.has(app)) return appIds.get(app)!;
  const r = await asc(`/apps?filter[bundleId]=${encodeURIComponent(BUNDLES[app])}&limit=1`);
  const id = r.body?.data?.[0]?.id;
  if (!id) throw new Error(r.status === 200 ? `App ${BUNDLES[app]} isn't in App Store Connect` : ascError(r.body));
  appIds.set(app, id);
  return id;
}
/** the external group with the public link (or ASC_GROUP_<APP>) */
async function group(app: string) {
  if (groupIds.has(app)) return groupIds.get(app)!;
  const fixed = Deno.env.get(`ASC_GROUP_${app.toUpperCase()}`);
  if (fixed) {
    const g = { id: fixed, name: "TestFlight group" };
    groupIds.set(app, g);
    return g;
  }
  const r = await asc(`/apps/${await appId(app)}/betaGroups?limit=50`);
  const groups = (r.body?.data ?? []) as { id: string; attributes: { name: string; isInternalGroup: boolean; publicLinkEnabled?: boolean } }[];
  const ext = groups.filter((g) => !g.attributes.isInternalGroup);
  const pick = ext.find((g) => g.attributes.publicLinkEnabled) ?? ext[0];
  if (!pick) throw new Error(r.status === 200 ? "No external TestFlight group yet — create one in App Store Connect" : ascError(r.body));
  const g = { id: pick.id, name: pick.attributes.name };
  groupIds.set(app, g);
  return g;
}

async function invite(app: string, email: string, first: string, last: string) {
  const g = await group(app);
  const create = await asc("/betaTesters", {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "betaTesters",
        attributes: { email, firstName: first, lastName: last },
        relationships: { betaGroups: { data: [{ type: "betaGroups", id: g.id }] } },
      },
    }),
  });
  if (create.status === 201) return;
  if (create.status !== 409) throw new Error(ascError(create.body));
  // already a tester somewhere: add them to this group and re-send the invite
  const found = await asc(`/betaTesters?filter[email]=${encodeURIComponent(email)}&limit=1`);
  const testerId = found.body?.data?.[0]?.id;
  if (!testerId) throw new Error(ascError(create.body));
  const add = await asc(`/betaGroups/${g.id}/relationships/betaTesters`, { method: "POST", body: JSON.stringify({ data: [{ type: "betaTesters", id: testerId }] }) });
  if (add.status >= 300 && add.status !== 409) throw new Error(ascError(add.body));
  await asc("/betaTesterInvitations", {
    method: "POST",
    body: JSON.stringify({
      data: { type: "betaTesterInvitations", relationships: { app: { data: { type: "apps", id: await appId(app) } }, betaTester: { data: { type: "betaTesters", id: testerId } } } },
    }),
  });
}

async function sendRow(row: { id: string; app: string; email: string; first_name: string; last_name: string }) {
  try {
    await invite(row.app, row.email, row.first_name, row.last_name);
    await db.from("testflight_signups").update({ status: "invited", error: null, invited_at: new Date().toISOString() }).eq("id", row.id);
    return { ok: true as const };
  } catch (e) {
    const msg = (e as Error).message.slice(0, 300);
    await db.from("testflight_signups").update({ status: "failed", error: msg }).eq("id", row.id);
    return { ok: false as const, error: msg };
  }
}

async function ipHash(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("cf-connecting-ip") || "unknown";
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`tf:${ip}:${Deno.env.get("SUPABASE_URL")}`));
  return b64url(d).slice(0, 24);
}

async function isAdmin(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return false;
  const userDb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data } = await userDb.rpc("my_rank");
  return Number(data) >= 3;
}

const clean = (s: unknown, max: number) =>
  String(s ?? "")
    .replace(/[\u0000-\u001f<>]/g, "")
    .trim()
    .slice(0, max);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request" }, 400);
  }
  const action = String(body.action ?? "signup");

  if (action === "status" || action === "retry") {
    if (!(await isAdmin(req))) return json({ error: "Admins only" }, 403);
    if (!ascConfigured()) return json({ configured: false, error: "Add ASC_ISSUER_ID, ASC_KEY_ID and ASC_PRIVATE_KEY in Supabase → Edge Functions → Secrets" });
    if (action === "status") {
      const out: Record<string, unknown> = {};
      for (const app of Object.keys(BUNDLES)) {
        try {
          out[app] = (await group(app)).name;
        } catch (e) {
          out[app] = { error: (e as Error).message };
        }
      }
      return json({ configured: true, groups: out });
    }
    const { data: rows } = await db.from("testflight_signups").select("id,app,email,first_name,last_name").in("status", ["pending", "failed"]).order("created_at").limit(40);
    let sent = 0;
    const errors: string[] = [];
    for (const r of rows ?? []) {
      const x = await sendRow(r);
      if (x.ok) sent++;
      else errors.push(`${r.email}: ${x.error}`);
    }
    return json({ configured: true, sent, failed: errors.length, errors: errors.slice(0, 5), more: (rows?.length ?? 0) === 40 });
  }

  // ── public signup ──
  if (String(body.website ?? "").trim()) return json({ ok: true, status: "pending" }); // honeypot
  const app = String(body.app ?? "nexus");
  if (!BUNDLES[app]) return json({ error: "Unknown app" }, 400);
  const email = clean(body.email, 254).toLowerCase();
  const first = clean(body.first_name, 60);
  const last = clean(body.last_name, 60);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json({ error: "Enter a valid email address." }, 400);
  if (!first || !last) return json({ error: "Enter your first and last name." }, 400);

  const { data: link } = await db.from("testflight_links").select("app").eq("app", app).maybeSingle();
  if (!link) return json({ error: "This beta isn't open right now." }, 400);

  const ip = await ipHash(req);
  const since = new Date(Date.now() - 60 * 60_000).toISOString();
  const { count: recent } = await db.from("testflight_signups").select("id", { count: "exact", head: true }).eq("ip_hash", ip).gte("created_at", since);
  if ((recent ?? 0) >= 5) return json({ error: "Too many signups from your network — try again in an hour." }, 429);

  const { data: existing } = await db.from("testflight_signups").select("id,app,email,first_name,last_name,status").eq("app", app).ilike("email", email.replace(/[\\%_]/g, "\\$&")).maybeSingle();
  if (existing?.status === "invited") return json({ ok: true, status: "invited", already: true });

  const { count: taken } = await db.from("testflight_signups").select("id", { count: "exact", head: true }).eq("app", app).eq("status", "invited");
  if ((taken ?? 0) >= LIMIT) return json({ error: "The beta is full (10,000 testers). Check back later!" }, 409);

  let row = existing;
  if (!row) {
    const ins = await db.from("testflight_signups").insert({ app, email, first_name: first, last_name: last, ip_hash: ip }).select("id,app,email,first_name,last_name,status").single();
    if (ins.error) return json({ error: "Couldn't save your signup — try again." }, 500);
    row = ins.data;
  } else {
    await db.from("testflight_signups").update({ first_name: first, last_name: last }).eq("id", row.id);
    row = { ...row, first_name: first, last_name: last };
  }

  if (!ascConfigured()) return json({ ok: true, status: "pending" });
  const r = await sendRow(row);
  // signup is saved either way; an admin can retry failures
  return json({ ok: true, status: r.ok ? "invited" : "pending" });
});
