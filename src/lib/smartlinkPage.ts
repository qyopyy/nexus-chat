// Server-only: renders the public smart-link page (/l/<slug>) as plain HTML.

export type PageData = {
  slug: string;
  headline: string | null;
  accent: string | null;
  links: Record<string, string>;
  title: string;
  artist: string;
  type: string;
  release_date: string;
  label: string;
  copyright: string;
  artwork: string | null;
  live: boolean;
  presave: boolean;
  tracks: { title: string; position: number; duration: number | null; explicit: boolean }[];
};

const FN = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/smartlink`;
export async function callSmartlink<T>(body: Record<string, unknown>): Promise<{ ok: boolean; data: T | null }> {
  try {
    const r = await fetch(FN, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    return { ok: r.ok, data: r.ok ? ((await r.json()) as T) : null };
  } catch {
    return { ok: false, data: null };
  }
}

export const SERVICE_INFO: Record<string, { name: string; color: string; action: string }> = {
  spotify: { name: "Spotify", color: "#1DB954", action: "Play" },
  apple: { name: "Apple Music", color: "#FA243C", action: "Play" },
  youtube_music: { name: "YouTube Music", color: "#FF0000", action: "Play" },
  youtube: { name: "YouTube", color: "#FF0000", action: "Watch" },
  amazon: { name: "Amazon Music", color: "#25D1DA", action: "Play" },
  deezer: { name: "Deezer", color: "#A238FF", action: "Play" },
  tidal: { name: "TIDAL", color: "#FFFFFF", action: "Play" },
  soundcloud: { name: "SoundCloud", color: "#FF5500", action: "Play" },
  audiomack: { name: "Audiomack", color: "#FFA200", action: "Play" },
  pandora: { name: "Pandora", color: "#3668FF", action: "Play" },
  boomplay: { name: "Boomplay", color: "#E21B5A", action: "Play" },
  beatport: { name: "Beatport", color: "#01FF95", action: "Buy" },
  bandcamp: { name: "Bandcamp", color: "#1DA0C3", action: "Buy" },
  tiktok: { name: "TikTok", color: "#FE2C55", action: "Use sound" },
  instagram: { name: "Instagram", color: "#E1306C", action: "Follow" },
  website: { name: "Website", color: "#9AA0A6", action: "Visit" },
};
export const SERVICE_ORDER = Object.keys(SERVICE_INFO);

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function renderPage(d: PageData, base: string) {
  const accent = d.accent && /^#[0-9a-f]{6}$/i.test(d.accent) ? d.accent : "#5865F2";
  const services = SERVICE_ORDER.filter((k) => d.links[k]);
  const when = new Date(`${d.release_date}T00:00:00Z`);
  const dateStr = when.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  const titleLine = `${d.title} — ${d.artist}`;
  const desc = d.presave ? `Out ${dateStr}. ${d.type} by ${d.artist}.` : `Listen to ${d.title} by ${d.artist} on your favourite service.`;
  const rows = services
    .map((k) => {
      const s = SERVICE_INFO[k];
      return `<a class="row" href="${base}/l/${esc(d.slug)}/go/${k}" rel="noopener"><span class="dot" style="background:${s.color}"></span><span class="nm">${s.name}</span><span class="btn">${d.presave && k !== "instagram" && k !== "website" && k !== "tiktok" ? "Pre-save" : s.action}</span></a>`;
    })
    .join("");
  const tracks =
    d.tracks.length > 1
      ? `<ol class="tl">${d.tracks.map((t) => `<li><span>${esc(t.title)}${t.explicit ? ' <b class="e">E</b>' : ""}</span><span class="dur">${t.duration ? `${Math.floor(t.duration / 60)}:${String(Math.round(t.duration % 60)).padStart(2, "0")}` : ""}</span></li>`).join("")}</ol>`
      : "";
  const img = d.artwork ? `<img class="art" src="${esc(d.artwork)}" alt="${esc(d.title)} cover">` : `<div class="art ph">♪</div>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(titleLine)}</title><meta name="description" content="${esc(desc)}">
<meta property="og:title" content="${esc(titleLine)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:type" content="music.album">
${d.artwork ? `<meta property="og:image" content="${esc(d.artwork)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${esc(d.artwork)}">` : ""}
<meta name="theme-color" content="#0b0b0f"><link rel="icon" href="/icon-512.png">
<style>
*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:#0b0b0f;color:#f2f3f5;font:15px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
.bg{position:fixed;inset:-40px;background:${d.artwork ? `url("${esc(d.artwork)}") center/cover` : accent};filter:blur(48px) saturate(1.3) brightness(.45);transform:scale(1.15);z-index:0}
.wrap{position:relative;z-index:1;max-width:440px;margin:0 auto;padding:max(28px,env(safe-area-inset-top)) 16px 40px}
.card{background:rgba(18,18,24,.78);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border-radius:22px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.5)}
.art{display:block;width:100%;aspect-ratio:1;object-fit:cover;background:#222}.ph{display:grid;place-items:center;font-size:80px;color:#555}
.meta{padding:18px 18px 8px;text-align:center}.t{font-size:22px;font-weight:800;margin:0}.a{color:#b5bac1;margin-top:2px}
.hl{margin-top:8px;font-size:14px;color:#dbdee1}.pre{margin:12px auto 4px;display:inline-block;background:${accent};color:#fff;padding:6px 12px;border-radius:999px;font-weight:700;font-size:13px}
.cd{display:flex;justify-content:center;gap:10px;margin:10px 0 2px}.cd div{min-width:58px;background:rgba(255,255,255,.07);border-radius:12px;padding:8px 4px}.cd b{display:block;font-size:22px;font-variant-numeric:tabular-nums}.cd span{font-size:11px;color:#949ba4;text-transform:uppercase}
.list{padding:6px 10px 10px}.row{display:flex;align-items:center;gap:12px;padding:13px 10px;border-top:1px solid rgba(255,255,255,.07);color:inherit;text-decoration:none;border-radius:10px}
.row:hover{background:rgba(255,255,255,.05)}.dot{width:30px;height:30px;border-radius:8px;flex:none}.nm{flex:1;font-weight:600}
.btn{border:1px solid rgba(255,255,255,.25);border-radius:999px;padding:6px 14px;font-size:13px;font-weight:700}
.none{padding:18px;text-align:center;color:#949ba4}.tl{margin:0;padding:6px 18px 14px 38px;color:#dbdee1;font-size:14px}.tl li{padding:3px 0}.tl li span:first-child{display:inline-block;width:80%}.dur{float:right;color:#949ba4}
.e{font-size:10px;background:rgba(255,255,255,.2);border-radius:3px;padding:0 3px}.ft{text-align:center;color:#949ba4;font-size:12px;margin-top:16px}
</style></head><body><div class="bg"></div><main class="wrap"><div class="card">${img}
<div class="meta"><h1 class="t">${esc(d.title)}</h1><div class="a">${esc(d.artist)} · ${esc(d.type)}</div>${d.headline ? `<div class="hl">${esc(d.headline)}</div>` : ""}
${d.presave ? `<div class="pre">Out ${esc(dateStr)}</div><div class="cd" id="cd" data-t="${when.getTime()}"><div><b>–</b><span>days</span></div><div><b>–</b><span>hours</span></div><div><b>–</b><span>min</span></div><div><b>–</b><span>sec</span></div></div>` : ""}</div>
<div class="list">${rows || `<div class="none">${d.presave ? "Store links appear here on release day." : "Links coming soon."}</div>`}</div>${tracks}</div>
<div class="ft">${esc(d.copyright ? `℗ ${d.copyright}` : d.label)}</div></main>
${d.presave ? `<script>(()=>{const e=document.getElementById("cd");if(!e)return;const t=+e.dataset.t,b=e.querySelectorAll("b");const f=()=>{let s=Math.max(0,Math.floor((t-Date.now())/1e3));const v=[Math.floor(s/86400),Math.floor(s%86400/3600),Math.floor(s%3600/60),s%60];v.forEach((x,i)=>b[i].textContent=String(x).padStart(i?2:1,"0"));if(s<=0)location.reload()};f();setInterval(f,1000)})()</script>` : ""}
</body></html>`;
}

export function notFound() {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Link not found</title>
<style>body{margin:0;display:grid;place-items:center;min-height:100vh;background:#0b0b0f;color:#b5bac1;font:16px -apple-system,Segoe UI,Roboto,sans-serif}</style></head><body><div>This link doesn't exist or was turned off.</div></body></html>`;
}
