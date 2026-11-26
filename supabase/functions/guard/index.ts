// Nexus Guard — link & domain safety scanner + 24/7 watchlist.
//   public:   {action:"scan", url}                      → verdict (no account needed)
//   pg_cron:  {action:"scan_all"} with x-push-secret    → re-scans every watched link, alerts via Nexus Bot
// Reputation comes from public DNS filters (Cloudflare Security, Quad9 = malware/phishing; AdGuard = ads/trackers)
// plus URL heuristics. It is a link shield, not a device antivirus.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.119.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-push-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const NEXUS_BOT = "00000000-0000-4000-8000-00000000b001";

const SHORTENERS = new Set(["bit.ly", "tinyurl.com", "t.co", "goo.gl", "is.gd", "cutt.ly", "rb.gy", "ow.ly", "shorturl.at", "t.ly", "buff.ly", "lnkd.in", "s.id", "tiny.cc", "rebrand.ly", "bl.ink", "v.gd"]);
const BAD_TLDS = new Set(["zip", "mov", "top", "xyz", "click", "country", "gq", "tk", "ml", "cf", "ga", "work", "support", "rest", "icu", "cyou", "buzz", "monster", "cfd", "sbs", "lol", "quest"]);
const BRANDS: Record<string, string[]> = {
  paypal: ["paypal.com"], apple: ["apple.com", "icloud.com"], icloud: ["icloud.com", "apple.com"], google: ["google.com", "gmail.com", "youtube.com"],
  microsoft: ["microsoft.com", "live.com", "office.com"], netflix: ["netflix.com"], instagram: ["instagram.com"], facebook: ["facebook.com"],
  spotify: ["spotify.com"], whatsapp: ["whatsapp.com"], telegram: ["telegram.org", "t.me"], discord: ["discord.com", "discord.gg"],
  tiktok: ["tiktok.com"], amazon: ["amazon.com"], coinbase: ["coinbase.com"], binance: ["binance.com"], metamask: ["metamask.io"],
  revolut: ["revolut.com"], wise: ["wise.com"], nexusproject: ["nexusproject.cc"],
};
const RISKY_EXT = /\.(apk|exe|msi|scr|bat|cmd|dmg|pkg|jar|ps1|vbs|iso|lnk|mobileconfig|crx|appimage|deb|rpm)$/i;
const BAIT = /(login|log-in|signin|verify|secure|account|update|wallet|airdrop|giveaway|free-?(gift|nitro|robux|vbucks)|claim|recover|unlock|suspend)/i;

type Reason = { level: "info" | "warn" | "bad"; text: string };
type Verdict = {
  url: string; final_url: string; host: string; verdict: "safe" | "suspicious" | "danger"; score: number;
  tracker: boolean; blocked_by: string[]; hops: string[]; reasons: Reason[]; scanned_at: string;
};

const baseDomain = (h: string) => h.split(".").slice(-2).join(".");
const publicHost = (h: string) =>
  /^[a-z0-9.-]+$/i.test(h) && h.includes(".") && !/\.(local|internal|lan|home|localhost|corp)$/i.test(h) && !/^\d+(\.\d+){3}$/.test(h);

async function dohJson(endpoint: string, name: string) {
  try {
    const r = await fetch(`${endpoint}${endpoint.includes("?") ? "&" : "?"}name=${encodeURIComponent(name)}&type=A`, {
      headers: { accept: "application/dns-json" }, signal: AbortSignal.timeout(4500),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const answers: string[] = (j.Answer ?? []).filter((a: any) => a.type === 1).map((a: any) => String(a.data));
    return { status: Number(j.Status), answers };
  } catch {
    return null;
  }
}
const sinkholed = (r: { status: number; answers: string[] } | null) =>
  !!r && r.status === 0 && r.answers.length > 0 && r.answers.every((a) => a === "0.0.0.0" || a === "::" || a.startsWith("0."));

async function reputation(host: string) {
  const [plain, cf, q9, ag] = await Promise.all([
    dohJson("https://cloudflare-dns.com/dns-query", host),
    dohJson("https://security.cloudflare-dns.com/dns-query", host),
    dohJson("https://dns.quad9.net:5053/dns-query", host),
    dohJson("https://dns.adguard-dns.com/resolve", host),
  ]);
  const resolves = !!plain && plain.status === 0 && plain.answers.length > 0;
  const blocked: string[] = [];
  if (sinkholed(cf) && !sinkholed(plain)) blocked.push("Cloudflare Security");
  if (resolves && q9 && q9.status === 3) blocked.push("Quad9");
  const tracker = sinkholed(ag) && !sinkholed(plain);
  return { resolves, blocked, tracker, plainOk: !!plain };
}

async function followRedirects(start: URL) {
  const hops: string[] = [];
  let cur = start;
  for (let i = 0; i < 5; i++) {
    if (!SHORTENERS.has(cur.hostname.replace(/^www\./, ""))) break;
    try {
      const r = await fetch(cur, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(4500), headers: { "User-Agent": "NexusGuard/1.0 (+https://nexusproject.cc)" } });
      const loc = r.headers.get("location");
      if (!loc || r.status < 300 || r.status > 399) break;
      const next = new URL(loc, cur);
      if (!/^https?:$/.test(next.protocol) || !publicHost(next.hostname) || (next.port && !["80", "443"].includes(next.port))) break;
      hops.push(next.href);
      cur = next;
    } catch {
      break;
    }
  }
  return { final: cur, hops };
}

function parse(raw: string): URL | null {
  let t = String(raw ?? "").trim().slice(0, 2048);
  if (!t) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) t = "https://" + t;
  try {
    const u = new URL(t);
    if (!/^https?:$/.test(u.protocol)) return null;
    u.hostname = u.hostname.toLowerCase();
    return u;
  } catch {
    return null;
  }
}

async function scanUrl(raw: string): Promise<Verdict | { error: string }> {
  const u = parse(raw);
  if (!u) return { error: "That doesn't look like a web link." };
  const reasons: Reason[] = [];
  let score = 0;
  const bump = (n: number, level: Reason["level"], text: string) => { score += n; reasons.push({ level, text }); };
  if (u.username || u.password) bump(30, "bad", "The link hides its real address behind a username (a common phishing trick).");
  if (!publicHost(u.hostname)) return { error: "Only public websites can be scanned." };

  const { final, hops } = await followRedirects(u);
  const fh = final.hostname.replace(/^www\./, "");
  if (hops.length) reasons.push({ level: "info", text: `Short link — it really goes to ${fh}.` });
  const host = fh;

  if (final.protocol === "http:") bump(15, "warn", "Not encrypted (http) — others on the network can read or change the page.");
  if (host.split(".").some((l) => l.startsWith("xn--"))) bump(25, "bad", "Uses look-alike (punycode) characters in the address.");
  if (host.split(".").length > 4) bump(10, "warn", "Unusually many subdomains.");
  const tld = host.split(".").pop() ?? "";
  if (BAD_TLDS.has(tld)) bump(15, "warn", `.${tld} addresses are heavily used by scam sites.`);
  const dom = baseDomain(host);
  for (const [brand, real] of Object.entries(BRANDS)) {
    if (host.replace(/[-.0-9]/g, "").includes(brand) && !real.some((r) => host === r || host.endsWith("." + r))) {
      bump(35, "bad", `Looks like it's pretending to be ${brand[0].toUpperCase() + brand.slice(1)}, but it isn't their site.`);
      break;
    }
  }
  if (RISKY_EXT.test(final.pathname)) bump(25, "warn", "Downloads an installer/executable file — only open it if you trust the source.");
  if (BAIT.test(final.pathname + final.search) && !BRANDS[dom.split(".")[0]]) bump(8, "warn", "Pushes you to log in, verify or claim something.");
  if (final.href.length > 300) bump(5, "info", "Very long link.");

  const rep = await reputation(host);
  if (rep.blocked.length) bump(70, "bad", `Flagged as malware/phishing by ${rep.blocked.join(" and ")}.`);
  if (rep.plainOk && !rep.resolves) bump(10, "warn", "This domain doesn't resolve right now.");
  if (rep.tracker) reasons.push({ level: "info", text: "Known ad/tracking domain — an ad-blocking DNS would block it." });
  if (!reasons.length) reasons.push({ level: "info", text: "No red flags found. Still, only enter passwords on sites you trust." });

  score = Math.min(100, score);
  return {
    url: u.href, final_url: final.href, host, verdict: score >= 60 ? "danger" : score >= 25 ? "suspicious" : "safe", score,
    tracker: rep.tracker, blocked_by: rep.blocked, hops, reasons, scanned_at: new Date().toISOString(),
  };
}

const RANK = { safe: 0, suspicious: 1, danger: 2 } as const;
async function tell(user: string, text: string) {
  try {
    const { data: conv } = await admin.rpc("dm_between", { a: NEXUS_BOT, b: user });
    if (conv) await admin.rpc("bot_say", { p_bot: NEXUS_BOT, p_conv: conv, p_text: text });
  } catch { /* best effort */ }
}

const hits = new Map<string, { n: number; reset: number }>();

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const b = await req.json().catch(() => ({}));

  if (b.action === "scan_all") {
    const { data: cfg } = await admin.from("push_config").select("secret").eq("id", 1).maybeSingle();
    if (!cfg?.secret || req.headers.get("x-push-secret") !== cfg.secret) return json({ error: "forbidden" }, 403);
    const { data: list } = await admin.from("guard_watch").select("*").order("last_scan", { ascending: true, nullsFirst: true }).limit(80);
    let alerts = 0;
    for (const w of list ?? []) {
      const v = await scanUrl(w.url);
      if ("error" in v) continue;
      const worse = RANK[v.verdict] > RANK[(w.verdict as keyof typeof RANK) ?? "safe"];
      await admin.from("guard_watch").update({ verdict: v.verdict, score: v.score, details: v, last_scan: v.scanned_at }).eq("id", w.id);
      if (worse) {
        alerts++;
        await admin.from("guard_events").insert({ owner_id: w.owner_id, watch_id: w.id, kind: v.verdict, detail: { url: w.url, reasons: v.reasons, from: w.verdict, to: v.verdict } });
        if (w.alerts_on) {
          await tell(w.owner_id, `🛡️ Nexus Guard — a link you watch is now ${v.verdict === "danger" ? "DANGEROUS" : "suspicious"}:\n${w.url}\n${v.reasons.filter((r) => r.level !== "info").slice(0, 3).map((r) => "• " + r.text).join("\n")}\nDon't open it, and don't enter passwords there.`);
        }
      }
    }
    return json({ scanned: list?.length ?? 0, alerts });
  }

  const ip = (req.headers.get("x-forwarded-for") ?? "anon").split(",")[0].trim();
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || h.reset < now) hits.set(ip, { n: 1, reset: now + 60_000 });
  else if (++h.n > 40) return json({ error: "Too many scans — wait a minute." }, 429);

  if (b.action === "scan") {
    const v = await scanUrl(b.url);
    return json(v, "error" in v ? 400 : 200);
  }
  return json({ error: "Unknown action" }, 400);
});
