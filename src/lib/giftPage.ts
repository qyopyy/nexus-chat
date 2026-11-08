import { absoluteUrl, esc, seoHead, SITE, truncate } from "./seo";

export type GiftPreview = {
  code: string;
  tier: string;
  days: number;
  max_claims: number;
  claims: number;
  expires_at: string | null;
  remaining: number;
  expired: boolean;
  exhausted: boolean;
};

const PLAN_META: Record<string, { name: string; emoji: string; color: string }> = {
  lighting: { name: "Nexus Lighting Sub", emoji: "⚡", color: "#ffd400" },
  premium: { name: "Nexus Lighting Premium", emoji: "💎", color: "#00e5ff" },
  dist: { name: "Lighting + Music Distribution", emoji: "🎵", color: "#1DB954" },
  dist_pro: { name: "Distribution Pro", emoji: "🚀", color: "#7c4dff" },
  dist_video: { name: "Pro + Music Video", emoji: "🎬", color: "#ff2bd6" },
  wump_plus: { name: "Wump Plus", emoji: "📍", color: "#facc15" },
};

export function renderGiftPage(preview: GiftPreview, origin: string) {
  const plan = PLAN_META[preview.tier] ?? { name: "Nexus Lighting", emoji: "🎁", color: "#5865f2" };
  const pageUrl = absoluteUrl(`/gift/${encodeURIComponent(preview.code)}`, origin);
  const claimUrl = absoluteUrl(`/?gift=${encodeURIComponent(preview.code)}`, origin);
  const desc = truncate(`${plan.emoji} Claim ${preview.days} days of ${plan.name} on Nexus — gifted like Nitro.`, 180);
  const unavailable = preview.expired || preview.exhausted;
  const color = esc(plan.color);

  const head = seoHead({
    title: `${plan.emoji} Gift: ${plan.name}`,
    description: desc || `Claim a Nexus Lighting gift`,
    url: pageUrl,
    image: absoluteUrl(SITE.ogImage, origin),
    siteName: SITE.name,
    twitterCard: "summary_large_image",
    keywords: ["Nexus", "gift", "Lighting", "premium", plan.name],
  });

  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
${head}
<link rel="icon" href="/icon-192.png"/>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif;
    background: #0b0d12; color: #f4f6f8; display: grid; place-items: center; padding: 24px;
    background-image:
      radial-gradient(900px 500px at 10% 0%, ${color}44, transparent 55%),
      radial-gradient(700px 420px at 90% 100%, #c1358422, transparent 50%);
  }
  .card {
    width: 100%; max-width: 440px; overflow: hidden; border-radius: 28px;
    background: #151821ee; border: 1px solid #ffffff14; box-shadow: 0 30px 90px #000a;
    padding: 28px 24px 24px; text-align: center;
  }
  .emoji { font-size: 56px; line-height: 1; filter: drop-shadow(0 12px 30px ${color}66); }
  .badge {
    display: inline-block; margin-top: 16px; font-size: 11px; font-weight: 800;
    letter-spacing: .08em; text-transform: uppercase; color: ${color};
  }
  h1 { margin: 8px 0 10px; font-size: 26px; letter-spacing: -.03em; }
  p { margin: 0; color: #a8b0bb; line-height: 1.45; font-size: 15px; }
  .meta { margin: 16px 0 22px; color: #8b93a0; font-size: 13px; font-weight: 600; }
  a.btn {
    display: inline-block; width: 100%; padding: 14px 18px; border-radius: 999px;
    background: ${color}; color: #0b0d12; font-weight: 800; text-decoration: none; font-size: 15px;
  }
  a.btn.disabled { background: #3a3f4a; color: #9aa3af; pointer-events: none; }
  .foot { margin-top: 16px; font-size: 12px; color: #6b7380; }
</style>
</head><body>
  <div class="card">
    <div class="emoji">${plan.emoji}</div>
    <div class="badge">Nexus gift</div>
    <h1>${esc(plan.name)}</h1>
    <p>${preview.days} day${preview.days === 1 ? "" : "s"} of Lighting · like a Nitro gift link</p>
    <div class="meta">
      ${unavailable
        ? preview.expired
          ? "This gift has expired"
          : "This gift has already been claimed"
        : `${preview.remaining} claim${preview.remaining === 1 ? "" : "s"} left`}
    </div>
    <a class="btn ${unavailable ? "disabled" : ""}" href="${unavailable ? absoluteUrl("/", origin) : claimUrl}">
      ${unavailable ? "Open Nexus" : "Claim gift"}
    </a>
    <div class="foot">Sign in to redeem · Code ${esc(preview.code)}</div>
  </div>
  <script>setTimeout(function(){ if (!${unavailable ? "true" : "false"}) location.replace(${JSON.stringify(claimUrl)}); }, 1200);</script>
</body></html>`;
}

export function giftNotFound(code: string, origin: string) {
  const head = seoHead({
    title: "Gift not found · Nexus",
    description: "This Lighting gift link is invalid or was removed.",
    url: absoluteUrl(`/gift/${encodeURIComponent(code || "missing")}`, origin),
    image: absoluteUrl(SITE.ogImage, origin),
    siteName: SITE.name,
  });
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>${head}</head>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0d12;color:#eee;font-family:system-ui">
  <div style="text-align:center;padding:24px"><div style="font-size:40px">🎁</div><h1>Gift not found</h1>
  <p style="color:#9aa3af">This link is invalid or was removed.</p>
  <a href="${absoluteUrl("/", origin)}" style="color:#2aabee">Open Nexus</a></div></body></html>`;
}
