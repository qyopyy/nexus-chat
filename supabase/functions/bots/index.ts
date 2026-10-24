// Nexus bots + incoming webhooks.
//  POST /functions/v1/bots?id=<webhook id>&token=<token>   {content, username?, embeds?}  → posts into that chat (Discord-compatible)
//  POST /functions/v1/bots  (signed in)  {action:"cmd", conversation_id, text:"/roll 2d6"} → a bot answers in the chat
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
const BOT = { nexus: "00000000-0000-4000-8000-00000000b001", orders: "00000000-0000-4000-8000-00000000b002", music: "00000000-0000-4000-8000-00000000b003" };

const TIERS = [
  ["⚡ Nexus Lighting Sub", "$3.99/mo", "animated profile, borders & themes, 100 MB uploads, ⚡ badge"],
  ["💎 Nexus Lighting Premium", "$5.99/mo", "+ Shield 360 (10 songs)"],
  ["🎵 Premium + Music Distribution", "$19.99/mo", "+ send releases to stores, smart links, Audia ISRC codes, Shield 25 songs"],
  ["🚀 Premium + Distribution Pro", "$49.99/mo", "+ unlimited Shield, ACRCloud sync, priority review"],
  ["🎬 Pro + Official Music Video Distribution", "$59.99/mo", "+ official music video distribution"],
];

async function say(bot: string, conv: string, text: string, name?: string) {
  const { error } = await admin.from("messages").insert({ conversation_id: conv, author_id: bot, content: text.slice(0, 4000), bot_name: name ?? null });
  if (error) throw new Error(error.message);
}
const rand = (n: number) => Math.floor(Math.random() * n);

async function getJson(url: string) {
  try {
    const r = await fetch(url);
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- webhooks
async function webhook(req: Request, id: string, token: string) {
  const { data: h } = await admin.from("chat_webhooks").select("*").eq("id", id).maybeSingle();
  if (!h || h.token !== token) return json({ message: "Unknown webhook" }, 404);
  const b = await req.json().catch(() => ({}));
  let text = typeof b.content === "string" ? b.content : "";
  for (const e of Array.isArray(b.embeds) ? b.embeds.slice(0, 5) : []) {
    const parts = [e?.title && `**${e.title}**`, e?.description, e?.url, ...(Array.isArray(e?.fields) ? e.fields.slice(0, 10).map((f: any) => `${f?.name}: ${f?.value}`) : [])].filter(Boolean);
    if (parts.length) text += (text ? "\n" : "") + parts.join("\n");
  }
  text = text.trim().slice(0, 2000);
  if (!text) return json({ message: "Empty message" }, 400);
  const name = String(b.username ?? h.name).slice(0, 80);
  await say(BOT.nexus, h.conversation_id, text, name);
  await admin.from("chat_webhooks").update({ uses: (h.uses ?? 0) + 1 }).eq("id", h.id);
  return new Response(null, { status: 204, headers: cors });
}

// ---------------------------------------------------------------- commands
async function command(req: Request, b: any) {
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: u } = await admin.auth.getUser(jwt);
  if (!u?.user) return json({ error: "Sign in first" }, 401);
  const conv = String(b.conversation_id ?? "");
  const text = String(b.text ?? "").trim();
  // act as the user for permission checks (membership, premium gates)
  const asUser = createClient(URL_, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false } });
  const { data: member } = await asUser.rpc("is_conversation_member", { p_conv: conv });
  if (!member) return json({ error: "Not in this chat" }, 403);
  const [cmd, ...rest] = text.split(/\s+/);
  const arg = rest.join(" ").trim();

  switch (cmd.toLowerCase()) {
    case "/help":
      await say(
        BOT.nexus,
        conv,
        [
          "🤖 **Nexus Bot** — commands",
          "/roll 2d6 · /flip · /8ball question · /choose a, b, c",
          "🎵 **Music Bot** — /isrc Title — Artist [x3] · /song name · /upc 123456789012",
          "🧾 **Order Bot** — /premium · /orders",
        ].join("\n"),
      );
      break;
    case "/roll": {
      const m = arg.match(/^(\d{1,2})?d(\d{1,4})$/i);
      const n = Math.min(20, Number(m?.[1] ?? 1)) || 1;
      const sides = Math.min(1000, Number(m?.[2] ?? 6)) || 6;
      const rolls = Array.from({ length: n }, () => 1 + rand(sides));
      await say(BOT.nexus, conv, `🎲 ${n}d${sides}: ${rolls.join(" + ")}${n > 1 ? ` = **${rolls.reduce((a, c) => a + c, 0)}**` : ""}`);
      break;
    }
    case "/flip":
      await say(BOT.nexus, conv, `🪙 ${Math.random() < 0.5 ? "Heads" : "Tails"}`);
      break;
    case "/8ball": {
      const a = ["Yes.", "No.", "Definitely.", "Ask again later.", "Without a doubt.", "Very doubtful.", "Signs point to yes.", "Don't count on it.", "Absolutely 🔥", "Not today."];
      await say(BOT.nexus, conv, `🎱 ${arg ? `“${arg.slice(0, 200)}” — ` : ""}${a[rand(a.length)]}`);
      break;
    }
    case "/choose": {
      const opts = arg.split(/[,|]/).map((s) => s.trim()).filter(Boolean);
      await say(BOT.nexus, conv, opts.length > 1 ? `🤔 I pick: **${opts[rand(opts.length)]}**` : "Give me options: /choose pizza, burger, sushi");
      break;
    }
    case "/isrc": {
      const many = arg.match(/\bx(\d{1,2})$/i);
      const count = Math.min(10, Number(many?.[1] ?? 1));
      const clean = arg.replace(/\bx\d{1,2}$/i, "").trim();
      const [title, artist] = clean.split(/\s+[—-]\s+/);
      const { data, error } = await asUser.rpc("generate_isrc", { p_title: title || null, p_artist: artist || null, p_count: count });
      if (error) await say(BOT.music, conv, `🎵 ${error.message}`);
      else await say(BOT.music, conv, `🎵 Audia ISRC${count > 1 ? "s" : ""}${title ? ` for “${title}”${artist ? ` — ${artist}` : ""}` : ""}:\n${(data as any[]).map((r) => r.code).join("\n")}`);
      break;
    }
    case "/song": {
      if (!arg) {
        await say(BOT.music, conv, "🎵 Usage: /song track name");
        break;
      }
      const r = await getJson(`https://api.deezer.com/search?limit=3&q=${encodeURIComponent(arg)}`);
      const list = (r?.data ?? []) as any[];
      await say(BOT.music, conv, list.length ? `🎵 ${list.map((t) => `${t.title} — ${t.artist?.name}\n${t.link}`).join("\n")}` : `🎵 Nothing found for “${arg.slice(0, 80)}”`);
      break;
    }
    case "/upc": {
      const code = arg.replace(/\D/g, "");
      const r = code ? await getJson(`https://api.deezer.com/album/upc:${code}`) : null;
      await say(BOT.music, conv, r?.title ? `💿 ${r.title} — ${r.artist?.name} · ${r.release_date ?? ""} · ${r.label ?? ""}\n${r.link}` : "💿 No album found for that UPC");
      break;
    }
    case "/premium":
      await say(BOT.orders, conv, ["💜 **Nexus Premium plans**", ...TIERS.map(([n, p, f]) => `${n} — ${p}\n   ${f}`), "Buy from Settings → Premium (or the Premium button in Music)."].join("\n"));
      break;
    case "/orders": {
      const { data } = await admin.from("premium_orders").select("id, tier, months, amount_usd, status").eq("user_id", u.user.id).order("created_at", { ascending: false }).limit(5);
      await say(BOT.orders, conv, data?.length ? `🧾 Your orders:\n${data.map((o) => `#${o.id} · ${o.tier} · ${o.months} mo · $${o.amount_usd} · ${o.status}`).join("\n")}` : "🧾 You have no orders yet — try /premium");
      break;
    }
    default:
      return json({ ok: false, unknown: true });
  }
  return json({ ok: true });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const u = new URL(req.url);
    const id = u.searchParams.get("id");
    const token = u.searchParams.get("token");
    if (id && token) return await webhook(req, id, token);
    const b = await req.json().catch(() => ({}));
    if (b.action === "cmd") return await command(req, b);
    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
