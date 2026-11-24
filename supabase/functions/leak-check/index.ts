// Breach check for the signed-in member's OWN account email, using Have I Been Pwned.
// Needs the secret HIBP_API_KEY (https://haveibeenpwned.com/API/Key). Without it the page says the check isn't switched on.
// Only the member's own email is accepted, so this cannot be used to look up other people.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.119.0";
import { normalizeEmail, trimBreaches } from "./core.mjs";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const URL_ = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const KEY = Deno.env.get("HIBP_API_KEY") ?? "";
const lastCheck = new Map<string, number>(); // best-effort per instance; the provider also rate-limits

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const jwt = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!jwt) return json({ error: "Sign in to run a breach check." }, 401);
  const auth = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${jwt}` } } });
  const { data: who, error: whoError } = await auth.auth.getUser(jwt);
  if (whoError || !who.user?.email) return json({ error: "Sign in to run a breach check." }, 401);
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body means "my account email" */ }
  const own = normalizeEmail(who.user.email);
  const asked = body.email == null || body.email === "" ? own : normalizeEmail(body.email);
  if (!asked) return json({ error: "Enter a valid email address." }, 400);
  if (asked !== own) return json({ error: "You can only check the email on your own Nexus account.", code: "own_email_only" }, 403);
  if (!KEY) return json({ configured: false });
  const now = Date.now();
  if (now - (lastCheck.get(who.user.id) ?? 0) < 15_000) return json({ error: "Please wait a few seconds before checking again." }, 429);
  lastCheck.set(who.user.id, now);
  if (lastCheck.size > 2000) lastCheck.clear();
  try {
    const response = await fetch(`https://haveibeenpwned.com/api/v3/breachedaccount/${encodeURIComponent(asked)}?truncateResponse=false`, {
      headers: { "hibp-api-key": KEY, "user-agent": "nexusproject-leak-check" },
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status === 404) return json({ configured: true, checked_at: new Date().toISOString(), breaches: [] });
    if (response.status === 429) return json({ error: "The breach database is busy. Try again in a minute." }, 429);
    if (!response.ok) return json({ error: "The breach database couldn't be reached. Try again later." }, 502);
    return json({ configured: true, checked_at: new Date().toISOString(), breaches: trimBreaches(await response.json()) });
  } catch {
    return json({ error: "The breach database couldn't be reached. Try again later." }, 502);
  }
});
