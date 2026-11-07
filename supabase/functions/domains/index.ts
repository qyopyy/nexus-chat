// Profile custom domains.
//   POST { action: "verify" }  — checks the owner's DNS (TXT _nexus.<domain> = nexus-verify=<token>,
//                                plus A/CNAME pointing at Vercel) and marks the domain verified / live.
//   POST { action: "remove" }  — unlinks the domain.
// If Edge Function secrets VERCEL_TOKEN + VERCEL_PROJECT_ID (+ optional VERCEL_TEAM_ID) are set, the
// domain is also added to / removed from the Vercel project automatically.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const VERCEL_A = "76.76.21.21";
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });

type Answer = { type: number; data: string };
async function dns(name: string, type: "TXT" | "A" | "CNAME"): Promise<string[]> {
  for (const url of [`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`, `https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`]) {
    try {
      const r = await fetch(url, { headers: { accept: "application/dns-json" } });
      if (!r.ok) continue;
      const j = (await r.json()) as { Answer?: Answer[] };
      const want = type === "TXT" ? 16 : type === "A" ? 1 : 5;
      return (j.Answer ?? []).filter((a) => a.type === want).map((a) => a.data.replace(/^"|"$/g, "").replace(/"\s*"/g, "").replace(/\.$/, "").toLowerCase());
    } catch {
      /* try the next resolver */
    }
  }
  return [];
}

const vercel = () => {
  const token = Deno.env.get("VERCEL_TOKEN");
  const project = Deno.env.get("VERCEL_PROJECT_ID");
  if (!token || !project) return null;
  const team = Deno.env.get("VERCEL_TEAM_ID");
  const q = team ? `?teamId=${encodeURIComponent(team)}` : "";
  return { token, project, q };
};
async function vercelAdd(domain: string): Promise<{ ok: boolean; note?: string }> {
  const v = vercel();
  if (!v) return { ok: false, note: "Verified — Nexus admins will switch it on shortly." };
  const r = await fetch(`https://api.vercel.com/v10/projects/${v.project}/domains${v.q}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${v.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: domain }),
  });
  if (r.ok || r.status === 409) return { ok: true };
  const j = (await r.json().catch(() => ({}))) as { error?: { message?: string } };
  return { ok: false, note: `Couldn't add it to the site: ${j.error?.message ?? r.status}` };
}
async function vercelRemove(domain: string) {
  const v = vercel();
  if (!v) return;
  await fetch(`https://api.vercel.com/v9/projects/${v.project}/domains/${encodeURIComponent(domain)}${v.q}`, { method: "DELETE", headers: { Authorization: `Bearer ${v.token}` } }).catch(() => {});
}

/** apex (yourname.com / yourname.co.uk) vs subdomain (me.yourname.com) */
function isApex(d: string) {
  const parts = d.split(".");
  if (parts.length <= 2) return true;
  return parts.length === 3 && parts[2].length === 2 && ["co", "com", "org", "net", "ac", "gov", "edu"].includes(parts[1]);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const auth = req.headers.get("Authorization") ?? "";
  const { data: u } = await db.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
  const uid = u?.user?.id;
  if (!uid) return json({ error: "Sign in first" }, 401);
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    /* empty body */
  }
  const { data: row } = await db.from("profile_domains").select("domain,token,status").eq("user_id", uid).maybeSingle();
  if (!row) return json({ error: "Add a domain first" }, 400);

  if (body.action === "remove") {
    await vercelRemove(row.domain);
    await db.from("profile_domains").delete().eq("user_id", uid);
    return json({ ok: true });
  }

  // ── verify ──
  const d = row.domain as string;
  const txt = await dns(`_nexus.${d}`, "TXT");
  const owns = txt.some((t) => t.includes(`nexus-verify=${row.token}`));
  if (!owns) {
    await db.from("profile_domains").update({ status: "pending", note: "TXT record not found yet — DNS can take up to an hour.", updated_at: new Date().toISOString() }).eq("user_id", uid);
    return json({ ok: true, status: "pending", note: "TXT record not found yet — DNS changes can take up to an hour." });
  }
  const [a, cname] = await Promise.all([dns(d, "A"), dns(d, "CNAME")]);
  const routed = a.includes(VERCEL_A) || cname.some((c) => c.endsWith("vercel-dns.com"));
  const add = await vercelAdd(d);
  const status = routed && add.ok ? "live" : "verified";
  const note = !routed
    ? isApex(d)
      ? `Ownership confirmed. Now point it here: A record @ → ${VERCEL_A}`
      : `Ownership confirmed. Now point it here: CNAME ${d.split(".")[0]} → cname.vercel-dns.com`
    : add.ok
      ? null
      : add.note;
  await db
    .from("profile_domains")
    .update({ status, note, verified_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("user_id", uid);
  return json({ ok: true, status, note });
});
