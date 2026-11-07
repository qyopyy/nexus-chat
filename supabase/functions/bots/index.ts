// Nexus bots + incoming webhooks + community bots.
//  POST /functions/v1/bots?id=<webhook id>&token=<token>   chat webhook
//  POST /functions/v1/bots?bot=<community bot id>&token=<token>  community bot webhook
//  POST /functions/v1/bots  (signed in)  {action:"cmd", conversation_id, text}
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.119.0";

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
  utility: "00000000-0000-4000-8000-00000000b007",
  games: "00000000-0000-4000-8000-00000000b008",
  stats: "00000000-0000-4000-8000-00000000b009",
};

const TIERS = [
  ["⚡ Nexus Lighting Sub", "$3.99/mo", "⚡ badge, animated profile, 5 GB uploads, original-quality media, HD/Studio voice, 1080p60 camera, 8,000-char messages"],
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
  "My synth and I broke up. It said I was too controlling — I just wanted to change its filter.",
  "Why was the music teacher locked out? The keys were on the piano.",
  "What do you call a cow that plays an instrument? A moo-sician.",
  "I asked the drummer for the time. He said: 1, 2, 3, 4…",
  "Why did the singer go to the bank? To check their balance-d mix.",
  "What's an 808's favourite snack? Sub-marine sandwiches.",
  "How many producers does it take to change a lightbulb? One, but they'll need 47 versions of it.",
  "My mixing engineer said my vocals were too dry, so I sang in the shower.",
];
const FACTS = [
  "A 3-minute song at 120 BPM has about 360 beats — that's a lot of head-nods.",
  "Spotify counts a stream after 30 seconds of play.",
  "The first ISRC codes were issued in 1986.",
  "Humans can hear roughly 20 Hz to 20 kHz — dogs go higher, whales go lower.",
  "The loudest audience roar at a concert was measured over 140 dB (wear earplugs).",
  "Vinyl's groove is a continuous spiral that can be over half a kilometer long on an LP.",
  "The world's longest concert started in 2001 in a German church and is scheduled to end in 2640.",
  "Standard concert pitch puts the A above middle C at 440 Hz.",
  "The Roland TR-808 drum machine first came out in 1980.",
  "A typical pop song is mastered for streaming at around −14 LUFS.",
  "Most of the world's music is in 4/4 time — that's why it's called common time.",
  "MP3 was developed largely at the Fraunhofer Institute in Germany.",
  "Your heart tends to sync slightly to the tempo of the music you listen to.",
  "Mozart wrote his first symphony at around age 8.",
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
  { q: "How many keys does a standard piano have?", a: "88", hints: ["more than 80"] },
  { q: "What does DAW stand for?", a: "digital audio workstation", hints: ["software studio"] },
  { q: "Which instrument has 4 strings and is usually played with a bow, smaller than a cello?", a: "viola", hints: ["violin's bigger sibling"] },
  { q: "What is the Italian word for 'very loud'?", a: "fortissimo", hints: ["ff"] },
  { q: "Which drum machine number is famous in trap and hip-hop?", a: "808", hints: ["Roland TR-…"] },
  { q: "How many lines are on a musical staff?", a: "5", hints: ["a hand's worth"] },
  { q: "What is the term for the speed of a piece of music?", a: "tempo", hints: ["measured in BPM"] },
  { q: "Which code identifies a single recording: ISRC or UPC?", a: "isrc", hints: ["recording"] },
  { q: "What is the planet closest to the sun?", a: "mercury", hints: ["also a singer's name"] },
  { q: "What is the capital of Hungary?", a: "budapest", hints: ["on the Danube"] },
  { q: "How many players are on a football (soccer) team on the field?", a: "11", hints: ["more than 10"] },
  { q: "What gas do plants absorb from the air?", a: "carbon dioxide", hints: ["CO₂"] },
];

const WYR = [
  "only listen to one album forever **or** never hear the same song twice?",
  "have perfect pitch **or** perfect rhythm?",
  "headline a festival once **or** have a song go viral every year?",
  "be able to talk to animals **or** speak every language?",
  "live without music **or** without movies?",
  "always have to sing instead of talk **or** dance everywhere you walk?",
  "time travel to the past **or** the future?",
  "have unlimited Wi‑Fi everywhere **or** unlimited snacks?",
];
const TRUTHS = [
  "What's the last song you had on repeat?",
  "What's an app you use way too much?",
  "What's your most embarrassing music taste?",
  "Who was your first celebrity crush?",
  "What's the weirdest food combo you secretly love?",
  "What's a skill you wish you had?",
];
const DARES = [
  "Send the 5th photo in your gallery (if it's safe for this chat).",
  "Type your next message with your eyes closed.",
  "Change your status to something only emojis for 1 hour.",
  "Send a voice message singing the chorus of any song.",
  "Use only CAPS LOCK for the next 3 messages.",
  "Tell the chat your current screen time.",
];
const RIDDLES: { q: string; a: string }[] = [
  { q: "I have keys but open no locks. I have space but no room. You can enter, but can't go outside. What am I?", a: "a keyboard" },
  { q: "What has hands but can't clap?", a: "a clock" },
  { q: "The more you take, the more you leave behind. What are they?", a: "footsteps" },
  { q: "What can travel around the world while staying in a corner?", a: "a stamp" },
  { q: "What has a neck but no head?", a: "a bottle (or a guitar)" },
  { q: "What gets wetter the more it dries?", a: "a towel" },
];
const CITY_TZ: Record<string, string> = {
  budapest: "Europe/Budapest", london: "Europe/London", paris: "Europe/Paris", berlin: "Europe/Berlin", vienna: "Europe/Vienna",
  "new york": "America/New_York", nyc: "America/New_York", "los angeles": "America/Los_Angeles", la: "America/Los_Angeles",
  chicago: "America/Chicago", miami: "America/New_York", toronto: "America/Toronto", tokyo: "Asia/Tokyo", seoul: "Asia/Seoul",
  dubai: "Asia/Dubai", sydney: "Australia/Sydney", "sao paulo": "America/Sao_Paulo", mexico: "America/Mexico_City", lagos: "Africa/Lagos",
  istanbul: "Europe/Istanbul", moscow: "Europe/Moscow", delhi: "Asia/Kolkata", mumbai: "Asia/Kolkata", singapore: "Asia/Singapore", wilmington: "America/New_York",
};

// per-chat game state (trivia, number guess, riddles) — stored in Postgres so every edge instance sees it
async function getState(conv: string, kind: string) {
  const { data } = await admin.from("bot_state").select("data, updated_at").eq("conversation_id", conv).eq("kind", kind).maybeSingle();
  if (!data) return null;
  if (Date.now() - new Date(data.updated_at).getTime() > 30 * 60_000) return null;
  return data.data as any;
}
async function setState(conv: string, kind: string, value: unknown | null) {
  if (value == null) await admin.from("bot_state").delete().eq("conversation_id", conv).eq("kind", kind);
  else await admin.from("bot_state").upsert({ conversation_id: conv, kind, data: value, updated_at: new Date().toISOString() });
}

/** tiny safe calculator: + − × ÷ ^ % ( ) sqrt pi e */
function calc(expr: string): number | null {
  const src = expr.toLowerCase().replace(/×/g, "*").replace(/÷/g, "/").replace(/,/g, ".").replace(/\s+/g, "");
  if (!/^[0-9+\-*/^%().a-z]*$/.test(src) || src.length > 120) return null;
  let i = 0;
  const peek = () => src[i];
  const num = (): number => {
    if (peek() === "(") {
      i++;
      const v = add();
      if (peek() !== ")") throw 0;
      i++;
      return v;
    }
    if (src.startsWith("sqrt", i)) {
      i += 4;
      return Math.sqrt(num());
    }
    if (src.startsWith("pi", i)) {
      i += 2;
      return Math.PI;
    }
    if (peek() === "e") {
      i++;
      return Math.E;
    }
    if (peek() === "-") {
      i++;
      return -num();
    }
    const m = /^\d+(\.\d+)?/.exec(src.slice(i));
    if (!m) throw 0;
    i += m[0].length;
    return Number(m[0]);
  };
  const pow = (): number => {
    const b = num();
    if (peek() === "^") {
      i++;
      return Math.pow(b, pow());
    }
    return b;
  };
  const mul = (): number => {
    let v = pow();
    while (peek() === "*" || peek() === "/" || peek() === "%") {
      const op = src[i++];
      const r = pow();
      v = op === "*" ? v * r : op === "/" ? v / r : v % r;
    }
    return v;
  };
  const add = (): number => {
    let v = mul();
    while (peek() === "+" || peek() === "-") {
      const op = src[i++];
      const r = mul();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  };
  try {
    const v = add();
    return i === src.length && Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}
const WMO: Record<number, string> = { 0: "☀️ clear", 1: "🌤️ mostly clear", 2: "⛅ partly cloudy", 3: "☁️ cloudy", 45: "🌫️ fog", 48: "🌫️ fog", 51: "🌦️ drizzle", 53: "🌦️ drizzle", 55: "🌧️ drizzle", 61: "🌧️ rain", 63: "🌧️ rain", 65: "🌧️ heavy rain", 71: "🌨️ snow", 73: "🌨️ snow", 75: "❄️ heavy snow", 80: "🌦️ showers", 81: "🌧️ showers", 82: "⛈️ heavy showers", 95: "⛈️ thunderstorm", 96: "⛈️ thunderstorm", 99: "⛈️ thunderstorm" };

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
    case "/bots":
      await say(
        BOT.nexus,
        conv,
        [
          "🤖 **Nexus bots** — type any command in a chat",
          "🎲 Nexus — /roll 2d6 · /flip · /8ball question · /choose a, b",
          "🛠️ Utility — /calc 12*(3+4) · /time tokyo · /weather budapest · /define word · /remind 10m text · /qr link",
          "🎮 Games — /guess · /wyr · /truth · /dare · /riddle · /reveal · /slots",
          "📊 Stats — /stats · /top · /userinfo @name",
          "🎵 Music — /isrc · /song · /upc · /newreleases · /follow artist · /following · /unfollow artist",
          "🎧 Spotify — /spotify · /track · /album · /artist",
          "🎉 Fun — /joke · /fact · /rps rock · /rate thing · /ship a, b",
          "🧠 Trivia — /trivia · /answer …",
          "🧾 Orders — /premium · /orders",
          "Make your own bot in the Bots panel.",
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
      await setState(conv, "trivia", { a: t.a.toLowerCase() });
      await say(BOT.trivia, conv, `🧠 **Trivia**\n${t.q}\nReply with \`/answer …\` (hint: ${t.hints[0]})`);
      break;
    }
    case "/answer": {
      const st = await getState(conv, "trivia");
      if (!st) {
        await say(BOT.trivia, conv, "🧠 No open trivia — start one with /trivia");
        break;
      }
      const guess = arg.toLowerCase().trim();
      if (!guess) {
        await say(BOT.trivia, conv, "🧠 Usage: /answer your guess");
        break;
      }
      if (guess === st.a || (guess.length > 2 && (st.a.includes(guess) || guess.includes(st.a)))) {
        await setState(conv, "trivia", null);
        await say(BOT.trivia, conv, `✅ Correct, ${userName}! It was **${st.a}**. /trivia for another`);
      } else {
        await say(BOT.trivia, conv, `❌ Not quite — try again or /trivia for a new one.`);
      }
      break;
    }
    // ───────────── Utility Bot
    case "/calc":
    case "/math": {
      const v = arg ? calc(arg) : null;
      await say(BOT.utility, conv, v == null ? "🧮 Usage: /calc 12*(3+4) — supports + − × ÷ ^ % sqrt pi" : `🧮 ${arg.slice(0, 80)} = **${Number(v.toPrecision(12)).toLocaleString("en-US", { maximumFractionDigits: 10 })}**`);
      break;
    }
    case "/time": {
      const key = arg.toLowerCase().trim();
      const tz = CITY_TZ[key] ?? (arg.includes("/") ? arg.trim() : "UTC");
      try {
        const t = new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" }).format(new Date());
        await say(BOT.utility, conv, `🕐 ${arg ? arg.slice(0, 40) : "UTC"} — **${t}** (${tz})`);
      } catch {
        await say(BOT.utility, conv, "🕐 Usage: /time tokyo · /time Europe/Budapest");
      }
      break;
    }
    case "/weather": {
      if (!arg) {
        await say(BOT.utility, conv, "🌤️ Usage: /weather budapest");
        break;
      }
      const g = await getJson(`https://geocoding-api.open-meteo.com/v1/search?count=1&name=${encodeURIComponent(arg.slice(0, 60))}`);
      const place = g?.results?.[0];
      if (!place) {
        await say(BOT.utility, conv, `🌤️ Couldn't find “${arg.slice(0, 60)}”`);
        break;
      }
      const w = await getJson(`https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`);
      const c = w?.current;
      if (!c) {
        await say(BOT.utility, conv, "🌤️ Weather is unavailable right now");
        break;
      }
      await say(BOT.utility, conv, `${WMO[c.weather_code] ?? "🌡️"} **${place.name}${place.country ? `, ${place.country}` : ""}** — ${Math.round(c.temperature_2m)}°C (feels ${Math.round(c.apparent_temperature)}°C) · wind ${Math.round(c.wind_speed_10m)} km/h · today ${Math.round(w.daily?.temperature_2m_min?.[0])}–${Math.round(w.daily?.temperature_2m_max?.[0])}°C`);
      break;
    }
    case "/define": {
      const word = arg.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z'-]/g, "");
      if (!word) {
        await say(BOT.utility, conv, "📖 Usage: /define serendipity");
        break;
      }
      const d = await getJson(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
      const m = Array.isArray(d) ? d[0]?.meanings?.slice(0, 2) : null;
      await say(BOT.utility, conv, m?.length ? `📖 **${word}**\n${m.map((x: any) => `_${x.partOfSpeech}_ — ${x.definitions?.[0]?.definition ?? ""}`).join("\n")}` : `📖 No definition found for “${word}”`);
      break;
    }
    case "/remind": {
      const m = arg.match(/^(\d{1,4})\s*(m|min|mins|h|hr|hrs|d|day|days)\s+(.+)$/i);
      if (!m) {
        await say(BOT.utility, conv, "⏰ Usage: /remind 10m take a break · /remind 2h call mom · /remind 1d release day");
        break;
      }
      const n = Number(m[1]);
      const unit = m[2].toLowerCase()[0];
      const mins = unit === "m" ? n : unit === "h" ? n * 60 : n * 1440;
      if (mins < 1 || mins > 90 * 1440) {
        await say(BOT.utility, conv, "⏰ Pick between 1 minute and 90 days");
        break;
      }
      const sendAt = new Date(Date.now() + mins * 60_000);
      const { error } = await admin.from("scheduled_messages").insert({ conversation_id: conv, author_id: u.user.id, content: `⏰ Reminder: ${m[3].slice(0, 500)}`, send_at: sendAt.toISOString() });
      await say(BOT.utility, conv, error ? `⏰ ${error.message}` : `⏰ Got it, ${userName} — I'll post your reminder ${mins < 60 ? `in ${mins} min` : mins < 1440 ? `in ${Math.round(mins / 60)} h` : `in ${Math.round(mins / 1440)} days`}.`);
      break;
    }
    case "/qr": {
      if (!arg) {
        await say(BOT.utility, conv, "▣ Usage: /qr https://nexusproject.cc");
        break;
      }
      await say(BOT.utility, conv, `▣ QR code for “${arg.slice(0, 80)}”\nhttps://api.qrserver.com/v1/create-qr-code/?size=480x480&data=${encodeURIComponent(arg.slice(0, 500))}`);
      break;
    }
    // ───────────── Game Bot
    case "/guess": {
      const st = await getState(conv, "guess");
      const n = Number(arg);
      if (!st || !arg) {
        if (!st) await setState(conv, "guess", { n: 1 + rand(100), tries: 0 });
        await say(BOT.games, conv, st ? "🔢 Guess a number: /guess 42" : "🔢 I picked a number between **1 and 100**. Guess it: /guess 50");
        break;
      }
      if (!Number.isFinite(n)) {
        await say(BOT.games, conv, "🔢 Send a number: /guess 50");
        break;
      }
      const tries = st.tries + 1;
      if (n === st.n) {
        await setState(conv, "guess", null);
        await say(BOT.games, conv, `🎉 **${userName}** got it — **${st.n}** in ${tries} ${tries === 1 ? "try" : "tries"}!`);
      } else {
        await setState(conv, "guess", { n: st.n, tries });
        await say(BOT.games, conv, `🔢 ${n} is too **${n < st.n ? "low" : "high"}** (${tries} ${tries === 1 ? "try" : "tries"})`);
      }
      break;
    }
    case "/wyr":
      await say(BOT.games, conv, `🤔 Would you rather ${WYR[rand(WYR.length)]}`);
      break;
    case "/truth":
      await say(BOT.games, conv, `🫣 Truth for ${userName}: ${TRUTHS[rand(TRUTHS.length)]}`);
      break;
    case "/dare":
      await say(BOT.games, conv, `😈 Dare for ${userName}: ${DARES[rand(DARES.length)]}`);
      break;
    case "/riddle": {
      const r = RIDDLES[rand(RIDDLES.length)];
      await setState(conv, "riddle", { a: r.a });
      await say(BOT.games, conv, `🧩 ${r.q}\nType /reveal for the answer.`);
      break;
    }
    case "/reveal": {
      const st = await getState(conv, "riddle");
      await setState(conv, "riddle", null);
      await say(BOT.games, conv, st ? `🧩 The answer: **${st.a}**` : "🧩 No riddle open — try /riddle");
      break;
    }
    case "/slots": {
      const reels = ["🍒", "🍋", "🔔", "⭐", "💎", "7️⃣"];
      const r = [0, 1, 2].map(() => reels[rand(reels.length)]);
      const win = r[0] === r[1] && r[1] === r[2] ? "🎉 JACKPOT!" : r[0] === r[1] || r[1] === r[2] || r[0] === r[2] ? "✨ Two of a kind!" : "😅 No luck — spin again";
      await say(BOT.games, conv, `🎰 [ ${r.join(" | ")} ] ${win}`);
      break;
    }
    // ───────────── Stats Bot
    case "/stats": {
      const since = new Date(Date.now() - 86400_000).toISOString();
      const [{ count: total }, { count: today }, { count: members }] = await Promise.all([
        admin.from("messages").select("id", { count: "exact", head: true }).eq("conversation_id", conv).is("deleted_at", null),
        admin.from("messages").select("id", { count: "exact", head: true }).eq("conversation_id", conv).is("deleted_at", null).gte("created_at", since),
        admin.from("conversation_members").select("user_id", { count: "exact", head: true }).eq("conversation_id", conv),
      ]);
      await say(BOT.stats, conv, `📊 **This chat** — ${(total ?? 0).toLocaleString()} messages · ${(today ?? 0).toLocaleString()} in the last 24 h · ${(members ?? 0).toLocaleString()} members${members ? "" : " (server channel)"}`);
      break;
    }
    case "/top": {
      const { data } = await admin.from("messages").select("author_id").eq("conversation_id", conv).is("deleted_at", null).gte("created_at", new Date(Date.now() - 7 * 86400_000).toISOString()).limit(5000);
      const counts = new Map<string, number>();
      for (const r of (data ?? []) as { author_id: string }[]) if (!Object.values(BOT).includes(r.author_id)) counts.set(r.author_id, (counts.get(r.author_id) ?? 0) + 1);
      const top = [...counts.entries()].sort((x, y) => y[1] - x[1]).slice(0, 5);
      if (!top.length) {
        await say(BOT.stats, conv, "📊 Nobody has chatted here this week yet");
        break;
      }
      const { data: ps } = await admin.from("profiles").select("id, display_name, username").in("id", top.map((t) => t[0]));
      const name = (id: string) => ps?.find((p: any) => p.id === id)?.display_name ?? "someone";
      await say(BOT.stats, conv, `🏆 **Top chatters this week**\n${top.map(([id, n], i) => `${["🥇", "🥈", "🥉", "4.", "5."][i]} ${name(id)} — ${n.toLocaleString()}`).join("\n")}`);
      break;
    }
    case "/userinfo": {
      const uname = (arg.replace(/^@/, "").trim() || meProf?.username || "").toLowerCase();
      const { data: p } = await admin.from("profiles").select("display_name, username, created_at, member_no, is_bot").eq("username", uname).maybeSingle();
      await say(BOT.stats, conv, p ? `🪪 **${p.display_name ?? p.username}** @${p.username}${p.is_bot ? " · 🤖 bot" : ""}${p.member_no != null ? ` · member #${p.member_no}` : ""} · joined ${new Date(p.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : `🪪 No user @${uname}`);
      break;
    }
    // ───────────── Music Bot — release alerts
    case "/newreleases": {
      const r = await spotifyGet(`/search?type=album&limit=5&q=${encodeURIComponent("tag:new")}`);
      const albums = (r?.albums?.items ?? []) as any[];
      await say(BOT.music, conv, albums.length ? `🆕 **New on Spotify**\n\n${albums.map(fmtAlbum).join("\n\n")}` : "🆕 New releases are unavailable right now");
      break;
    }
    case "/follow": {
      if (!arg) {
        await say(BOT.music, conv, "🔔 Usage: /follow artist name — I'll DM you when they drop something new");
        break;
      }
      const r = await spotifyGet(`/search?type=artist&limit=1&q=${encodeURIComponent(arg)}`);
      const a = r?.artists?.items?.[0];
      if (!a) {
        await say(BOT.music, conv, `🔔 No artist found for “${arg.slice(0, 60)}”`);
        break;
      }
      const { error } = await admin.from("artist_watch").upsert({ user_id: u.user.id, spotify_id: a.id, name: String(a.name).slice(0, 120), image_url: a.images?.[0]?.url ?? null, active: true, notify: true }, { onConflict: "user_id,spotify_id" });
      await say(BOT.music, conv, error ? `🔔 ${error.message}` : `🔔 ${userName}, you're following **${a.name}** — Nexus Bot will message you when they release something new.`);
      break;
    }
    case "/unfollow": {
      const { data: rows } = await admin.from("artist_watch").select("spotify_id, name").eq("user_id", u.user.id).eq("active", true);
      const hit = (rows ?? []).find((r: any) => r.name.toLowerCase() === arg.toLowerCase().trim()) ?? (rows ?? []).find((r: any) => r.name.toLowerCase().includes(arg.toLowerCase().trim()) && arg.trim());
      if (!hit) {
        await say(BOT.music, conv, "🔕 Usage: /unfollow artist name — see /following");
        break;
      }
      await admin.from("artist_watch").update({ active: false }).eq("user_id", u.user.id).eq("spotify_id", hit.spotify_id);
      await say(BOT.music, conv, `🔕 Unfollowed **${hit.name}**`);
      break;
    }
    case "/following": {
      const { data: rows } = await admin.from("artist_watch").select("name, notify").eq("user_id", u.user.id).eq("active", true).order("created_at", { ascending: false }).limit(50);
      await say(BOT.music, conv, rows?.length ? `🔔 **${userName} follows**\n${rows.map((r: any) => `${r.notify ? "🔔" : "🔕"} ${r.name}`).join("\n")}` : "🔔 You're not following anyone yet — /follow artist name");
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
