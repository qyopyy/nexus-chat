export type PublicBotPage = {
  slug: string;
  name: string;
  description: string;
  color: string;
  kind: "system" | "community";
  commands: string[];
};

const SYSTEM: PublicBotPage[] = [
  { kind: "system", slug: "nexusbot", name: "Nexus Bot", description: "Dice, flips, 8-ball, and choose-one helpers for every chat.", color: "#5865F2", commands: ["/help", "/roll", "/flip", "/8ball", "/choose"] },
  { kind: "system", slug: "utilitybot", name: "Utility Bot", description: "Calculator, world clock, weather, dictionary, reminders and QR codes.", color: "#00A8FC", commands: ["/calc", "/time", "/weather", "/define", "/remind", "/qr"] },
  { kind: "system", slug: "gamebot", name: "Game Bot", description: "Number guessing, would-you-rather, truth or dare, riddles and slots.", color: "#F23F43", commands: ["/guess", "/wyr", "/truth", "/dare", "/riddle", "/reveal", "/slots"] },
  { kind: "system", slug: "statsbot", name: "Stats Bot", description: "Message counts, top chatters this week and user info.", color: "#FAA61A", commands: ["/stats", "/top", "/userinfo"] },
  { kind: "system", slug: "musicbot", name: "Music Bot", description: "Audia ISRCs, track lookup, UPC — Spotify-first with Deezer fallback.", color: "#EB459E", commands: ["/isrc", "/song", "/upc", "/spotify", "/track"] },
  { kind: "system", slug: "spotifybot", name: "Spotify Bot", description: "Search Spotify tracks, albums, and artists with open.spotify.com links.", color: "#1DB954", commands: ["/spotify", "/track", "/album", "/artist"] },
  { kind: "system", slug: "funbot", name: "Fun Bot", description: "Jokes, facts, rock-paper-scissors, rates, and ship percentages.", color: "#FEE75C", commands: ["/joke", "/fact", "/rps", "/rate", "/ship"] },
  { kind: "system", slug: "triviabot", name: "Trivia Bot", description: "Quick music & culture trivia rounds. /trivia then /answer.", color: "#57F287", commands: ["/trivia", "/answer"] },
  { kind: "system", slug: "orderbot", name: "Order Bot", description: "Premium plans and your order receipts.", color: "#3BA55D", commands: ["/premium", "/orders"] },
];

export function renderBotPage(bot: PublicBotPage, base: string) {
  const invite = `${base}/?addbot=${encodeURIComponent(bot.slug)}`;
  const link = `${base}/b/${bot.slug}`;
  const cmds = bot.commands
    .map((c) => `<code style="display:inline-block;margin:2px 4px 2px 0;padding:2px 8px;border-radius:8px;background:#111827;font-size:13px">${escapeHtml(c)}</code>`)
    .join("");
  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${escapeHtml(bot.name)} · Nexus Bot</title>
<meta name="description" content="${escapeHtml(bot.description)}"/>
<meta property="og:title" content="${escapeHtml(bot.name)}"/>
<meta property="og:description" content="${escapeHtml(bot.description)}"/>
<meta property="og:url" content="${link}"/>
<link rel="icon" href="/icon-192.png"/>
<style>
body{margin:0;font-family:ui-sans-serif,system-ui,sans-serif;background:#0b0d12;color:#f4f4f5;min-height:100vh;display:grid;place-items:center;padding:24px}
.card{width:100%;max-width:440px;border-radius:28px;padding:28px;background:linear-gradient(160deg,${bot.color}33,#151821 55%);border:1px solid #ffffff14;box-shadow:0 24px 80px #0008}
.badge{display:inline-block;font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;opacity:.7;margin-bottom:10px}
h1{margin:0 0 8px;font-size:28px}
p{margin:0 0 18px;color:#a1a1aa;line-height:1.45}
.avatar{width:72px;height:72px;border-radius:22px;display:grid;place-items:center;font-size:34px;background:${bot.color};margin-bottom:16px;box-shadow:0 10px 30px ${bot.color}55}
.actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:22px}
a.btn{display:inline-flex;align-items:center;justify-content:center;border-radius:999px;padding:12px 18px;font-weight:700;text-decoration:none;color:#fff;background:${bot.color}}
a.ghost{background:#ffffff12;color:#e4e4e7}
footer{margin-top:18px;font-size:12px;color:#71717a}
</style></head><body><main class="card">
<div class="avatar">🤖</div>
<div class="badge">${bot.kind === "system" ? "Official bot" : "Community bot"}</div>
<h1>${escapeHtml(bot.name)}</h1>
<p>${escapeHtml(bot.description)}</p>
<div>${cmds || "<span style=color:#71717a>No public commands listed</span>"}</div>
<div class="actions">
  <a class="btn" href="${invite}">Add to server</a>
  <a class="ghost btn" href="${base}/">Open Nexus</a>
</div>
<footer>Share this page: ${escapeHtml(link)}</footer>
</main></body></html>`;
}

export function botNotFound(slug: string, base: string) {
  return `<!doctype html><html><head><meta charset="utf-8"/><title>Bot not found</title>
<style>body{margin:0;background:#0b0d12;color:#fff;font-family:system-ui;display:grid;place-items:center;min-height:100vh}</style>
</head><body><div><h1>Bot not found</h1><p>No bot named “${escapeHtml(slug)}”.</p><p><a href="${base}/" style="color:#7c9cff">Back to Nexus</a></p></div></body></html>`;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function systemBotPage(slug: string): PublicBotPage | null {
  const key = slug.toLowerCase();
  return SYSTEM.find((x) => x.slug === key || x.slug.replace("bot", "") === key) ?? null;
}
