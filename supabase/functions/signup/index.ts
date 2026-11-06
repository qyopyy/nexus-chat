// Nexus signup — creates an already-confirmed account (no confirmation email,
// so no email rate limits). Account passwords and sessions stay on Supabase Auth.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.119.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

/** Soft abuse brake for unauthenticated signup (per isolate; resets when the isolate restarts). */
const attempts = new Map<string, { n: number; until: number }>();
const WINDOW_MS = 15 * 60_000;
const MAX_ATTEMPTS = 12;

function clientKey(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("cf-connecting-ip") || "unknown";
}

function rateLimited(key: string) {
  const now = Date.now();
  const rec = attempts.get(key);
  if (!rec) return false;
  if (rec.until && rec.until > now) return true;
  if (now - (rec.until || 0) > WINDOW_MS && rec.n >= MAX_ATTEMPTS) {
    attempts.delete(key);
    return false;
  }
  return false;
}

function bump(key: string, hard = false) {
  const now = Date.now();
  const rec = attempts.get(key) ?? { n: 0, until: 0 };
  if (rec.until && rec.until < now) {
    rec.n = 0;
    rec.until = 0;
  }
  rec.n += 1;
  if (hard || rec.n >= MAX_ATTEMPTS) rec.until = now + WINDOW_MS;
  attempts.set(key, rec);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const key = clientKey(req);
  if (rateLimited(key)) {
    return json({ error: "Too many signup attempts. Try again in a few minutes." }, 429);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request" }, 400);
  }

  // Honeypot: real clients leave this blank.
  if (String(body.website ?? body.company ?? "").trim()) {
    bump(key, true);
    return json({ ok: true });
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const username = String(body.username ?? "").trim().toLowerCase();
  const displayName = String(body.display_name ?? "").trim().slice(0, 32) || username;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Enter a valid email address." }, 400);
  if (password.length < 8) return json({ error: "Password needs at least 8 characters." }, 400);
  if (password.length > 128) return json({ error: "Password is too long." }, 400);
  if (!/^[a-z0-9_.]{2,32}$/.test(username)) return json({ error: "Username: 2–32 lowercase letters, numbers, _ or ." }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: taken } = await admin.from("profiles").select("id").eq("username", username).maybeSingle();
  if (taken) {
    bump(key);
    return json({ error: `@${username} is already taken.` }, 409);
  }

  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username, display_name: displayName },
  });
  if (error) {
    bump(key);
    const msg = /already (been )?registered|already exists/i.test(error.message)
      ? "An account with this email already exists — try logging in."
      : error.message;
    return json({ error: msg }, 400);
  }
  bump(key);
  return json({ ok: true });
});
