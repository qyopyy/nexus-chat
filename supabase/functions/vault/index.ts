// Nexus file vault — admins browse/open any uploaded file after entering the vault password.
// Only a salted PBKDF2 hash of the password is stored (public.vault_config, service-role only).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });
const BUCKETS = ["attachments", "space-music", "artist-media", "avatars"];
const enc = new TextEncoder();
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function hmac(data: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode("nexus-vault:" + SERVICE), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data)))).replace(/[+/=]/g, (c) => ({ "+": "-", "/": "_", "=": "" })[c]!);
}
function same(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}
async function checkPassword(pw: string) {
  const { data } = await admin.from("vault_config").select("pass_hash").eq("id", 1).maybeSingle();
  if (!data) return false;
  const [, iter, salt, hash] = String(data.pass_hash).split("$");
  const key = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: unb64(salt), iterations: Number(iter) }, key, 256);
  return same(new Uint8Array(bits), unb64(hash));
}

const fails = new Map<string, { n: number; until: number }>();

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: u } = await admin.auth.getUser(jwt);
  if (!u?.user) return json({ error: "Sign in first" }, 401);
  const uid = u.user.id;
  const { data: prof } = await admin.from("profiles").select("site_role").eq("id", uid).maybeSingle();
  if (!prof || !["owner", "admin"].includes(prof.site_role)) return json({ error: "Admins only" }, 403);

  let b: Record<string, any>;
  try {
    b = await req.json();
  } catch {
    return json({ error: "Invalid request" }, 400);
  }

  if (b.action === "unlock") {
    const f = fails.get(uid);
    if (f && f.until > Date.now()) return json({ error: "Too many attempts — wait a minute" }, 429);
    if (!(await checkPassword(String(b.password ?? "")))) {
      const n = (f?.n ?? 0) + 1;
      fails.set(uid, { n, until: n >= 5 ? Date.now() + 60_000 : 0 });
      return json({ error: "Wrong vault password" }, 403);
    }
    fails.delete(uid);
    const exp = Date.now() + 30 * 60_000;
    return json({ token: `${uid}.${exp}.${await hmac(`${uid}.${exp}`)}`, exp });
  }

  // every other action needs a valid vault token for this admin
  const [tUid, tExp, tSig] = String(b.token ?? "").split(".");
  if (tUid !== uid || !(Number(tExp) > Date.now()) || tSig !== (await hmac(`${tUid}.${tExp}`))) {
    return json({ error: "Vault locked", locked: true }, 401);
  }

  if (b.action === "list") {
    const bucket = String(b.bucket ?? "attachments");
    if (!BUCKETS.includes(bucket)) return json({ error: "Unknown bucket" }, 400);
    const prefix = String(b.prefix ?? "").replace(/^\/+|\/+$/g, "");
    const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 200, sortBy: { column: "created_at", order: "desc" } });
    if (error) return json({ error: error.message }, 400);
    return json({
      items: (data ?? []).map((o) => ({
        name: o.name,
        folder: !o.id,
        size: (o.metadata as any)?.size ?? null,
        type: (o.metadata as any)?.mimetype ?? null,
        created_at: o.created_at,
      })),
    });
  }

  if (b.action === "sign") {
    let bucket = String(b.bucket ?? "");
    let path = String(b.path ?? "");
    if (b.url) {
      const m = String(b.url).match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/([^?]+)/);
      if (!m) return json({ error: "Not a storage link" }, 400);
      bucket = m[1];
      path = decodeURIComponent(m[2]);
    }
    if (!BUCKETS.includes(bucket)) return json({ error: "Unknown bucket" }, 400);
    const { data, error } = await admin.storage.from(bucket).createSignedUrl(path, 120);
    if (error) return json({ error: error.message }, 400);
    return json({ url: data.signedUrl });
  }

  return json({ error: "Unknown action" }, 400);
});
