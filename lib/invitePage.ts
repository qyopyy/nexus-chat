import { absoluteUrl, esc, seoHead, SITE, truncate } from "./seo";

export type InvitePreview = {
  id: string;
  name: string;
  description: string | null;
  icon_color: string;
  icon_url: string | null;
  banner_url: string | null;
  vanity_code: string | null;
  invite_code: string;
  member_count: number;
  online_count?: number;
  verified?: boolean;
};

export function renderInvitePage(preview: InvitePreview, origin: string) {
  const code = preview.vanity_code || preview.invite_code;
  const pageUrl = absoluteUrl(`/i/${encodeURIComponent(code)}`, origin);
  const joinUrl = absoluteUrl(`/?join=${encodeURIComponent(code)}`, origin);
  const desc =
    truncate(preview.description || `Join ${preview.name} on Nexus — chat, voice, and community.`, 180) ||
    `Join ${preview.name} on Nexus`;
  const image = preview.banner_url || preview.icon_url || absoluteUrl(SITE.ogImage, origin);
  const initials = preview.name.replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase() || "NX";
  const color = esc(preview.icon_color || "#2aabee");
  const members = preview.member_count ?? 0;

  const head = seoHead({
    title: `${preview.name} · Nexus Server`,
    description: desc,
    url: pageUrl,
    image,
    siteName: SITE.name,
    twitterCard: "summary_large_image",
    keywords: ["Nexus", "server", "invite", preview.name],
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
    background: #0b0d12; color: #f4f6f8;
    display: grid; place-items: center; padding: 24px;
    background-image:
      radial-gradient(900px 500px at 10% 0%, ${color}33, transparent 55%),
      radial-gradient(700px 420px at 90% 100%, #c1358422, transparent 50%);
  }
  .card {
    width: 100%; max-width: 480px; overflow: hidden; border-radius: 28px;
    background: #151821ee; border: 1px solid #ffffff14; box-shadow: 0 30px 90px #000a;
  }
  .banner {
    height: 160px; background: linear-gradient(135deg, ${color}aa, #12151d 70%);
    background-size: cover; background-position: center; position: relative;
  }
  .banner::after {
    content: ""; position: absolute; inset: 0;
    background: linear-gradient(180deg, transparent 30%, #151821ee 100%);
  }
  .body { padding: 0 24px 24px; margin-top: -36px; position: relative; }
  .icon {
    width: 72px; height: 72px; border-radius: 22px; display: grid; place-items: center;
    font-weight: 900; font-size: 26px; color: #fff; background: ${color};
    border: 4px solid #151821; box-shadow: 0 12px 30px ${color}55; overflow: hidden;
  }
  .icon img { width: 100%; height: 100%; object-fit: cover; }
  .badge {
    display: inline-block; margin-top: 14px; font-size: 11px; font-weight: 800;
    letter-spacing: .08em; text-transform: uppercase; color: #2aabee;
  }
  h1 { margin: 6px 0 8px; font-size: 28px; letter-spacing: -.03em; }
  p { margin: 0; color: #a8b0bb; line-height: 1.45; font-size: 15px; }
  .meta { display: flex; gap: 14px; margin: 16px 0 20px; color: #8b93a0; font-size: 13px; font-weight: 600; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: #23a55a; display: inline-block; margin-right: 6px; }
  .actions { display: flex; flex-wrap: wrap; gap: 10px; }
  a.btn {
    display: inline-flex; align-items: center; justify-content: center; border-radius: 999px;
    padding: 12px 18px; font-weight: 800; text-decoration: none; color: #fff;
    background: linear-gradient(110deg, #2aabee, #229ed9 55%, #c13584);
    box-shadow: 0 14px 40px #2aabee44;
  }
  a.ghost { background: #ffffff12; color: #e8ecf1; box-shadow: none; }
  footer { margin-top: 18px; font-size: 12px; color: #6d7480; word-break: break-all; }
</style>
</head><body>
<main class="card">
  <div class="banner"${preview.banner_url ? ` style="background-image:url('${esc(preview.banner_url)}')"` : ""}></div>
  <div class="body">
    <div class="icon">${
      preview.icon_url
        ? `<img src="${esc(preview.icon_url)}" alt=""/>`
        : esc(initials)
    }</div>
    <div class="badge">Nexus server invite</div>
    <h1>${esc(preview.name)}${preview.verified ? ` <span title="Verified server" style="display:inline-grid;place-items:center;width:22px;height:22px;border-radius:50%;background:#23A55A;color:#fff;font-size:13px;vertical-align:middle">✓</span>` : ""}</h1>
    <p>${esc(desc)}</p>
    <div class="meta">
      <span>${members.toLocaleString()} member${members === 1 ? "" : "s"}</span>
      <span><span class="dot"></span>Join on Nexus</span>
    </div>
    <div class="actions">
      <a class="btn" href="${esc(joinUrl)}">Join server</a>
      <a class="ghost btn" href="${esc(origin)}/">Open Nexus</a>
    </div>
    <footer>Share link: ${esc(pageUrl)}</footer>
  </div>
</main>
</body></html>`;
}

export function inviteNotFound(code: string, origin: string) {
  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Invite not found · Nexus</title>
<meta name="robots" content="noindex"/>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0d12;color:#fff;font-family:system-ui;padding:24px;text-align:center}
a{color:#2aabee}
</style></head><body>
<div>
  <h1>Invite not found</h1>
  <p style="color:#949ba4">“${esc(code)}” isn’t a valid Nexus server invite.</p>
  <p><a href="${esc(origin)}/">Back to Nexus</a></p>
</div>
</body></html>`;
}
