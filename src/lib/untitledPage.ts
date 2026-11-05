// Server-only: public Untitled share (/t/<token>) and profile (/m/<username>) HTML.

const FN = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/untitled`;
const API = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc`;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export type ShareInfo = {
  ok: boolean;
  reason?: string;
  password?: boolean;
  permission?: string;
  title?: string;
  owner?: string;
  owner_name?: string;
  color?: string;
  note?: string | null;
  track_count?: number;
  download?: boolean;
};

export type ShareOpen = ShareInfo & {
  share_id?: string;
  project_id?: string;
  tracks?: { id: string; title: string; mime: string | null; bytes: number; duration: number | null; position: number; path: string; url?: string }[];
};

export async function callUntitled<T>(body: Record<string, unknown>): Promise<T | null> {
  try {
    const r = await fetch(FN, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: KEY },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

export async function fetchUntitledProfile(username: string) {
  try {
    const r = await fetch(`${API}/untitled_profile`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: KEY, Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({ p_username: username }),
      cache: "no-store",
    });
    if (!r.ok) return null;
    return (await r.json()) as {
      id: string;
      username: string;
      display_name: string;
      avatar_url: string | null;
      avatar_color: string;
      bio: string | null;
      followers: number;
      following: number;
      projects: { id: string; title: string; color: string; track_count: number; listen_count: number; note: string | null }[];
    } | null;
  } catch {
    return null;
  }
}

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const shell = (title: string, body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title>
<style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(900px 500px at 40% -10%,#3a2f24,#12100e 55%);color:#f3efe6;font:16px/1.45 ui-sans-serif,system-ui,-apple-system,sans-serif;padding:20px}
.wrap{max-width:520px;margin:0 auto}.card{background:#1a1714;border:1px solid #ffffff12;border-radius:24px;padding:22px;box-shadow:0 30px 80px #0008}
.badge{font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:#c4a574cc;font-weight:600}
h1{font-size:28px;margin:8px 0 4px;font-weight:600;letter-spacing:-.02em}.sub{color:#8a8478;font-size:14px}
.err{background:#b07a8a22;color:#e8b4c0;border-radius:12px;padding:10px 12px;font-size:14px;margin-top:14px}
input{width:100%;margin-top:14px;padding:12px 14px;border-radius:12px;border:1px solid #ffffff22;background:#12100e;color:#fff;font-size:16px}
button,a.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;width:100%;margin-top:12px;padding:13px;border:0;border-radius:999px;font-weight:700;font-size:15px;cursor:pointer;background:#c4a574;color:#12100e;text-decoration:none}
a.ghost,button.ghost{background:#ffffff12;color:#f3efe6}
.track{display:flex;align-items:center;gap:12px;padding:10px 0;border-top:1px solid #ffffff0d}
.track:first-child{border-top:0;margin-top:8px}.track b{font-size:14px;font-weight:600}.track span{font-size:12px;color:#8a8478}
.dot{width:36px;height:36px;border-radius:999px;background:#c4a57422;color:#c4a574;display:grid;place-items:center;font-size:12px;flex-shrink:0}
.stats{display:flex;gap:24px;margin:16px 0}.stats div{text-align:center}.stats b{display:block;font-size:18px}.stats span{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#8a8478}
.proj{display:flex;gap:12px;align-items:center;padding:12px;border-radius:16px;background:#ffffff08;margin-top:8px;text-decoration:none;color:inherit}
.swatch{width:44px;height:44px;border-radius:12px;flex-shrink:0}
.foot{margin-top:18px;text-align:center;color:#8a8478;font-size:12px}.foot a{color:#cfc8ba}
audio{width:100%;margin-top:8px}
</style></head><body><div class="wrap">${body}<div class="foot">Shared with <a href="/">Nexus Cutroom</a></div></div></body></html>`;

const REASON: Record<string, string> = {
  missing: "This link doesn't exist or was turned off.",
  expired: "This link has expired.",
  password: "Wrong password — try again.",
  locked: "Too many wrong passwords. Try again later.",
  storage: "Audio couldn't be loaded. Try again later.",
};

export function renderSharePage(token: string, info: ShareInfo, open?: ShareOpen | null, error?: string) {
  if (!info?.ok) {
    return shell("Link unavailable", `<div class="card"><div class="badge">Cutroom</div><h1>Link unavailable</h1><p class="sub">${esc(REASON[info?.reason ?? "missing"])}</p></div>`);
  }
  if (info.password && !open) {
    return shell(
      info.title ?? "Shared cut",
      `<div class="card"><div class="badge">Cutroom · protected</div><h1>${esc(info.title)}</h1>
      <p class="sub">by @${esc(info.owner)}${info.track_count != null ? ` · ${info.track_count} tracks` : ""}</p>
      <form method="POST"><input type="password" name="password" placeholder="Password" required autofocus>
      ${error ? `<div class="err">${esc(REASON[error] ?? error)}</div>` : ""}
      <button type="submit">Unlock</button></form>
      <a class="btn ghost" href="/m/${esc(info.owner)}">View profile</a></div>`,
    );
  }
  const data = open ?? (info as ShareOpen);
  const tracks = (data.tracks ?? [])
    .map(
      (t, i) => `<div class="track"><div class="dot">${i + 1}</div><div style="flex:1;min-width:0"><b>${esc(t.title)}</b><br><span>${t.duration != null ? `${Math.floor(t.duration / 60)}:${String(Math.floor(t.duration % 60)).padStart(2, "0")}` : "—"}</span>
      ${t.url ? `<audio controls preload="none" src="${esc(t.url)}"></audio>` : ""}
      ${data.download && t.url ? `<a class="btn ghost" style="margin-top:8px;padding:8px" href="${esc(t.url)}" download="${esc(t.title)}">Download</a>` : ""}</div></div>`,
    )
    .join("");
  return shell(
    data.title ?? "Shared cut",
    `<div class="card"><div class="badge">Cutroom · ${esc(data.permission ?? "listen")}</div><h1>${esc(data.title)}</h1>
    <p class="sub">by @${esc(data.owner)}${data.note ? ` · ${esc(data.note)}` : ""}</p>
    ${error ? `<div class="err">${esc(REASON[error] ?? error)}</div>` : ""}
    ${tracks || `<p class="sub" style="margin-top:16px">No tracks in this cut yet.</p>`}
    <a class="btn ghost" href="/m/${esc(data.owner)}">@${esc(data.owner)} on Cutroom</a>
    <a class="btn ghost" href="/">Open in Nexus</a></div>`,
  );
}

export function renderProfilePage(p: NonNullable<Awaited<ReturnType<typeof fetchUntitledProfile>>>) {
  const projects = (p.projects ?? [])
    .map(
      (pr) => `<div class="proj"><div class="swatch" style="background:${esc(pr.color)}"></div><div><b>${esc(pr.title)}</b><div class="sub">${pr.track_count} tracks · ${pr.listen_count} listens</div></div></div>`,
    )
    .join("");
  return shell(
    `${p.display_name} (@${p.username}) · Cutroom`,
    `<div class="card"><div class="badge">Cutroom profile</div><h1>${esc(p.display_name)}</h1>
    <p class="sub">@${esc(p.username)}</p>
    ${p.bio ? `<p class="sub" style="margin-top:10px">${esc(p.bio)}</p>` : ""}
    <div class="stats"><div><b>${p.followers}</b><span>Followers</span></div><div><b>${p.following}</b><span>Following</span></div><div><b>${(p.projects ?? []).length}</b><span>Projects</span></div></div>
    <h2 style="font-size:14px;margin:18px 0 4px;color:#cfc8ba">Public projects</h2>
    ${projects || `<p class="sub">No public projects yet.</p>`}
    <a class="btn" href="/untitled/${esc(p.username)}">Open in Nexus</a></div>`,
  );
}
