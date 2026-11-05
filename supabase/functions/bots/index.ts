// Nexus bots + incoming webhooks + community bots.
//  POST /functions/v1/bots?id=<webhook id>&token=<token>   chat webhook
//  POST /functions/v1/bots?bot=<community bot id>&token=<token>  community bot webhook
//  POST /functions/v1/bots  (signed in)  {action:"cmd", conversation_id, text}
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
const BOT = {
  nexus: "00000000-0000-4000-8000-00000000b001",
  orders: "00000000-0000-4000-8000-00000000b002",
  music: "00000000-0000-4000-8000-00000000b003",
  fun: "00000000-0000-4000-8000-00000000b004",
  trivia: "00000000-0000-4000-8000-00000000b005",
  spotify: "00000000-0000-4000-8000-00000000b006",
};

const TIERS = [
  ["⚡ Nexus Lighting Sub", "$3.99/mo", "animated profile, borders & themes, 100 MB uploads, ⚡ badge"],
  ["💎 Nexus Lighting Premium", "$5.99/mo", "+ Shield 360 (10 songs)"],
  ["🎵 Premium + Music Distribution", "$19.99/mo", "+ send releases to stores, smart links, Audia ISRC codes, Shield 25 songs"],
  ["🚀 Premium + Distribution Pro", "$49.99/mo", "+ unlimited Shield, ACRCloud sync, priority review"],
  ["🎬 Pro + Official Music Video Distribution", "$59.99/mo", "+ official music video distribution"],
];

const JOKES = [
  "Why did the producer bring a ladder to the studio? To take it to the next level.",
  "I told my DAW a joke about latency… it still hasn't responded.",
  "What's a pirate's favorite music notation? Arrrrpeggios.",
  "Why don't bassists play hide and seek? Because good luck finding them in the mix.",
  "I named my Wi‑Fi after my album so when people ask for the password I say \"stream it.\"",
  "How do you make a bandstand? Take away their chairs.",
];
const FACTS = [
  "A 3-minute song at 120 BPM has about 360 beats — that's a lot of head-nods.",
  "Spotify counts a stream after 30 seconds of play.",
  "The first ISRC codes were issued in 1986.",
  "Humans can hear roughly 20 Hz to 20 kHz — dogs go higher, whales go lower.",
  "The loudest audience roar at a concert was measured over 140 dB (wear earplugs).",
  "Vinyl's groove is a continuous spiral that can be over half a kilometer long on an LP.",
];

type TriviaQ = { q: string; a: string; hints: string[] };
const TRIVIA: TriviaQ[] = [
  { q: "What streaming service uses the green circle logo?", a: "spotify", hints: ["music app", "swedish"] },
  { q: "How many strings does a standard guitar have?", a: "6", hints: ["half a dozen"] },
  { q: "What does BPM stand for?", a: "beats per minute", hints: ["tempo"] },
  { q: "Which Beatles album features a zebra crossing on the cover?", a: "abbey road", hints: ["london street"] },
  { q: "What file format is most common for lossless audio downloads?", a: "flac", hints: ["not mp3"] },
  { q: "In music, what does EQ stand for?", a: "equalizer", hints: ["tone control"] },
  { q: "Which note is a half step above B?", a: "c", hints: ["no sharp between"] },
  { q: "What company owns YouTube Music?", a: "google", hints: ["alphabet"] },
];

const triviaState = new Map<string, { a: string; at: number }>();

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

// ---------------------------------------------------------------- Spotify (app token, same secrets as spotify function)
const SP_ID = Deno.env.get("SPOTIFY_CLIENT_ID") ?? "";
const SP_SECRET = Deno.env.get("SPOTIFY_CLIENT_SECRET") ?? "";
let spToken: { value: string; exp: number } | null = null;
async function spotifyToken() {
  if (!SP_ID || !SP_SECRET) return null;
  if (spToken && spToken.exp > Date.now() + 30_000) return spToken.value;
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { Authorization: "Basic " + btoa(`${SP_ID}:${SP_SECRET}`), "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) return null;
  const j = await res.json();
  spToken = { value: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return spToken.value;
}
async function spotifyGet(path: string) {
  const t = await spotifyToken();
  if (!t) return null;
  const res = await fetch(`https://api.spotify.com/v1${path}`, { headers: { Authorization: `Bearer ${t}` } });
  if (!res.ok) return null;
  return res.json();
}
function fmtTrack(t: any) {
  const artists = (t.artists ?? []).map((a: any) => a.name).join(", ");
  const url = t.external_urls?.spotify ?? `https://open.spotify.com/track/${t.id}`;
  const album = t.album?.name ? ` · ${t.album.name}` : "";
  return `🎵 **${t.name}** — ${artists}${album}\n${url}`;
}
function fmtAlbum(a: any) {
  const artists = (a.artists ?? []).map((x: any) => x.name).join(", ");
  const url = a.external_urls?.spotify ?? `https://open.spotify.com/album/${a.id}`;
  return `💿 **${a.name}** — ${artists} · ${a.release_date ?? ""}\n${url}`;
}
function fmtArtist(a: any) {
  const url = a.external_urls?.spotify ?? `https://open.spotify.com/artist/${a.id}`;
  const fans = a.followers?.total != null ? ` · ${a.followers.total.toLocaleString()} followers` : "";
  return `🎤 **${a.name}**${fans}\n${url}`;
}

async function searchSpotifyTracks(q: string, limit = 3) {
  const r = await spotifyGet(`/search?type=track&limit=${limit}&q=${encodeURIComponent(q)}`);
  return (r?.tracks?.items ?? []) as any[];
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

async function communityWebhook(req: Request, botId: string, token: string) {
  const { data: bot } = await admin.from("community_bots").select("*").eq("id", botId).maybeSingle();
  if (!bot || bot.webhook_token !== token) return json({ message: "Unknown bot webhook" }, 404);
  const b = await req.json().catch(() => ({}));
  const conv = String(b.conversation_id ?? "");
  if (!conv) return json({ message: "conversation_id required" }, 400);
  let text = typeof b.content === "string" ? b.content : "";
  text = text.trim().slice(0, 2000);
  if (!text) return json({ message: "Empty message" }, 400);
  await say(BOT.nexus, conv, text, bot.name);
  await admin.from("community_bots").update({ uses: (bot.uses ?? 0) + 1 }).eq("id", bot.id);
  return new Response(null, { status: 204, headers: cors });
}

async function tryCommunityCommand(conv: string, cmd: string, arg: string, userName: string) {
  const key = cmd.replace(/^\//, "").toLowerCase();
  // Prefer bots installed on this space; also allow owner's bots everywhere via public match
  const { data: convRow } = await admin.from("conversations").select("space_id, kind").eq("id", conv).maybeSingle();
  let bots: any[] = [];
  if (convRow?.space_id) {
    const { data: installs } = await admin.from("space_bot_installs").select("community_bot_id").eq("space_id", convRow.space_id).not("community_bot_id", "is", null);
    const ids = (installs ?? []).map((i: any) => i.community_bot_id).filter(Boolean);
    if (ids.length) {
      const { data } = await admin.from("community_bots").select("*").in("id", ids);
      bots = data ?? [];
    }
  }
  if (!bots.length) {
    // DMs / groups: match any public bot command (first match)
    const { data } = await admin.from("community_bots").select("*").eq("public", true).limit(80);
    bots = data ?? [];
  }
  for (const bot of bots) {
    const list = Array.isArray(bot.commands) ? bot.commands : [];
    for (const c of list) {
      const trigger = String(c?.cmd ?? c?.trigger ?? "").replace(/^\//, "").toLowerCase();
      if (!trigger || trigger !== key) continue;
      let reply = String(c?.reply ?? c?.response ?? "👋");
      reply = reply
        .replaceAll("{user}", userName)
        .replaceAll("{args}", arg)
        .replaceAll("{bot}", bot.name);
      await say(BOT.nexus, conv, reply, bot.name);
      await admin.from("community_bots").update({ uses: (bot.uses ?? 0) + 1 }).eq("id", bot.id);
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------- commands
async function command(req: Request, b: any) {
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: u } = await admin.auth.getUser(jwt);
  if (!u?.user) return json({ error: "Sign in first" }, 401);
  const conv = String(b.conversation_id ?? "");
  const text = String(b.text ?? "").trim();
  const asUser = createClient(URL_, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false } });
  const { data: member } = await asUser.rpc("is_conversation_member", { p_conv: conv });
  if (!member) return json({ error: "Not in this chat" }, 403);
  const [cmd, ...rest] = text.split(/\s+/);
  const arg = rest.join(" ").trim();
  const { data: meProf } = await admin.from("profiles").select("display_name, username").eq("id", u.user.id).maybeSingle();
  const userName = meProf?.display_name || meProf?.username || "friend";

  switch (cmd.toLowerCase()) {
    case "/help":
      await say(
        BOT.nexus,
        conv,
        [
          "🤖 **Nexus bots**",
          "Nexus — /roll 2d6 · /flip · /8ball · /choose a, b",
          "🎵 Music — /isrc · /song · /upc · /spotify query · /track",
          "🎧 Spotify — /spotify · /track · /album · /artist",
          "🎉 Fun — /joke · /fact · /rps rock · /rate thing · /ship a, b",
          "🧠 Trivia — /trivia · /answer …",
          "🧾 Orders — /premium · /orders",
          "Create your own bot → Bots panel · Invite to a server · Links at /b/<slug>",
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
    case "/joke":
      await say(BOT.fun, conv, `😄 ${JOKES[rand(JOKES.length)]}`);
      break;
    case "/fact":
      await say(BOT.fun, conv, `📌 ${FACTS[rand(FACTS.length)]}`);
      break;
    case "/rps": {
      const pick = arg.toLowerCase().replace(/[^a-z]/g, "");
      const map: Record<string, string> = { r: "rock", rock: "rock", p: "paper", paper: "paper", s: "scissors", scissors: "scissors" };
      const you = map[pick];
      if (!you) {
        await say(BOT.fun, conv, "✊ /rps rock|paper|scissors");
        break;
      }
      const opts = ["rock", "paper", "scissors"];
      const botPick = opts[rand(3)];
      const win = (you === "rock" && botPick === "scissors") || (you === "paper" && botPick === "rock") || (you === "scissors" && botPick === "paper");
      const draw = you === botPick;
      await say(BOT.fun, conv, `✊ You: **${you}** · Bot: **${botPick}** → ${draw ? "Draw!" : win ? "You win!" : "Bot wins!"}`);
      break;
    }
    case "/rate": {
      if (!arg) {
        await say(BOT.fun, conv, "⭐ Usage: /rate pineapple on pizza");
        break;
      }
      let h = 0;
      for (const ch of arg.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
      const score = (h % 11);
      await say(BOT.fun, conv, `⭐ “${arg.slice(0, 120)}” rates **${score}/10**`);
      break;
    }
    case "/ship": {
      const parts = arg.split(/[,&|/]+/).map((s) => s.trim()).filter(Boolean);
      if (parts.length < 2) {
        await say(BOT.fun, conv, "💘 Usage: /ship alice, bob");
        break;
      }
      const [a, b2] = parts;
      let h = 0;
      for (const ch of (a + b2).toLowerCase()) h = (h * 33 + ch.charCodeAt(0)) >>> 0;
      await say(BOT.fun, conv, `💘 **${a}** × **${b2}** = **${h % 101}%** compatible`);
      break;
    }
    case "/trivia": {
      const t = TRIVIA[rand(TRIVIA.length)];
      triviaState.set(conv, { a: t.a.toLowerCase(), at: Date.now() });
      await say(BOT.trivia, conv, `🧠 **Trivia**\n${t.q}\nReply with \`/answer …\` (hint: ${t.hints[0]})`);
      break;
    }
    case "/answer": {
      const st = triviaState.get(conv);
      if (!st || Date.now() - st.at > 5 * 60_000) {
        await say(BOT.trivia, conv, "🧠 No open trivia — start one with /trivia");
        break;
      }
      const guess = arg.toLowerCase().trim();
      if (!guess) {
        await say(BOT.trivia, conv, "🧠 Usage: /answer your guess");
        break;
      }
      if (guess === st.a || st.a.includes(guess) || guess.includes(st.a)) {
        triviaState.delete(conv);
        await say(BOT.trivia, conv, `✅ Correct, ${userName}! It was **${st.a}**.`);
      } else {
        await say(BOT.trivia, conv, `❌ Not quite — try again or /trivia for a new one.`);
      }
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
        await say(BOT.music, conv, "🎵 Usage: /song track name — or try /spotify for Spotify results");
        break;
      }
      const spTracks = await searchSpotifyTracks(arg, 3);
      if (spTracks.length) {
        await say(BOT.music, conv, spTracks.map(fmtTrack).join("\n\n"));
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
    case "/spotify":
    case "/track": {
      if (!arg) {
        await say(BOT.spotify, conv, "🎧 Usage: /spotify blinding lights · /track <name or open.spotify.com/track/…>");
        break;
      }
      const urlMatch = arg.match(/open\.spotify\.com\/(?:intl-[a-z-]+\/)?track\/([A-Za-z0-9]+)/) || arg.match(/spotify:track:([A-Za-z0-9]+)/);
      if (urlMatch) {
        const t = await spotifyGet(`/tracks/${urlMatch[1]}`);
        await say(BOT.spotify, conv, t ? fmtTrack(t) : "🎧 Track not found on Spotify");
        break;
      }
      const tracks = await searchSpotifyTracks(arg, 3);
      if (tracks.length) await say(BOT.spotify, conv, tracks.map(fmtTrack).join("\n\n"));
      else {
        const r = await getJson(`https://api.deezer.com/search?limit=3&q=${encodeURIComponent(arg)}`);
        const list = (r?.data ?? []) as any[];
        await say(
          BOT.spotify,
          conv,
          list.length
            ? `🎧 Spotify unavailable — Deezer results:\n${list.map((t) => `${t.title} — ${t.artist?.name}\n${t.link}`).join("\n")}`
            : `🎧 Nothing found for “${arg.slice(0, 80)}”`,
        );
      }
      break;
    }
    case "/album": {
      if (!arg) {
        await say(BOT.spotify, conv, "💿 Usage: /album album name");
        break;
      }
      const r = await spotifyGet(`/search?type=album&limit=3&q=${encodeURIComponent(arg)}`);
      const albums = (r?.albums?.items ?? []) as any[];
      await say(BOT.spotify, conv, albums.length ? albums.map(fmtAlbum).join("\n\n") : `💿 No albums for “${arg.slice(0, 80)}”`);
      break;
    }
    case "/artist": {
      if (!arg) {
        await say(BOT.spotify, conv, "🎤 Usage: /artist name");
        break;
      }
      const r = await spotifyGet(`/search?type=artist&limit=3&q=${encodeURIComponent(arg)}`);
      const artists = (r?.artists?.items ?? []) as any[];
      await say(BOT.spotify, conv, artists.length ? artists.map(fmtArtist).join("\n\n") : `🎤 No artists for “${arg.slice(0, 80)}”`);
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
    default: {
      const hit = await tryCommunityCommand(conv, cmd, arg, userName);
      if (!hit) return json({ ok: false, unknown: true });
      break;
    }
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
    const bot = u.searchParams.get("bot");
    if (bot && token) return await communityWebhook(req, bot, token);
    if (id && token) return await webhook(req, id, token);
    const b = await req.json().catch(() => ({}));
    if (b.action === "cmd") return await command(req, b);
    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
