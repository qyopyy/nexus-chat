// Public Untitled share links (/t/<token>).
//  {action:"info", token}
//  {action:"open", token, password?} → project + signed track URLs
//  {action:"play", token, password?, path, download?} → single signed URL
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.119.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const fails = new Map<string, { n: number; at: number }>();

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const b = await req.json().catch(() => ({}));
    const token = String(b.token ?? "").replace(/[^A-Za-z0-9]/g, "").slice(0, 64);
    if (!token) return json({ ok: false, reason: "missing" }, 404);

    if (b.action === "info") {
      const { data } = await admin.rpc("untitled_share_resolve", { p_token: token, p_password: null, p_count: null });
      return json(data ?? { ok: false, reason: "missing" });
    }

    if (b.action === "open") {
      const f = fails.get(token);
      if (f && f.n >= 8 && Date.now() - f.at < 10 * 60_000) return json({ ok: false, reason: "locked" }, 429);
      const { data } = await admin.rpc("untitled_share_resolve", { p_token: token, p_password: b.password ?? null, p_count: "view" });
      const r = data as {
        ok: boolean;
        reason?: string;
        tracks?: { id: string; title: string; path: string; mime: string | null; bytes: number; duration: number | null; position: number }[];
        download?: boolean;
        permission?: string;
      };
      if (!r?.ok) {
        if (r?.reason === "password") fails.set(token, { n: (f?.n ?? 0) + 1, at: Date.now() });
        return json(r ?? { ok: false, reason: "missing" }, 403);
      }
      fails.delete(token);
      const tracks = [];
      for (const t of r.tracks ?? []) {
        const { data: s } = await admin.storage.from("untitled").createSignedUrl(t.path, 3600);
        tracks.push({ ...t, url: s?.signedUrl, path: undefined });
      }
      return json({ ...r, tracks });
    }

    if (b.action === "play") {
      const f = fails.get(token);
      if (f && f.n >= 8 && Date.now() - f.at < 10 * 60_000) return json({ ok: false, reason: "locked" }, 429);
      const { data } = await admin.rpc("untitled_share_resolve", { p_token: token, p_password: b.password ?? null, p_count: "play" });
      const r = data as { ok: boolean; reason?: string; tracks?: { path: string; title: string }[]; download?: boolean };
      if (!r?.ok) {
        if (r?.reason === "password") fails.set(token, { n: (f?.n ?? 0) + 1, at: Date.now() });
        return json(r ?? { ok: false, reason: "missing" }, 403);
      }
      const path = String(b.path ?? "");
      const track = (r.tracks ?? []).find((t) => t.path === path);
      if (!track) return json({ ok: false, reason: "missing" }, 404);
      if (b.download && !r.download) return json({ ok: false, reason: "missing" }, 403);
      const { data: s, error } = await admin.storage
        .from("untitled")
        .createSignedUrl(path, b.download ? 120 : 600, b.download ? { download: track.title } : undefined);
      if (error || !s) return json({ ok: false, reason: "storage" }, 500);
      return json({ ok: true, url: s.signedUrl, name: track.title });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
