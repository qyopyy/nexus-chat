// Server-only: public vault share page (/s/<token>) rendered as plain HTML (no app, no password gate).

const FN = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/share`;

export type ShareInfo = { ok: boolean; reason?: string; name?: string; mime?: string | null; bytes?: number; owner?: string; password?: boolean; download?: boolean; expires_at?: string | null; left?: number | null };

export async function callShare<T>(body: Record<string, unknown>): Promise<T | null> {
  try {
    const r = await fetch(FN, { method: "POST", headers: { "Content-Type": "application/json", apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "" }, body: JSON.stringify(body), cache: "no-store" });
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const size = (n = 0) => (n >= 1073741824 ? `${(n / 1073741824).toFixed(1)} GB` : n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const REASON: Record<string, string> = {
  missing: "This link doesn't exist or was turned off by its owner.",
  expired: "This link has expired.",
  used_up: "This link reached its download limit.",
  password: "Wrong password — try again.",
  no_download: "The owner allows previewing this file, but not downloading it.",
  locked: "Too many wrong passwords. Try again in 10 minutes.",
  storage: "The file couldn't be loaded. Try again later.",
};

const shell = (title: string, body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title>
<style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:radial-gradient(1200px 600px at 50% -10%,#24264a,#0b0b0f 60%);color:#f2f3f5;font:16px/1.45 -apple-system,Segoe UI,Roboto,sans-serif;padding:16px}
.card{width:100%;max-width:440px;background:#16171d;border:1px solid #ffffff14;border-radius:24px;padding:24px;box-shadow:0 30px 80px #0008}
.ico{width:64px;height:64px;border-radius:18px;display:grid;place-items:center;font-size:30px;background:linear-gradient(135deg,#5865f2,#eb459e);margin-bottom:14px}
h1{font-size:20px;margin:0 0 4px;word-break:break-word}.sub{color:#b5bac1;font-size:14px}.err{background:#ed424522;color:#ff8a8c;border-radius:12px;padding:10px 12px;font-size:14px;margin:14px 0 0}
input{width:100%;margin-top:14px;padding:12px 14px;border-radius:12px;border:1px solid #ffffff22;background:#0b0b0f;color:#fff;font-size:16px}
button{width:100%;margin-top:12px;padding:13px;border:0;border-radius:999px;font-weight:800;font-size:15px;cursor:pointer;background:#fff;color:#000}
button.ghost{background:#ffffff14;color:#fff}audio,video,img{width:100%;margin-top:16px;border-radius:14px;background:#000}
.foot{margin-top:18px;text-align:center;color:#80848e;font-size:12px}.foot a{color:#b5bac1}
</style></head><body><div class="card">${body}<div class="foot">🔒 Shared privately with <a href="/">Nexus Vault</a></div></div></body></html>`;

function icon(mime?: string | null) {
  if (!mime) return "📄";
  if (mime.startsWith("audio/")) return "🎵";
  if (mime.startsWith("video/")) return "🎬";
  if (mime.startsWith("image/")) return "🖼️";
  if (mime.includes("pdf")) return "📕";
  if (mime.includes("zip")) return "🗜️";
  return "📄";
}

export function renderShare(token: string, info: ShareInfo, error?: string) {
  if (!info?.ok) return shell("Link unavailable", `<div class="ico">🔒</div><h1>${esc(info?.name ?? "Link unavailable")}</h1><p class="sub">${esc(REASON[info?.reason ?? "missing"] ?? REASON.missing)}</p>`);
  const t = encodeURIComponent(token);
  const meta = [size(info.bytes), info.owner ? `shared by ${esc(info.owner)}` : "", info.expires_at ? `expires ${new Date(info.expires_at).toUTCString().slice(5, 22)} UTC` : "", info.left != null ? `${info.left} download${info.left === 1 ? "" : "s"} left` : ""].filter(Boolean).join(" · ");
  const m = info.mime ?? "";
  const preview = !info.password && /^(audio|video|image)\//.test(m) ? (m.startsWith("audio/") ? `<audio controls preload="none" src="/s/${t}/get?mode=preview"></audio>` : m.startsWith("video/") ? `<video controls preload="none" src="/s/${t}/get?mode=preview"></video>` : `<img alt="" src="/s/${t}/get?mode=preview">`) : "";
  return shell(
    info.name ?? "Shared file",
    `<div class="ico">${icon(m)}</div><h1>${esc(info.name)}</h1><div class="sub">${meta}</div>${preview}
<form method="post" action="/s/${t}/get">
${info.password ? `<input type="password" name="password" placeholder="Password" autocomplete="off" required autofocus>` : ""}
${error ? `<div class="err">${esc(REASON[error] ?? error)}</div>` : ""}
${info.download ? `<button name="mode" value="download">⬇ Download</button>` : ""}
${info.password || !info.download ? `<button class="ghost" name="mode" value="preview">Open</button>` : ""}
</form>`,
  );
}
