// Server-only: renders the public NexusGram profile (/u/<username>) as plain HTML.

type M = { path: string; type: "image" | "video"; poster?: string | null };
export type PublicGram = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  avatar_color: string | null;
  banner_url: string | null;
  banner_color: string | null;
  bio: string | null;
  links?: { type: string; url: string; label?: string }[] | null;
  verified: boolean;
  followers: number;
  following: number;
  posts: number;
  likes: number;
  grid: { id: string; kind: "post" | "short"; cover: M; count: number; like_count: number; view_count: number }[];
  stories: { id: string; media: M; caption: string; created_at: string; expires_at: string }[];
};

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const media = (p?: string | null) => (!p ? "" : /^https?:/.test(p) ? p : `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/gram/${p.split("/").map(encodeURIComponent).join("/")}`);
const fmt = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}K` : String(n ?? 0));
const color = (c?: string | null) => (c && /^#[0-9a-f]{3,8}$/i.test(c) ? c : "#5865f2");
const safeUrl = (u: string) => (/^https?:\/\//i.test(u) ? u : "");
const initials = (s: string) =>
  s
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

const CSS = `
*{box-sizing:border-box;margin:0}html,body{background:#07060f;color:#f4f2ff;font:15px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
.wrap{max-width:640px;margin:0 auto;padding-bottom:60px}
.hero{position:relative;height:230px;overflow:hidden}
.hero img{width:100%;height:100%;object-fit:cover}
.hero:after{content:"";position:absolute;inset:0;background:linear-gradient(to bottom,rgba(7,6,15,.1),rgba(7,6,15,.35) 55%,#07060f)}
.top{position:absolute;z-index:2;top:14px;left:16px;right:16px;display:flex;align-items:center;gap:8px}
.logo{display:flex;align-items:center;gap:7px;font-weight:900;letter-spacing:-.02em}
.logo b{display:grid;place-items:center;width:30px;height:30px;border-radius:10px;background:linear-gradient(135deg,#ff2bd6,#8b5cff,#00c2ff);color:#fff;font-size:15px}
.top .open{margin-left:auto;background:rgba(0,0,0,.45);backdrop-filter:blur(10px);padding:7px 14px;border-radius:999px;font-weight:700;font-size:13px}
.head{position:relative;margin-top:-86px;text-align:center;padding:0 18px}
.ring{display:inline-block;padding:4px;border-radius:50%;background:rgba(255,255,255,.18)}
.ring.live{background:conic-gradient(from 200deg,#feda75,#fa7e1e,#d62976,#962fbf,#4f5bd5,#feda75);cursor:pointer}
.ring>span{display:block;padding:3px;border-radius:50%;background:#07060f}
.av{width:124px;height:124px;border-radius:50%;object-fit:cover;display:grid;place-items:center;font-size:42px;font-weight:900;color:#fff}
h1{margin-top:12px;font-size:26px;font-weight:900;letter-spacing:-.02em;display:flex;align-items:center;justify-content:center;gap:6px}
h1 svg{width:22px;height:22px;flex:none}
.user{color:#a9a3c9;font-weight:600}
.bio{margin:10px auto 0;max-width:460px;white-space:pre-wrap;color:#dcd8f4}
.links{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin-top:10px}
.links a{font-size:13px;font-weight:600;color:#9fb3ff}
.stats{display:flex;justify-content:center;gap:6px;margin-top:18px}
.stats div{min-width:84px;padding:8px 6px;border-radius:16px;background:rgba(255,255,255,.05)}
.stats b{display:block;font-size:20px;font-weight:900;font-variant-numeric:tabular-nums}
.stats span{font-size:12px;color:#a9a3c9}
.btns{display:flex;gap:8px;max-width:440px;margin:18px auto 0}
.btn{flex:1;display:flex;align-items:center;justify-content:center;gap:7px;padding:12px;border-radius:999px;font-weight:800;border:0;cursor:pointer;font-size:15px;color:#fff;background:rgba(255,255,255,.1)}
.btn.main{background:linear-gradient(90deg,#ff2bd6,#8b5cff,#00c2ff);box-shadow:0 8px 30px -8px rgba(139,92,255,.7)}
.btn svg{width:18px;height:18px}
.sec{margin:28px 16px 10px;font-size:13px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#a9a3c9}
.stories{display:flex;gap:10px;overflow-x:auto;padding:0 16px;scrollbar-width:none}
.story{flex:none;width:104px;aspect-ratio:9/16;border-radius:16px;overflow:hidden;position:relative;cursor:pointer;background:#111;border:2px solid #d62976}
.story img{width:100%;height:100%;object-fit:cover}
.story small{position:absolute;left:6px;bottom:6px;font-size:11px;font-weight:700;background:rgba(0,0,0,.55);padding:2px 6px;border-radius:999px}
.tabs{display:flex;margin:22px 0 2px;border-bottom:1px solid rgba(255,255,255,.08)}
.tabs button{flex:1;background:none;border:0;color:#a9a3c9;font:700 14px system-ui;padding:12px;cursor:pointer}
.tabs button.on{color:#fff;box-shadow:inset 0 -2px #fff}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:2px}
.grid a{position:relative;aspect-ratio:1;background:#111;overflow:hidden}
.grid.shorts a{aspect-ratio:9/16}
.grid img{width:100%;height:100%;object-fit:cover;transition:transform .3s}
.grid a:hover img{transform:scale(1.05)}
.grid small{position:absolute;left:6px;bottom:5px;font-size:12px;font-weight:800;text-shadow:0 1px 4px #000}
.grid i{position:absolute;right:6px;top:5px;font-style:normal;font-size:11px;font-weight:800;background:rgba(0,0,0,.5);padding:1px 5px;border-radius:5px}
.empty{padding:50px 20px;text-align:center;color:#a9a3c9}
.foot{margin:40px 16px 0;text-align:center;color:#6f6a8c;font-size:13px}
.foot a{color:#c9b8ff;font-weight:700}
.viewer{position:fixed;inset:0;z-index:50;background:#000;display:none;align-items:center;justify-content:center}
.viewer.on{display:flex}
.viewer .box{position:relative;width:100%;max-width:440px;height:100%;max-height:92vh}
.viewer img,.viewer video{width:100%;height:100%;object-fit:contain}
.viewer .bars{position:absolute;top:10px;left:10px;right:10px;display:flex;gap:4px;z-index:2}
.viewer .bars span{flex:1;height:3px;border-radius:3px;background:rgba(255,255,255,.35);overflow:hidden}
.viewer .bars span i{display:block;height:100%;width:0;background:#fff}
.viewer .x{position:absolute;top:22px;right:12px;z-index:3;background:none;border:0;color:#fff;font-size:30px;cursor:pointer}
.viewer .cap{position:absolute;left:0;right:0;bottom:80px;text-align:center;padding:0 24px;font-size:18px;font-weight:700;text-shadow:0 2px 8px #000}
.viewer .l,.viewer .r{position:absolute;top:0;bottom:0;width:35%;z-index:1;background:none;border:0;cursor:pointer}
.viewer .l{left:0}.viewer .r{right:0}
.toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#fff;color:#000;font-weight:700;padding:10px 18px;border-radius:999px;opacity:0;transition:opacity .2s;pointer-events:none}
.toast.on{opacity:1}
@media(min-width:640px){.hero{height:280px;border-radius:0 0 28px 28px}}
`;

const ICON = {
  check: `<svg viewBox="0 0 24 24" fill="#4cb3ff"><path d="M12 1.5l2.6 2 3.2-.3 1 3.1 2.8 1.6-1 3.1 1 3.1-2.8 1.6-1 3.1-3.2-.3-2.6 2-2.6-2-3.2.3-1-3.1L1.4 14l1-3.1-1-3.1 2.8-1.6 1-3.1 3.2.3z"/><path d="M8 12.2l2.7 2.7L16.4 9" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`,
  friend: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M19 8v6M16 11h6"/></svg>`,
  share: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>`,
};

function shell(title: string, desc: string, image: string, url: string, body: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}">
<meta property="og:type" content="profile"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(url)}">
${image ? `<meta property="og:image" content="${esc(image)}"><meta name="twitter:image" content="${esc(image)}">` : ""}<meta name="twitter:card" content="summary">
<meta name="theme-color" content="#07060f"><link rel="icon" href="/icon.png"><style>${CSS}</style></head><body>${body}</body></html>`;
}

export function renderGramProfile(p: PublicGram, base: string) {
  const url = `${base}/u/${p.username}`;
  const app = `${base}/gram/${encodeURIComponent(p.username)}`;
  const bg = color(p.banner_color || p.avatar_color);
  const hero = p.banner_url ? `<img src="${esc(p.banner_url)}" alt="">` : `<div style="height:100%;background:radial-gradient(circle at 30% 20%,${bg}cc,transparent 60%),radial-gradient(circle at 80% 70%,#8b5cff88,transparent 55%),#12062b"></div>`;
  const av = p.avatar_url ? `<img class="av" src="${esc(p.avatar_url)}" alt="">` : `<div class="av" style="background:${color(p.avatar_color)}">${esc(initials(p.display_name || p.username))}</div>`;
  const posts = p.grid.filter((g) => g.kind === "post");
  const shorts = p.grid.filter((g) => g.kind === "short");
  const tile = (g: PublicGram["grid"][number]) =>
    `<a href="${app}" title="Open in NexusGram"><img loading="lazy" src="${esc(media(g.cover.type === "video" ? g.cover.poster : g.cover.path))}" alt="">${g.kind === "short" ? `<small>▶ ${fmt(g.view_count)}</small>` : g.count > 1 ? `<i>1/${g.count}</i>` : ""}</a>`;
  const stories = p.stories.map((s) => ({ t: s.media.type, u: media(s.media.path), p: media(s.media.poster), c: s.caption }));
  const links = (p.links ?? []).map((l) => ({ ...l, url: safeUrl(l.url) })).filter((l) => l.url);

  const body = `<div class="wrap">
<div class="hero">${hero}<div class="top"><a class="logo" href="${base}"><b>N</b>NexusGram</a><a class="open" href="${app}">Open in Nexus</a></div></div>
<div class="head">
  <span class="ring${stories.length ? " live" : ""}"${stories.length ? ' onclick="openStory(0)" title="Watch story"' : ""}><span>${av}</span></span>
  <h1>${esc(p.display_name || p.username)}${p.verified ? ICON.check : ""}</h1>
  <div class="user">@${esc(p.username)}</div>
  ${p.bio ? `<p class="bio">${esc(p.bio)}</p>` : ""}
  ${links.length ? `<div class="links">${links.map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener nofollow">${esc(l.label || l.type)}</a>`).join("")}</div>` : ""}
  <div class="stats"><div><b>${fmt(p.followers)}</b><span>Followers</span></div><div><b>${fmt(p.following)}</b><span>Following</span></div><div><b>${fmt(p.posts)}</b><span>Posts</span></div><div><b>${fmt(p.likes)}</b><span>Likes</span></div></div>
  <div class="btns">
    <a class="btn main" href="${app}">${ICON.plus} Follow</a>
    <a class="btn" href="${app}">${ICON.friend} Add friend</a>
    <button class="btn" style="flex:none;width:50px" onclick="share()" aria-label="Share">${ICON.share}</button>
  </div>
</div>
${stories.length ? `<div class="sec">Story · ${stories.length}</div><div class="stories">${p.stories.map((s, k) => `<div class="story" onclick="openStory(${k})"><img loading="lazy" src="${esc(media(s.media.type === "video" ? s.media.poster : s.media.path))}" alt=""><small>${Math.max(1, Math.round((new Date(s.expires_at).getTime() - Date.now()) / 3.6e6))}h left</small></div>`).join("")}</div>` : ""}
<div class="tabs"><button class="on" data-t="posts">Posts · ${posts.length}</button><button data-t="shorts">Shorts · ${shorts.length}</button></div>
<div id="posts" class="grid">${posts.map(tile).join("") || ""}</div>${posts.length ? "" : `<div class="empty" id="posts-e">No posts yet.</div>`}
<div id="shorts" class="grid shorts" style="display:none">${shorts.map(tile).join("")}</div><div class="empty" id="shorts-e" style="display:none">${shorts.length ? "" : "No Shorts yet."}</div>
<p class="foot">Join <a href="${base}/register">Nexus</a> to follow @${esc(p.username)}, add friends, and post your own stories &amp; Shorts.</p>
</div>
<div class="viewer" id="v"><div class="box"><div class="bars" id="bars"></div><button class="x" onclick="closeStory()" aria-label="Close">×</button><button class="l" onclick="step(-1)" aria-label="Previous"></button><button class="r" onclick="step(1)" aria-label="Next"></button><div id="m" style="height:100%"></div><div class="cap" id="cap"></div></div></div>
<div class="toast" id="toast">Link copied</div>
<script>
var S=${JSON.stringify(stories).replace(/</g, "\\u003c")},i=0,tm=null,t0=0;
document.querySelectorAll(".tabs button").forEach(function(b){b.onclick=function(){document.querySelectorAll(".tabs button").forEach(function(x){x.classList.toggle("on",x===b)});["posts","shorts"].forEach(function(k){var on=b.dataset.t===k;document.getElementById(k).style.display=on?"grid":"none";var e=document.getElementById(k+"-e");if(e)e.style.display=on&&e.textContent?"block":"none"})}});
function share(){var u=${JSON.stringify(url)};if(navigator.share){navigator.share({title:${JSON.stringify(`${p.display_name} (@${p.username}) on NexusGram`)},url:u}).catch(function(){})}else{navigator.clipboard.writeText(u);var t=document.getElementById("toast");t.classList.add("on");setTimeout(function(){t.classList.remove("on")},1500)}}
function bars(){document.getElementById("bars").innerHTML=S.map(function(_,k){return '<span><i style="width:'+(k<i?100:0)+'%"></i></span>'}).join("")}
function show(){clearInterval(tm);var s=S[i],m=document.getElementById("m");bars();document.getElementById("cap").textContent=s.c||"";var bar=document.querySelectorAll("#bars i")[i];
if(s.t==="video"){m.innerHTML='<video autoplay playsinline src="'+s.u+'" poster="'+s.p+'"></video>';var v=m.firstChild;v.ontimeupdate=function(){bar.style.width=(v.currentTime/(v.duration||1)*100)+"%"};v.onended=function(){step(1)}}
else{m.innerHTML='<img src="'+s.u+'" alt="">';t0=Date.now();tm=setInterval(function(){var k=(Date.now()-t0)/6000;bar.style.width=Math.min(100,k*100)+"%";if(k>=1)step(1)},50)}}
function openStory(k){if(!S.length)return;i=k;document.getElementById("v").classList.add("on");show()}
function closeStory(){clearInterval(tm);document.getElementById("v").classList.remove("on");document.getElementById("m").innerHTML=""}
function step(d){var n=i+d;if(n<0)n=0;if(n>=S.length)return closeStory();i=n;show()}
document.addEventListener("keydown",function(e){if(!document.getElementById("v").classList.contains("on"))return;if(e.key==="Escape")closeStory();if(e.key==="ArrowRight")step(1);if(e.key==="ArrowLeft")step(-1)});
</script>`;
  return shell(`${p.display_name} (@${p.username}) · NexusGram`, `${fmt(p.followers)} followers · ${fmt(p.posts)} posts${p.bio ? ` · ${p.bio.slice(0, 120)}` : ""}`, p.avatar_url ?? "", url, body);
}

export function gramNotFound(name: string, base: string) {
  return shell(
    "Not found · NexusGram",
    "This NexusGram account doesn't exist.",
    "",
    `${base}/u/${name}`,
    `<div class="wrap" style="display:grid;place-items:center;min-height:100vh;text-align:center;padding:24px"><div><div style="font-size:54px">🔭</div><h1 style="margin-top:8px">@${esc(name)} isn't here</h1><p class="user" style="margin-top:6px">This account doesn't exist or changed its username.</p><p style="margin-top:20px"><a class="btn main" style="display:inline-flex;padding:12px 22px" href="${base}">Go to Nexus</a></p></div></div>`,
  );
}
