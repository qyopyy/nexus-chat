// Nexus takedown sender.
//  {action:"status"}                         → { configured, verified: [emails] }
//  {action:"send_code", email}               → emails a 6-digit code (10 min) to prove the sender owns that address
//  {action:"verify", email, code}            → marks the email verified for this user
//  {action:"send", id}                       → sends the saved notice to Spotify / Apple from Nexus,
//                                              Reply-To + CC = the verified rights holder, then Nexus Bot confirms in chat
// Secrets: RESEND_API_KEY (resend.com, domain verified), optional TAKEDOWN_FROM, optional TAKEDOWN_TEST_TO (redirects platform mail while testing)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const URL_ = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(URL_, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const RESEND = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM = Deno.env.get("TAKEDOWN_FROM") ?? "Nexus Takedowns <takedowns@nexusproject.cc>";
// tolerate quotes / spaces / "Name <email>" in the secret — keep just the address
const TEST_RAW = (Deno.env.get("TAKEDOWN_TEST_TO") ?? "").trim();
const TEST_TO = (TEST_RAW.match(/[^\s<>"'@,;]+@[^\s<>"'@,;]+\.[^\s<>"'@,;]+/) ?? [""])[0].toLowerCase();
const TEST_BAD = !!TEST_RAW && !TEST_TO;
const NEXUS_BOT = "00000000-0000-4000-8000-00000000b001";

const PLATFORM: Record<string, { name: string; email: string }> = {
  spotify: { name: "Spotify", email: "infringement-claim@spotify.com" },
  apple: { name: "Apple Music", email: "copyrightnotices@apple.com" },
  deezer: { name: "Deezer", email: "copyright@deezer.com" },
  youtube: { name: "YouTube Claim / Content ID", email: "copyright@youtube.com" },
  youtube_music: { name: "YouTube Music", email: "copyright@youtube.com" },
  soundcloud: { name: "SoundCloud", email: "copyright@soundcloud.com" },
  tidal: { name: "TIDAL", email: "copyright@tidal.com" },
  amazon: { name: "Amazon Music", email: "copyright@amazon.com" },
  tiktok: { name: "TikTok", email: "copyright@tiktok.com" },
  snapchat: { name: "Snapchat", email: "copyright@snapchat.com" },
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const norm = (e: unknown) => String(e ?? "").trim().toLowerCase();
async function sha(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

async function mail(m: { to: string[]; cc?: string[]; reply_to?: string; subject: string; text: string }) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, ...m }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Email service: ${j?.message ?? r.status}`);
  return String(j?.id ?? "");
}

// Same notice the app shows (kept in sync with src/lib/takedown.ts)
function noticeText(n: any, date = new Date()) {
  const c = n.contact ?? {};
  const t = (v: unknown) => String(v ?? "").trim();
  const owner = c.role === "agent" ? `${t(c.company)} (I am an authorized agent acting on its behalf)` : t(c.company) || t(c.name);
  const P = PLATFORM[n.platform];
  const lines: (string | null)[] = [
    `To: ${P.name} — Copyright Agent`,
    `Date: ${date.toISOString().slice(0, 10)}`,
    "",
    "NOTICE OF COPYRIGHT INFRINGEMENT",
    "(Digital Millennium Copyright Act, 17 U.S.C. § 512(c)(3), and applicable local law)",
    "",
    "1. COPYRIGHTED WORK",
    `   Title: ${t(n.work_title)}`,
    n.work_artist ? `   Artist: ${t(n.work_artist)}` : null,
    n.isrc ? `   ISRC: ${n.isrc}` : null,
    n.upc ? `   UPC: ${n.upc}` : null,
    n.original_url ? `   Authorized release: ${t(n.original_url)}` : null,
    `   Rights owner: ${owner}`,
    "",
    `2. INFRINGING MATERIAL ON ${P.name.toUpperCase()}`,
    ...(n.infringing as string[]).map((u, i) => `   ${i + 1}. ${u}`),
    "",
    "3. DESCRIPTION",
    ...t(n.description).split("\n").map((l) => `   ${l}`),
    "",
    "4. CONTACT INFORMATION",
    `   Name: ${t(c.name)}`,
    t(c.company) ? `   Company: ${t(c.company)}` : null,
    `   Address: ${t(c.address)}, ${t(c.country)}`,
    `   Phone: ${t(c.phone)}`,
    `   Email: ${t(c.email)}`,
    "",
    "5. STATEMENTS",
    "   I have a good faith belief that use of the material in the manner complained of is not authorized by the copyright owner, its agent, or the law.",
    "   The information in this notice is accurate, and under penalty of perjury, I am the owner, or an agent authorized to act on behalf of the owner, of an exclusive right that is allegedly infringed.",
    n.platform === "spotify"
      ? "   I acknowledge that my contact information and this notice may be provided to the person(s) who provided the allegedly infringing content, and may be retained for legal purposes."
      : "   I understand that under 17 U.S.C. § 512(f) I may be liable for damages if I knowingly materially misrepresent that material or activity is infringing.",
    "",
    "Please remove or disable access to the infringing material listed above. Please reply directly to the rights holder at the email address above.",
    "",
    `Signature: /${t(n.signature)}/`,
    `${t(c.name)}${t(c.company) ? `, ${t(c.company)}` : ""}`,
    "",
    "— Sent via Nexus on behalf of the rights holder, whose email address was verified before sending.",
  ];
  return lines.filter((l): l is string => l !== null).join("\n");
}

async function botTell(user: string, text: string) {
  try {
    const { data: conv } = await admin.rpc("dm_between", { a: NEXUS_BOT, b: user });
    if (conv) await admin.rpc("bot_say", { p_bot: NEXUS_BOT, p_conv: conv, p_text: text });
  } catch {
    /* chat notice is best-effort */
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: u } = await admin.auth.getUser(jwt);
    if (!u?.user) return json({ error: "Sign in first" }, 401);
    const uid = u.user.id;
    const asUser = createClient(URL_, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false } });
    const b = await req.json().catch(() => ({}));

    if (b.action === "status") {
      const { data } = await admin.from("verified_emails").select("email").eq("user_id", uid);
      return json({ configured: !!RESEND, test: !!TEST_TO, verified: (data ?? []).map((r) => r.email) });
    }
    if (!RESEND) return json({ error: "Direct sending isn't switched on yet — an admin needs to add the email service key.", not_configured: true }, 503);

    if (b.action === "send_code") {
      const email = norm(b.email);
      if (!EMAIL_RE.test(email)) return json({ error: "Enter a valid email" }, 400);
      const hourAgo = new Date(Date.now() - 3600_000).toISOString();
      const { count } = await admin.from("email_codes").select("id", { count: "exact", head: true }).eq("user_id", uid).gte("created_at", hourAgo);
      if ((count ?? 0) >= 5) return json({ error: "Too many codes — try again in an hour" }, 429);
      const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
      await admin.from("email_codes").insert({ user_id: uid, email, code_hash: await sha(`${uid}:${email}:${code}`), expires_at: new Date(Date.now() + 10 * 60_000).toISOString() });
      await mail({
        to: [email],
        subject: `Your Nexus code: ${code}`,
        text: `Your Nexus verification code is ${code}\n\nEnter it in Nexus to confirm this email before your copyright notice is sent. It expires in 10 minutes.\nIf you didn't ask for this, ignore this email.`,
      });
      return json({ ok: true });
    }

    if (b.action === "verify") {
      const email = norm(b.email);
      const code = String(b.code ?? "").replace(/\D/g, "");
      const { data: row } = await admin
        .from("email_codes")
        .select("*")
        .eq("user_id", uid)
        .eq("email", email)
        .is("used_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!row) return json({ error: "Code expired — send a new one" }, 400);
      if (row.attempts >= 5) return json({ error: "Too many wrong tries — send a new code" }, 429);
      if (row.code_hash !== (await sha(`${uid}:${email}:${code}`))) {
        await admin.from("email_codes").update({ attempts: row.attempts + 1 }).eq("id", row.id);
        return json({ error: "Wrong code" }, 400);
      }
      await admin.from("email_codes").update({ used_at: new Date().toISOString() }).eq("id", row.id);
      await admin.from("verified_emails").upsert({ user_id: uid, email, verified_at: new Date().toISOString() });
      return json({ ok: true });
    }

    if (b.action === "send") {
      const { data: n } = await admin.from("takedown_notices").select("*").eq("id", String(b.id ?? "")).maybeSingle();
      if (!n || n.owner_id !== uid) return json({ error: "Notice not found" }, 404);
      if (n.status === "sent" && n.sent_via === "nexus") return json({ error: "This notice was already sent" }, 409);
      const P = PLATFORM[n.platform];
      const email = norm(n.contact?.email);
      const { data: ok } = await admin.from("verified_emails").select("email").eq("user_id", uid).eq("email", email).maybeSingle();
      if (!ok) return json({ error: "Verify your email first", need_verify: true }, 403);
      const { data: tier } = await asUser.rpc("my_tier");
      if (Number(tier ?? 0) < 2) return json({ error: "Takedown notices come with Nexus Lighting Premium" }, 403);
      const dayAgo = new Date(Date.now() - 86400_000).toISOString();
      const { count } = await admin.from("takedown_notices").select("id", { count: "exact", head: true }).eq("owner_id", uid).eq("sent_via", "nexus").gte("sent_at", dayAgo);
      if ((count ?? 0) >= 10) return json({ error: "Daily limit reached (10 notices) — try again tomorrow" }, 429);
      if (!Array.isArray(n.infringing) || !n.infringing.length) return json({ error: "Add the infringing links" }, 400);
      if (TEST_BAD) return json({ error: "TAKEDOWN_TEST_TO secret isn't an email address — fix or remove it in Supabase secrets" }, 500);

      const subject = `Copyright infringement notice (DMCA) — “${String(n.work_title).trim()}”${n.work_artist ? ` by ${String(n.work_artist).trim()}` : ""}`;
      const to = TEST_TO || P.email;
      const id = await mail({ to: [to], ...(to !== email ? { cc: [email] } : {}), reply_to: email, subject, text: noticeText(n) });
      const now = new Date().toISOString();
      await admin.from("takedown_notices").update({ status: "sent", sent_via: "nexus", sent_at: now, provider_id: id, updated_at: now }).eq("id", n.id);
      await botTell(uid, `🛡️ Your copyright notice for “${n.work_title}” was sent to ${P.name}${TEST_TO ? " (test mode)" : ""}. A copy is in your inbox — ${P.name} will reply to ${email}.`);
      return json({ ok: true, to: TEST_TO ? "test" : P.email });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
