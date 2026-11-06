// Nexus push: called by the messages trigger (pg_net) for every new message.
// Sends Web Push (browsers, installed PWAs incl. iPhone home-screen app) and FCM (Android app, when configured).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.119.0";
import webpush from "npm:web-push@3.6.7";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

let cfgCache: { at: number; cfg: any } | null = null;
async function config() {
  if (cfgCache && Date.now() - cfgCache.at < 60_000) return cfgCache.cfg;
  const { data } = await admin.from("push_config").select("*").eq("id", 1).maybeSingle();
  cfgCache = { at: Date.now(), cfg: data };
  return data;
}

// ---------------------------------------------------------------- FCM (HTTP v1) with a service account
let fcmToken: { value: string; exp: number } | null = null;
const b64url = (b: ArrayBuffer | Uint8Array | string) =>
  btoa(typeof b === "string" ? b : String.fromCharCode(...new Uint8Array(b as ArrayBuffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

async function fcmAccessToken(sa: any) {
  if (fcmToken && fcmToken.exp > Date.now() + 60_000) return fcmToken.value;
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(
    JSON.stringify({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }),
  );
  const pem = String(sa.private_key).replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${claim}`));
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${header}.${claim}.${b64url(sig)}` }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`FCM auth: ${j.error_description ?? j.error}`);
  fcmToken = { value: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return fcmToken.value;
}

function preview(m: any) {
  const t = String(m.attachment_type ?? "");
  if (m.content?.trim()) return m.content.trim().slice(0, 160);
  if (t.startsWith("audio/") && String(m.attachment_name ?? "").startsWith("voice-")) return "🎤 Voice message";
  if (t.startsWith("image/")) return "📷 Photo";
  if (t.startsWith("video/")) return "🎥 Video";
  if (t.startsWith("audio/")) return "🎵 Audio";
  if (m.attachment_name) return `📎 ${m.attachment_name}`;
  return "New message";
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const cfg = await config();
  if (!cfg?.secret || req.headers.get("x-push-secret") !== cfg.secret) return json({ error: "Forbidden" }, 403);
  const { message_id, call_event_id } = await req.json().catch(() => ({}));
  if (!message_id && !call_event_id) return json({ error: "message_id or call_event_id required" }, 400);

  let recipients: string[] = [];
  let title = "Nexus";
  let body = "New message";
  let conv: any = null;
  let payload: Record<string, unknown>;
  let isCall = false;

  if (call_event_id) {
    // ---- incoming call ring
    isCall = true;
    const { data: ev } = await admin.from("call_events").select("*").eq("id", call_event_id).maybeSingle();
    if (!ev || ev.kind !== "ring") return json({ skipped: "no ring" });
    const [{ data: c }, { data: caller }] = await Promise.all([
      admin.from("conversations").select("id, kind, name, space_id").eq("id", ev.conversation_id).maybeSingle(),
      admin.from("profiles").select("display_name, avatar_url").eq("id", ev.caller_id).maybeSingle(),
    ]);
    conv = c;
    if (!conv || (conv.kind !== "dm" && conv.kind !== "group")) return json({ skipped: "not a dm/group" });
    const { data } = await admin.from("conversation_members").select("user_id").eq("conversation_id", conv.id);
    recipients = (data ?? []).map((r: any) => r.user_id).filter((id: string) => id !== ev.caller_id);
    const who = caller?.display_name ?? "Someone";
    title = conv.kind === "dm" ? `📞 ${who}` : `📞 ${who} · ${conv.name ?? "Group"}`;
    body = "Incoming call — tap to answer";
    payload = {
      title,
      body,
      tag: `call-${conv.id}`,
      url: `/?c=${conv.id}&call=1`,
      icon: caller?.avatar_url && !/\.(gif|webp)(\?|$)/i.test(caller.avatar_url) ? caller.avatar_url : "/icon-512.png",
      conversation_id: conv.id,
      call: true,
    };
  } else {
    const { data: m } = await admin.from("messages").select("*").eq("id", message_id).maybeSingle();
    if (!m || m.deleted_at) return json({ skipped: "no message" });
    const [{ data: c }, { data: author }] = await Promise.all([
      admin.from("conversations").select("id, kind, name, space_id").eq("id", m.conversation_id).maybeSingle(),
      admin.from("profiles").select("display_name, username, avatar_url").eq("id", m.author_id).maybeSingle(),
    ]);
    conv = c;
    if (!conv) return json({ skipped: "no conversation" });

    // who gets it: everyone in DMs / groups (unless they muted the chat); in space channels only @mentioned members
    if (conv.kind === "dm" || conv.kind === "group") {
      const { data } = await admin.from("conversation_members").select("user_id, muted").eq("conversation_id", conv.id);
      recipients = (data ?? []).filter((r: any) => r.user_id !== m.author_id && !r.muted).map((r: any) => r.user_id);
    } else if (conv.space_id) {
      const names = [...String(m.content ?? "").matchAll(/(^|\s)@([a-z0-9_.]{2,32})/gi)].map((x) => x[2].toLowerCase());
      const everyone = /(^|\s)@(everyone|here)\b/i.test(m.content ?? "");
      const { data: members } = await admin.from("space_members").select("user_id, role").eq("space_id", conv.space_id);
      const authorRole = (members ?? []).find((x: any) => x.user_id === m.author_id)?.role;
      if (everyone && (authorRole === "owner" || authorRole === "admin")) recipients = (members ?? []).map((x: any) => x.user_id);
      else if (names.length) {
        const { data: ps } = await admin.from("profiles").select("id").in("username", names);
        const inSpace = new Set((members ?? []).map((x: any) => x.user_id));
        recipients = (ps ?? []).map((p: any) => p.id).filter((id: string) => inSpace.has(id));
      }
      recipients = recipients.filter((id) => id !== m.author_id);
    }
    const who = author?.display_name ?? "Someone";
    title = conv.kind === "dm" ? who : conv.kind === "group" ? `${who} · ${conv.name ?? "Group"}` : `${who} in #${conv.name ?? "channel"}`;
    body = preview(m);
    payload = {
      title,
      body,
      tag: conv.id,
      url: `/?c=${conv.id}`,
      icon: author?.avatar_url && !/\.(gif|webp)(\?|$)/i.test(author.avatar_url) ? author.avatar_url : "/icon-512.png",
      conversation_id: conv.id,
      message_id: m.id,
    };
  }
  if (!recipients.length) return json({ sent: 0 });

  const { data: subs } = await admin.from("push_subscriptions").select("*").in("user_id", recipients);
  let sent = 0;
  const dead: string[] = [];

  if (cfg.vapid_public && cfg.vapid_private) webpush.setVapidDetails("mailto:qyopy@wrld.su", cfg.vapid_public, cfg.vapid_private);
  let sa: any = null;
  try {
    sa = cfg.fcm_service_account ? JSON.parse(cfg.fcm_service_account) : Deno.env.get("FCM_SERVICE_ACCOUNT") ? JSON.parse(Deno.env.get("FCM_SERVICE_ACCOUNT")!) : null;
  } catch {
    sa = null;
  }

  await Promise.all(
    (subs ?? []).map(async (s: any) => {
      try {
        if (s.kind === "web") {
          if (!cfg.vapid_private) return;
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: isCall ? 60 : 86400, urgency: "high", topic: (isCall ? "c" : "") + conv.id.replace(/-/g, "").slice(0, isCall ? 31 : 32) });
          sent++;
        } else if (s.kind === "fcm" && sa) {
          const token = await fcmAccessToken(sa);
          const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              message: {
                token: s.endpoint,
                notification: { title, body },
                data: { conversation_id: conv.id, url: String(payload.url), call: isCall ? "1" : "0" },
                android: { priority: "high", ttl: isCall ? "60s" : "86400s", notification: { tag: String(payload.tag), channel_id: isCall ? "calls" : "messages", sound: "default" } },
                apns: { payload: { aps: { sound: "default", "thread-id": conv.id } } },
              },
            }),
          });
          if (res.ok) sent++;
          else {
            const j = await res.json().catch(() => ({}));
            const code = JSON.stringify(j);
            if (res.status === 404 || /UNREGISTERED|INVALID_ARGUMENT/.test(code)) dead.push(s.id);
          }
        }
      } catch (e: any) {
        if (e?.statusCode === 404 || e?.statusCode === 410) dead.push(s.id);
      }
    }),
  );
  if (dead.length) await admin.from("push_subscriptions").delete().in("id", dead);
  return json({ sent, removed: dead.length });
});
