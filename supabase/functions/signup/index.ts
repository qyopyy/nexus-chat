// Nexus signup — creates an already-confirmed account (no confirmation email,
// so no email rate limits) after checking the site-password gate token.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// sha256("nexus-gate:<site password>") — default matches the app's default site password.
// Override with the SITE_GATE_TOKEN secret if you change SITE_PASSWORD in the app.
const DEFAULT_GATE_TOKEN = "660d46e572d98a220af6bf7f8ae42353bc8941a16dc7063d96bc0bea541b202b";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request" }, 400);
  }

  const expected = Deno.env.get("SITE_GATE_TOKEN") || DEFAULT_GATE_TOKEN;
  if (expected !== "off" && body.gate !== expected) {
    return json({ error: "Site password required — reload the page and unlock the site first." }, 403);
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const username = String(body.username ?? "").trim().toLowerCase();
  const displayName = String(body.display_name ?? "").trim().slice(0, 32) || username;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Enter a valid email address." }, 400);
  if (password.length < 8) return json({ error: "Password needs at least 8 characters." }, 400);
  if (!/^[a-z0-9_.]{2,32}$/.test(username)) return json({ error: "Username: 2–32 lowercase letters, numbers, _ or ." }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: taken } = await admin.from("profiles").select("id").eq("username", username).maybeSingle();
  if (taken) return json({ error: `@${username} is already taken.` }, 409);

  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username, display_name: displayName },
  });
  if (error) {
    const msg = /already (been )?registered|already exists/i.test(error.message)
      ? "An account with this email already exists — try logging in."
      : error.message;
    return json({ error: msg }, 400);
  }
  return json({ ok: true });
});
