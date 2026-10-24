// Public vault share links (/s/<token>). No sign-in: the link itself is the key.
//  {action:"info", token}                              → file name/size/owner + whether a password is needed
//  {action:"get", token, password?, mode:"download"|"preview"} → short-lived signed URL
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

// slow down password guessing per token (best effort, per instance)
const fails = new Map<string, { n: number; at: number }>();

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const b = await req.json().catch(() => ({}));
    const token = String(b.token ?? "").replace(/[^A-Za-z0-9]/g, "").slice(0, 64);
    if (!token) return json({ ok: false, reason: "missing" }, 404);

    if (b.action === "info") {
      const { data } = await admin.rpc("vault_share_resolve", { p_token: token, p_password: null, p_count: null });
      return json(data ?? { ok: false, reason: "missing" });
    }
    if (b.action === "get") {
      const f = fails.get(token);
      if (f && f.n >= 8 && Date.now() - f.at < 10 * 60_000) return json({ ok: false, reason: "locked" }, 429);
      const mode = b.mode === "preview" ? "preview" : "download";
      const { data } = await admin.rpc("vault_share_resolve", { p_token: token, p_password: b.password ?? null, p_count: mode });
      const r = data as { ok: boolean; reason?: string; path?: string; name?: string };
      if (!r?.ok || !r.path) {
        if (r?.reason === "password") fails.set(token, { n: (f?.n ?? 0) + 1, at: Date.now() });
        return json(r ?? { ok: false, reason: "missing" }, 403);
      }
      fails.delete(token);
      const { data: s, error } = await admin.storage
        .from("user-vault")
        .createSignedUrl(r.path, mode === "preview" ? 600 : 120, mode === "download" ? { download: r.name ?? true } : undefined);
      if (error || !s) return json({ ok: false, reason: "storage" }, 500);
      return json({ ok: true, url: s.signedUrl, name: r.name });
    }
    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
