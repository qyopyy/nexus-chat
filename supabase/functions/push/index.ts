// Nexus push: called by DB triggers (pg_net) for new messages, call rings, Wump DMs and friends going Live on Wump.
// Sends Web Push (browsers, installed PWAs incl. iPhone home-screen app), FCM (Android app) and APNs (iPhone apps,
// delivered even when the app is closed — needs an APNs auth key saved in Admin → Push).
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

// ---------------------------------------------------------------- APNs (token auth, ES256 JWT, HTTP/2)
let apnsJwt: { value: string; at: number; kid: string } | null = null;
async function apnsToken(cfg: any) {
  if (apnsJwt && apnsJwt.kid === cfg.apns_key_id && Date.now() - apnsJwt.at < 45 * 60_000) return apnsJwt.value;
  const pem = String(cfg.apns_key_p8).replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const header = b64url(JSON.stringify({ alg: "ES256", kid: cfg.apns_key_id }));
  const claim = b64url(JSON.stringify({ iss: cfg.apns_team_id, iat: Math.floor(Date.now() / 1000) }));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(`${header}.${claim}`));
  apnsJwt = { value: `${header}.${claim}.${b64url(sig)}`, at: Date.now(), kid: cfg.apns_key_id };
  return apnsJwt.value;
}
async function sendApns(cfg: any, s: any, msg: { title: string; body: string; thread: string; data: Record<string, unknown>; isCall: boolean }) {
  const host = cfg.apns_sandbox ? "https://api.sandbox.push.apple.com" : "https://api.push.apple.com";
  const res = await fetch(`${host}/3/device/${encodeURIComponent(s.endpoint)}`, {
    method: "POST",
    headers: {
      authorization: `bearer ${await apnsToken(cfg)}`,
      "apns-topic": s.app || cfg.apns_default_topic || "hu.qyopy.nexus.B44X8B76QR",
      "apns-push-type": "alert",
      "apns-priority": "10",
      "apns-expiration": String(Math.floor(Date.now() / 1000) + (msg.isCall ? 60 : 86400)),
      "apns-collapse-id": msg.thread.slice(0, 64),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      aps: { alert: { title: msg.title, body: msg.body }, sound: "default", "thread-id": msg.thread, "mutable-content": 1, ...(msg.isCall ? { "interruption-level": "time-sensitive" } : {}) },
      ...msg.data,
    }),
  });
  if (res.ok) return "ok" as const;
  const j = await res.json().catch(() => ({}));
  if (res.status === 410 || (res.status === 400 && /BadDeviceToken|DeviceTokenNotForTopic/.test(String(j.reason)))) return "dead" as const;
  console.warn("apns", res.status, j.reason);
  return "fail" as const;
}

function preview(m: any) {
  if (m.hidden) return "🙈 Hidden message";
  if (m.spoiler) return "⚠️ Spoiler";
  const t = String(m.attachment_type ?? "");
  if (m.content?.trim()) return m.content.trim().replace(/<a?:([a-z0-9_]{2,32}):[0-9a-f-]{36}>/g, ":$1:").slice(0, 160);
  if (t.startsWith("audio/") && String(m.attachment_name ?? "").startsWith("voice-")) return "🎤 Voice message";
  if (t.startsWith("image/")) return "📷 Photo";
  if (t.startsWith("video/")) return "🎥 Video";
  if (t.startsWith("audio/")) return "🎵 Audio";
  if (m.attachment_name) return `📎 ${m.attachment_name}`;
  return "New message";
}

// ---------------------------------------------------------------- per-user notification settings (Settings → Notifications)
type NPrefs = { user_id: string; dms: boolean; groups: boolean; mentions: boolean; calls: boolean; previews: boolean; quiet_enabled: boolean; quiet_start: number; quiet_end: number; quiet_allow_calls: boolean; tz: string };
function localMinutes(tz: string) {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
    const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
    const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
    return (h % 24) * 60 + m;
  } catch {
    const d = new Date();
    return d.getUTCHours() * 60 + d.getUTCMinutes();
  }
}
function inQuiet(p: NPrefs) {
  if (!p.quiet_enabled || p.quiet_start === p.quiet_end) return false;
  const now = localMinutes(p.tz || "UTC");
  return p.quiet_start < p.quiet_end ? now >= p.quiet_start && now < p.quiet_end : now >= p.quiet_start || now < p.quiet_end;
}
/** drop recipients who turned this kind off or are in quiet hours; returns who should get a hidden preview */
async function applyPrefs(recipients: string[], kind: "dm" | "group" | "mention" | "call") {
  if (!recipients.length) return { keep: recipients, hidePreview: new Set<string>() };
  const { data } = await admin.from("notification_prefs").select("*").in("user_id", recipients);
  const byId = new Map<string, NPrefs>(((data ?? []) as NPrefs[]).map((p) => [p.user_id, p]));
  const hidePreview = new Set<string>();
  const keep = recipients.filter((id) => {
    const p = byId.get(id);
    if (!p) return true;
    if (kind === "dm" && !p.dms) return false;
    if (kind === "group" && !p.groups) return false;
    if (kind === "mention" && !p.mentions) return false;
    if (kind === "call" && !p.calls) return false;
    if (inQuiet(p) && !(kind === "call" && p.quiet_allow_calls)) return false;
    if (!p.previews) hidePreview.add(id);
    return true;
  });
  return { keep, hidePreview };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const cfg = await config();
  if (!cfg?.secret || req.headers.get("x-push-secret") !== cfg.secret) return json({ error: "Forbidden" }, 403);
  const { message_id, call_event_id, bump_message_id, wump_live_user } = await req.json().catch(() => ({}));
  if (!message_id && !call_event_id && !bump_message_id && !wump_live_user) return json({ error: "nothing to send" }, 400);

  let recipients: string[] = [];
  let title = "Nexus";
  let body = "New message";
  let conv: any = null;
  let payload: Record<string, unknown>;
  let isCall = false;
  let kind: "dm" | "group" | "mention" | "call" = "dm";
  let senderId = "";

  if (bump_message_id) {
    // ---- Wump DM
    const { data: m } = await admin.from("bump_messages").select("*").eq("id", bump_message_id).maybeSingle();
    if (!m) return json({ skipped: "no message" });
    senderId = m.sender_id;
    recipients = [m.recipient_id];
    kind = "dm";
    const { data: author } = await admin.from("profiles").select("display_name, username, avatar_url").eq("id", m.sender_id).maybeSingle();
    title = `${author?.display_name ?? author?.username ?? "Someone"} · Wump`;
    body = String(m.body ?? "").slice(0, 160) || "New message";
    conv = { id: `wump-${[m.sender_id, m.recipient_id].sort().join("")}`.slice(0, 64) };
    payload = { title, body, tag: conv.id, url: `/wump/app?dm=${m.sender_id}`, icon: author?.avatar_url && !/\.(gif|webp)(\?|$)/i.test(author.avatar_url) ? author.avatar_url : "/icon-512.png" };
  } else if (wump_live_user) {
    // ---- a friend / family member just went Live on Wump
    senderId = String(wump_live_user);
    kind = "dm";
    const [{ data: pres }, { data: who }, { data: fam }, { data: fr }] = await Promise.all([
      admin.from("bump_presence").select("visible, place_name, place_locality").eq("user_id", senderId).maybeSingle(),
      admin.from("profiles").select("display_name, username, avatar_url").eq("id", senderId).maybeSingle(),
      admin.from("bump_family").select("user_id, member_id").or(`user_id.eq.${senderId},member_id.eq.${senderId}`),
      admin.from("friendships").select("requester_id, addressee_id").eq("status", "accepted").or(`requester_id.eq.${senderId},addressee_id.eq.${senderId}`),
    ]);
    if (!pres) return json({ skipped: "not live" });
    const family = (fam ?? []).map((r: any) => (r.user_id === senderId ? r.member_id : r.user_id));
    const friends = (fr ?? []).map((r: any) => (r.requester_id === senderId ? r.addressee_id : r.requester_id));
    recipients = [...new Set(pres.visible === "family" ? family : [...family, ...friends])].filter((id) => id && id !== senderId);
    // only people who use Wump and kept "friend goes Live" alerts on
    if (recipients.length) {
      const { data: off } = await admin.from("notification_prefs").select("user_id").in("user_id", recipients).eq("wump_live", false);
      const skip = new Set((off ?? []).map((r: any) => r.user_id));
      const { data: users } = await admin.from("bump_profiles").select("user_id").in("user_id", recipients);
      const wumpers = new Set((users ?? []).map((r: any) => r.user_id));
      recipients = recipients.filter((id) => !skip.has(id) && wumpers.has(id));
    }
    const place = pres.place_name || pres.place_locality;
    title = `📍 ${who?.display_name ?? who?.username ?? "A friend"} is Live`;
    body = place ? `Sharing their location near ${place} — tap to see them` : "Sharing their location on Wump — tap to see them";
    conv = { id: `wump-live-${senderId}`.slice(0, 64) };
    payload = { title, body, tag: conv.id, url: `/wump/app?u=${senderId}`, icon: who?.avatar_url && !/\.(gif|webp)(\?|$)/i.test(who.avatar_url) ? who.avatar_url : "/icon-512.png" };
  } else if (call_event_id) {
    // ---- incoming call ring
    isCall = true;
    kind = "call";
    const { data: ev } = await admin.from("call_events").select("*").eq("id", call_event_id).maybeSingle();
    if (!ev || ev.kind !== "ring") return json({ skipped: "no ring" });
    senderId = ev.caller_id;
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
    senderId = m.author_id;
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
      kind = conv.kind === "dm" ? "dm" : "group";
    } else if (conv.space_id) {
      kind = "mention";
      const names = [...String(m.content ?? "").matchAll(/(^|\s)@([a-z0-9_.]{1,32})/gi)].map((x) => x[2].toLowerCase());
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
  // people who blocked the sender (or were blocked by them) never get a notification
  if (recipients.length && senderId) {
    const { data: bl } = await admin
      .from("user_blocks")
      .select("blocker_id, blocked_id")
      .or(`and(blocked_id.eq.${senderId},blocker_id.in.(${recipients.join(",")})),and(blocker_id.eq.${senderId},blocked_id.in.(${recipients.join(",")}))`);
    const skip = new Set(((bl ?? []) as { blocker_id: string; blocked_id: string }[]).map((b) => (b.blocker_id === senderId ? b.blocked_id : b.blocker_id)));
    recipients = recipients.filter((id) => !skip.has(id));
  }
  const filtered = await applyPrefs(recipients, kind);
  recipients = filtered.keep;
  if (!recipients.length) return json({ sent: 0 });
  const hidden = { ...payload, body: isCall ? body : "New message" };
  const payloadFor = (uid: string) => (filtered.hidePreview.has(uid) ? hidden : payload);

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
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payloadFor(s.user_id)), { TTL: isCall ? 60 : 86400, urgency: "high", topic: (isCall ? "c" : "") + conv.id.replace(/-/g, "").slice(0, isCall ? 31 : 32) });
          sent++;
        } else if (s.kind === "apns") {
          if (!cfg.apns_key_p8 || !cfg.apns_key_id || !cfg.apns_team_id) return;
          const p = payloadFor(s.user_id) as Record<string, unknown>;
          const r = await sendApns(cfg, s, {
            title,
            body: String(p.body ?? body),
            thread: String(conv.id),
            isCall,
            data: { url: String(payload.url ?? "/"), ...(payload.conversation_id ? { conversation_id: String(payload.conversation_id) } : {}), call: isCall ? "1" : "0" },
          });
          if (r === "ok") sent++;
          else if (r === "dead") dead.push(s.id);
        } else if (s.kind === "fcm" && sa) {
          const token = await fcmAccessToken(sa);
          const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              message: {
                token: s.endpoint,
                notification: { title, body: filtered.hidePreview.has(s.user_id) ? String(hidden.body) : body },
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
