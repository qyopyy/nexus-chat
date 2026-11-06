// Server-only: public Nexus Link page (/bio/<username>).

import { jsonLd, personLd, seoHead, truncate } from "@/lib/seo";

export type PublicLinkBioBadge = {
  key: string;
  name: string;
  icon: string;
  color: string;
  description?: string | null;
  priority?: number;
};

export type PublicLinkBio = {
  id: string;
  username: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
  links: { type?: string; url: string; label?: string }[];
  theme: string;
  background: string;
  animated_bg: boolean;
  font: string;
  glow: boolean;
  accent: string | null;
  premium: boolean;
  view_count: number;
  locked?: boolean;
  password_protected?: boolean;
  button_style?: string;
  layout?: string;
  show_views?: boolean;
  show_branding?: boolean;
  nsfw?: boolean;
  seo_title?: string | null;
  seo_description?: string | null;
  banner_url?: string | null;
  music_url?: string | null;
  custom_status?: string | null;
  verified?: boolean;
  site_role?: string | null;
  badges?: PublicLinkBioBadge[] | null;
};

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const safeUrl = (u: string) => (/^https?:\/\//i.test(u) ? u : "");

type ThemePack = { bg: string; card: string; text: string; muted: string; accent: string; glow: string; watermark?: string };

const THEMES: Record<string, ThemePack> = {
  juice999: {
    bg: "radial-gradient(ellipse at 50% 0%,#3b0a5c 0%,#0a0214 45%,#000 100%)",
    card: "rgba(90,20,120,.22)",
    text: "#f5e9ff",
    muted: "#c4a0e0",
    accent: "#c084fc",
    glow: "#a855f7",
    watermark: "999",
  },
  purple999: {
    bg: "linear-gradient(160deg,#050008 0%,#1a0533 40%,#000 100%)",
    card: "rgba(120,40,180,.18)",
    text: "#efe6ff",
    muted: "#b39ddb",
    accent: "#d946ef",
    glow: "#e879f9",
    watermark: "999",
  },
  midnight: {
    bg: "linear-gradient(180deg,#0b1020,#07060f)",
    card: "rgba(255,255,255,.06)",
    text: "#f4f2ff",
    muted: "#a9a3c9",
    accent: "#8b5cff",
    glow: "#8b5cff",
  },
  neon: {
    bg: "radial-gradient(circle at 30% 20%,#003344,#05060a 55%)",
    card: "rgba(0,229,255,.08)",
    text: "#e8ffff",
    muted: "#7dd3d8",
    accent: "#00e5ff",
    glow: "#00e5ff",
  },
  aurora: {
    bg: "linear-gradient(135deg,#0f172a,#1e1b4b 40%,#312e81)",
    card: "rgba(255,255,255,.08)",
    text: "#eef2ff",
    muted: "#a5b4fc",
    accent: "#818cf8",
    glow: "#a78bfa",
  },
  void: {
    bg: "#000",
    card: "rgba(255,255,255,.05)",
    text: "#f5f5f5",
    muted: "#888",
    accent: "#fff",
    glow: "#ffffff",
  },
  gold: {
    bg: "radial-gradient(ellipse at top,#3a2a08,#0c0a04 60%)",
    card: "rgba(240,178,50,.12)",
    text: "#fff8e7",
    muted: "#d4b87a",
    accent: "#f0b232",
    glow: "#ffe27a",
  },
  smoke: {
    bg: "linear-gradient(180deg,#1a1a1a,#0d0d0d)",
    card: "rgba(255,255,255,.07)",
    text: "#eee",
    muted: "#999",
    accent: "#bbb",
    glow: "#ddd",
  },
  candy: {
    bg: "linear-gradient(160deg,#2a0a24,#4a1238 50%,#1a0614)",
    card: "rgba(255,80,160,.12)",
    text: "#ffe8f4",
    muted: "#f9a8d4",
    accent: "#ff2bd6",
    glow: "#ff6bcb",
  },
  ocean: {
    bg: "radial-gradient(ellipse at bottom,#0a2744,#020814)",
    card: "rgba(56,189,248,.1)",
    text: "#e0f2fe",
    muted: "#7dd3fc",
    accent: "#38bdf8",
    glow: "#38bdf8",
  },
};

const FONTS: Record<string, string> = {
  glow: `"Segoe UI",system-ui,sans-serif`,
  juice: `"Permanent Marker","Segoe UI",cursive`,
  marker: `"Permanent Marker",cursive`,
  display: `"Bebas Neue","Arial Narrow",sans-serif`,
  space: `"Space Grotesk","Segoe UI",sans-serif`,
  mono: `ui-monospace,SFMono-Regular,Menlo,monospace`,
};

const LINK_ICON: Record<string, string> = {
  website: "🌐",
  instagram: "📸",
  youtube: "▶️",
  tiktok: "🎵",
  x: "𝕏",
  twitter: "𝕏",
  telegram: "✈️",
  soundcloud: "☁️",
  spotify: "🎧",
  discord: "💬",
  github: "⌘",
};

function bgLayer(kind: string, animated: boolean, accent: string) {
  if (kind === "none") return "";
  const anim = animated ? "anim" : "";
  if (kind === "999") {
    return `<div class="fx fx-999 ${anim}" aria-hidden="true"><span>999</span><span>999</span><span>999</span><span>999</span><span>999</span><span>999</span></div>`;
  }
  if (kind === "particles") return `<canvas class="fx-canvas" id="fx" data-mode="particles" data-color="${esc(accent)}"></canvas>`;
  if (kind === "stars") return `<canvas class="fx-canvas" id="fx" data-mode="stars" data-color="${esc(accent)}"></canvas>`;
  if (kind === "rain") return `<canvas class="fx-canvas" id="fx" data-mode="rain" data-color="${esc(accent)}"></canvas>`;
  if (kind === "smoke") return `<div class="fx fx-smoke ${anim}" aria-hidden="true"></div>`;
  if (kind === "grid") return `<div class="fx fx-grid ${anim}" aria-hidden="true"></div>`;
  if (kind === "waves") return `<div class="fx fx-waves ${anim}" aria-hidden="true"></div>`;
  return "";
}

const FX_JS = `
(function(){
  var c=document.getElementById('fx'); if(!c) return;
  var ctx=c.getContext('2d'); if(!ctx) return;
  var mode=c.getAttribute('data-mode')||'particles';
  var color=c.getAttribute('data-color')||'#a855f7';
  var dpr=Math.min(2,window.devicePixelRatio||1);
  var w=0,h=0,pts=[];
  function resize(){w=window.innerWidth;h=window.innerHeight;c.width=w*dpr;c.height=h*dpr;c.style.width=w+'px';c.style.height=h+'px';ctx.setTransform(dpr,0,0,dpr,0,0);
    var n=mode==='stars'?90:mode==='rain'?70:55; pts=[]; for(var i=0;i<n;i++) pts.push({x:Math.random()*w,y:Math.random()*h,r:Math.random()*2.2+0.4,vx:(Math.random()-.5)*.4,vy:mode==='rain'?2+Math.random()*4:Math.random()*.6+.1,a:.2+Math.random()*.7});
  }
  window.addEventListener('resize',resize); resize();
  function tick(){
    ctx.clearRect(0,0,w,h);
    for(var i=0;i<pts.length;i++){
      var p=pts[i];
      if(mode==='rain'){ctx.strokeStyle=color;ctx.globalAlpha=p.a*.55;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x,p.y+10);ctx.stroke();p.y+=p.vy; if(p.y>h){p.y=-10;p.x=Math.random()*w}}
      else {ctx.fillStyle=color;ctx.globalAlpha=p.a;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill();p.x+=p.vx;p.y+=p.vy; if(p.x<0||p.x>w)p.vx*=-1; if(p.y<0||p.y>h)p.vy*=-1;}
    }
    ctx.globalAlpha=1; requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();
`;

export function renderLinkBio(p: PublicLinkBio, base: string) {
  const url = `${base}/bio/${p.username}`;
  const app = `${base}/bio/app`;
  const t = THEMES[p.theme] || THEMES.midnight;
  const accent = p.accent && /^#[0-9a-f]{6}$/i.test(p.accent) ? p.accent : t.accent;
  const font = FONTS[p.font] || FONTS.glow;
  const glowOn = p.glow !== false;
  const locked = Boolean(p.locked);
  const btn = p.button_style || "pill";
  const radius = btn === "square" ? "12px" : btn === "pill" ? "999px" : "18px";
  const linkBg =
    btn === "outline" ? "transparent" : btn === "glass" ? "rgba(255,255,255,.08)" : t.card;
  const linkBorder = btn === "outline" ? `1px solid ${accent}` : "inset 0 0 0 1px rgba(255,255,255,.08)";
  const links = locked ? [] : (p.links ?? []).map((l) => ({ ...l, url: safeUrl(l.url) })).filter((l) => l.url);
  const av = p.avatar_url
    ? `<img class="av" src="${esc(p.avatar_url)}" alt="">`
    : `<div class="av av-ph">${esc((p.display_name || p.username).slice(0, 2).toUpperCase())}</div>`;
  const showBrand = p.show_branding !== false;
  const title = p.seo_title || `${p.display_name} (@${p.username}) · Nexus Link`;
  const desc = truncate(p.seo_description || p.bio || `${p.display_name} (@${p.username}) on Nexus Link`);
  const verifiedCheck = `<svg class="vcheck" viewBox="0 0 24 24" fill="#4cb3ff" aria-label="Verified"><path d="M12 1.5l2.6 2 3.2-.3 1 3.1 2.8 1.6-1 3.1 1 3.1-2.8 1.6-1 3.1-3.2-.3-2.6 2-2.6-2-3.2.3-1-3.1L1.4 14l1-3.1-1-3.1 2.8-1.6 1-3.1 3.2.3z"/><path d="M8 12.2l2.7 2.7L16.4 9" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const badges = (p.badges ?? []).filter((b) => b?.key);
  const hasFounder = badges.some((b) => b.key === "founder") || p.site_role === "owner";
  const hasVip = badges.some((b) => b.key === "vip") || p.site_role === "vip";
  const hasPremium = Boolean(p.premium) || badges.some((b) => b.key === "premium");
  const chips = [
    hasFounder ? `<span class="chip founder" title="Founded Nexus">👑 Founder</span>` : "",
    p.site_role === "owner" ? `<span class="chip owner" title="Site owner">✦ Owner</span>` : p.site_role === "admin" ? `<span class="chip staff">🛡️ Admin</span>` : "",
    hasVip ? `<span class="chip vip" title="VIP member">💎 VIP</span>` : "",
    hasPremium ? `<span class="chip premchip" title="Nexus Link Premium">⭐ Premium</span>` : "",
  ]
    .filter(Boolean)
    .join("");
  const badgeRow = badges
    .filter((b) => !["verified", "premium"].includes(b.key))
    .slice(0, 16)
    .map(
      (b) =>
        `<span class="badge" title="${esc(b.description ? `${b.name} — ${b.description}` : b.name)}" style="background:${esc(b.color)}26;box-shadow:inset 0 0 0 1px ${esc(b.color)}66">${esc(b.icon)}</span>`,
    )
    .join("");

  const css = `
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Permanent+Marker&family=Space+Grotesk:wght@500;700&display=swap');
*{box-sizing:border-box;margin:0}
html,body{min-height:100%;background:#000;color:${t.text};font:15px/1.5 ${font};-webkit-font-smoothing:antialiased}
body{background:${t.bg};overflow-x:hidden}
.stage{position:relative;min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:28px 16px 48px}
.fx,.fx-canvas{position:fixed;inset:0;pointer-events:none;z-index:0}
.fx-999{display:grid;grid-template-columns:repeat(3,1fr);place-items:center;opacity:.07;font:900 18vw/1 "Bebas Neue",sans-serif;letter-spacing:.04em;color:${accent}}
.fx-999.anim span{animation:float 8s ease-in-out infinite}
.fx-999 span:nth-child(2){animation-delay:1s}.fx-999 span:nth-child(3){animation-delay:2s}
.fx-999 span:nth-child(4){animation-delay:1.5s}.fx-999 span:nth-child(5){animation-delay:2.5s}
.fx-smoke{background:radial-gradient(ellipse at 30% 80%,${accent}33,transparent 50%),radial-gradient(ellipse at 70% 20%,#fff1,transparent 45%);animation:drift 12s ease-in-out infinite alternate}
.fx-grid{background-image:linear-gradient(${accent}22 1px,transparent 1px),linear-gradient(90deg,${accent}22 1px,transparent 1px);background-size:48px 48px;opacity:.35;animation:pan 20s linear infinite}
.fx-waves{background:radial-gradient(120% 80% at 50% 120%,${accent}44,transparent 55%);animation:pulse 6s ease-in-out infinite}
@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-18px)}}
@keyframes drift{from{transform:scale(1) translateY(0)}to{transform:scale(1.08) translateY(-20px)}}
@keyframes pan{to{background-position:48px 48px}}
@keyframes pulse{0%,100%{opacity:.55;transform:scale(1)}50%{opacity:.9;transform:scale(1.05)}}
@keyframes glowPulse{0%,100%{text-shadow:0 0 8px ${t.glow},0 0 24px ${t.glow},0 0 48px ${accent}88}50%{text-shadow:0 0 14px ${t.glow},0 0 36px ${accent},0 0 72px ${accent}aa}}
.card{position:relative;z-index:1;width:100%;max-width:420px;text-align:center}
.banner{width:100%;height:120px;object-fit:cover;border-radius:20px;margin-bottom:14px;box-shadow:0 8px 30px rgba(0,0,0,.35)}
.top{display:flex;justify-content:space-between;align-items:center;margin-bottom:22px;opacity:.85}
.brand{font-weight:800;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:${t.muted}}
.brand b{color:${accent}}
.login{padding:7px 12px;border-radius:999px;background:rgba(255,255,255,.08);font-size:12px;font-weight:700;color:${t.text};text-decoration:none}
.av{width:112px;height:112px;border-radius:50%;object-fit:cover;margin:0 auto;display:grid;place-items:center;box-shadow:0 0 0 3px ${accent}55,0 12px 40px ${accent}44}
.av-ph{background:${accent}33;font-size:36px;font-weight:900}
.name{margin-top:18px;font-size:clamp(28px,8vw,42px);font-weight:900;letter-spacing:.02em;line-height:1.05;${glowOn ? `animation:glowPulse 3.2s ease-in-out infinite;` : ""}}
.font-juice .name,.font-marker .name{font-family:"Permanent Marker",cursive;letter-spacing:.04em}
.font-display .name{font-family:"Bebas Neue",sans-serif;letter-spacing:.08em;font-size:clamp(36px,10vw,52px)}
.font-space .name{font-family:"Space Grotesk",sans-serif}
.font-mono .name{font-family:ui-monospace,monospace}
.handle{margin-top:6px;color:${t.muted};font-weight:600}
.status{margin-top:8px;font-size:13px;color:${accent};font-weight:700}
.name-row{display:inline-flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap}
.vcheck{width:26px;height:26px;flex:none;filter:drop-shadow(0 0 8px #4cb3ff88)}
.chips{display:flex;flex-wrap:wrap;justify-content:center;gap:6px;margin-top:12px}
.chip{display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:800;letter-spacing:.02em}
.chip.founder{background:#F0B23222;color:#F0B232;box-shadow:inset 0 0 0 1px #F0B23266}
.chip.vip{background:#EB459E22;color:#EB459E;box-shadow:inset 0 0 0 1px #EB459E66}
.chip.premchip{background:${accent}22;color:${accent};box-shadow:inset 0 0 0 1px ${accent}55}
.chip.owner{background:#ED424522;color:#ff8a8c;box-shadow:inset 0 0 0 1px #ED424566}
.chip.staff{background:#a855f722;color:#c084fc;box-shadow:inset 0 0 0 1px #a855f766}
.badges{display:flex;flex-wrap:wrap;justify-content:center;gap:6px;margin:12px auto 0;max-width:360px}
.badge{display:inline-grid;place-items:center;min-width:30px;height:30px;padding:0 7px;border-radius:10px;font-size:15px;line-height:1}
.prem{display:inline-flex;align-items:center;gap:4px;margin-top:10px;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:800;background:${accent}22;color:${accent};box-shadow:inset 0 0 0 1px ${accent}55}
.bio{margin:14px auto 0;max-width:360px;white-space:pre-wrap;color:${t.muted};font-size:14px}
.views{margin-top:8px;font-size:12px;color:${t.muted};opacity:.7}
.links{display:flex;flex-direction:column;gap:10px;margin-top:22px}
.layout-cards .links{gap:12px}
.layout-minimal .links a{background:transparent;box-shadow:none;border-bottom:1px solid rgba(255,255,255,.08);border-radius:0;padding:12px 4px}
.links a{display:flex;align-items:center;gap:12px;padding:14px 16px;border-radius:${radius};background:${linkBg};backdrop-filter:blur(10px);box-shadow:${linkBorder};color:${t.text};text-decoration:none;font-weight:700;transition:transform .15s,background .15s}
.links a:hover{transform:translateY(-2px);background:rgba(255,255,255,.12)}
.links .ic{width:36px;height:36px;border-radius:12px;display:grid;place-items:center;background:rgba(0,0,0,.25);flex:none}
.links .nm{flex:1;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.links .arrow{opacity:.4}
.lock{margin-top:22px;padding:18px;border-radius:20px;background:${t.card};box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)}
.lock input{width:100%;margin-top:10px;padding:12px 14px;border-radius:12px;border:1px solid rgba(255,255,255,.12);background:rgba(0,0,0,.35);color:${t.text};font:inherit}
.lock button{margin-top:10px;width:100%;padding:12px;border:0;border-radius:999px;background:${accent};color:#fff;font-weight:800;cursor:pointer}
.lock .err{margin-top:8px;color:#ff8a8c;font-size:13px;display:none}
.nsfw{margin:14px auto 0;max-width:360px;padding:10px 12px;border-radius:12px;background:rgba(255,80,80,.12);color:#ffb4b4;font-size:12px;font-weight:700}
.music{margin-top:18px;border-radius:16px;overflow:hidden}
.foot{margin-top:28px;font-size:12px;color:${t.muted};opacity:.7}
.foot a{color:${accent};font-weight:700;text-decoration:none}
.wm{position:fixed;right:12px;bottom:10px;z-index:2;font:900 64px/1 "Bebas Neue",sans-serif;color:${accent};opacity:.12;pointer-events:none;letter-spacing:.06em}
`;

  const unlockForm = locked
    ? `<div class="lock"><div style="font-size:28px">🔒</div><div style="font-weight:800;margin-top:6px">Password protected</div><p style="margin-top:6px;color:${t.muted};font-size:13px">Enter the page password to view links.</p>
<form id="unlock"><input type="password" name="pw" placeholder="Page password" required minlength="1" autocomplete="current-password"/><button type="submit">Unlock</button><div class="err" id="err">Wrong password</div></form></div>`
    : "";

  const music =
    !locked && p.music_url && /spotify\.com|soundcloud\.com|music\.apple\.com/i.test(p.music_url)
      ? `<div class="music"><iframe src="${esc(p.music_url.includes("embed") ? p.music_url : p.music_url.replace("open.spotify.com/", "open.spotify.com/embed/"))}" width="100%" height="80" frameborder="0" allow="encrypted-media" loading="lazy"></iframe></div>`
      : "";

  const body = `<div class="stage font-${esc(p.font)} layout-${esc(p.layout || "classic")}">
${bgLayer(p.background, p.animated_bg, accent)}
${t.watermark ? `<div class="wm">${esc(t.watermark)}</div>` : ""}
<div class="card">
  <div class="top">${showBrand ? `<div class="brand">Nexus <b>Link</b></div>` : `<div></div>`}<a class="login" href="${app}">Log in · Edit</a></div>
  ${!locked && p.banner_url ? `<img class="banner" src="${esc(p.banner_url)}" alt="">` : ""}
  ${av}
  <h1 class="name"><span class="name-row"><span>${esc(p.display_name || p.username)}</span>${p.verified ? verifiedCheck : ""}</span></h1>
  <div class="handle">@${esc(p.username)}</div>
  ${!locked && p.custom_status ? `<div class="status">${esc(p.custom_status)}</div>` : ""}
  ${chips ? `<div class="chips">${chips}</div>` : p.premium ? `<div class="prem">⭐ Premium</div>` : ""}
  ${badgeRow ? `<div class="badges" aria-label="Badges">${badgeRow}</div>` : ""}
  ${p.nsfw && !locked ? `<div class="nsfw">18+ · Sensitive content</div>` : ""}
  ${!locked && p.bio ? `<p class="bio">${esc(p.bio)}</p>` : ""}
  ${!locked && p.show_views ? `<div class="views">${esc(p.view_count)} views</div>` : ""}
  ${unlockForm}
  ${
    links.length
      ? `<div class="links">${links
          .map(
            (l) =>
              `<a href="${esc(l.url)}" target="_blank" rel="noopener nofollow" data-url="${esc(l.url)}"><span class="ic">${LINK_ICON[(l.type || "").toLowerCase()] || "🔗"}</span><span class="nm">${esc(l.label || l.type || "Link")}</span><span class="arrow">›</span></a>`,
          )
          .join("")}</div>`
      : ""
  }
  ${music}
  ${showBrand ? `<p class="foot">Claim yours with an invite · <a href="${app}">Create Nexus Link</a></p>` : ""}
</div>
</div>
<script>
${FX_JS}
(function(){
  ${locked ? "" : `fetch(${JSON.stringify(`${base}/api/linkbio/hit?u=${encodeURIComponent(p.username)}`)}).catch(function(){});`}
  document.querySelectorAll('.links a').forEach(function(a){
    a.addEventListener('click',function(){
      var u=a.getAttribute('data-url')||'';
      fetch(${JSON.stringify(`${base}/api/linkbio/click`)},{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({u:${JSON.stringify(p.username)},url:u})}).catch(function(){});
    });
  });
  var f=document.getElementById('unlock');
  if(f){f.addEventListener('submit',function(e){
    e.preventDefault();
    var pw=new FormData(f).get('pw');
    fetch(${JSON.stringify(`${base}/api/linkbio/unlock`)},{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({u:${JSON.stringify(p.username)},password:pw}),credentials:'same-origin'})
      .then(function(r){return r.json()})
      .then(function(j){ if(j&&j.ok) location.reload(); else { var err=document.getElementById('err'); if(err) err.style.display='block'; } })
      .catch(function(){ var err=document.getElementById('err'); if(err) err.style.display='block'; });
  })}
})();
</script>`;

  const ld = personLd({
    name: p.display_name || p.username,
    username: p.username,
    url,
    image: p.avatar_url,
    description: locked ? null : p.bio,
  });
  return `<!doctype html><html lang="en"><head>
${seoHead({ title, description: desc, url, image: p.avatar_url, type: "profile", keywords: ["Nexus Link", "link in bio"], twitterCard: p.avatar_url ? "summary_large_image" : "summary" })}
${jsonLd(ld)}
<style>${css}</style></head><body>${body}</body></html>`;
}

export function linkBioNotFound(name: string, base: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Not found · Nexus Link</title>
<meta name="viewport" content="width=device-width,initial-scale=1"><style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#07060f;color:#f4f2ff;font:15px/1.45 system-ui;text-align:center;padding:24px}
a{display:inline-flex;margin-top:18px;padding:12px 20px;border-radius:999px;background:linear-gradient(90deg,#ff2bd6,#8b5cff);color:#fff;font-weight:800;text-decoration:none}
</style></head><body>
<div><div style="font-size:48px">🔗</div><h1>@${esc(name)} isn't here</h1><p style="color:#a9a3c9">This Nexus Link doesn't exist yet.</p>
<a href="${base}/bio/app">Create yours</a></div></body></html>`;
}
