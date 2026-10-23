// Receives Tunearo webhooks (release.* / royalties.imported), verifies X-Tunearo-Signature
// (HMAC-SHA256 of the raw body with the endpoint secret) and updates the matching Nexus release.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const enc = new TextEncoder();

function equal(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

const STATUS: Record<string, string> = {
  "release.submitted": "pending",
  "release.approved": "approved",
  "release.rejected": "rejected",
  "release.live": "live",
  "release.takedown_completed": "taken_down",
};

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const raw = await req.text();
  const { data: s } = await admin.from("dist_settings").select("value").eq("key", "webhook_secret").maybeSingle();
  if (!s?.value) return new Response("Webhook not configured", { status: 503 });

  const key = await crypto.subtle.importKey("raw", enc.encode(s.value), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(raw)));
  const hex = Array.from(mac, (x) => x.toString(16).padStart(2, "0")).join("");
  const sig = (req.headers.get("X-Tunearo-Signature") ?? "").trim().toLowerCase().replace(/^sha256=/, "");
  if (!equal(hex, sig)) return new Response("Bad signature", { status: 401 });

  let body: { event?: string; data?: Record<string, any> };
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }
  const event = String(body.event ?? "");
  const data = body.data ?? {};
  const tid = typeof data.id === "string" ? data.id : null;
  await admin.from("dist_events").insert({ event, tunearo_id: event.startsWith("release.") ? tid : null, payload: body });

  const status = STATUS[event];
  if (status && tid) {
    const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
    if (event === "release.rejected") patch.rejection_reason = data.rejection_reason ?? "Rejected by Tunearo";
    if (event === "release.live" && data.upc) patch.upc = data.upc;
    if (event === "release.approved" || event === "release.live") patch.rejection_reason = null;
    await admin.from("dist_releases").update(patch).eq("tunearo_id", tid);
  }
  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
});
