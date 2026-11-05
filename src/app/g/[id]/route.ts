import { mediaUrl } from "@/lib/gramPageMedia";

export const dynamic = "force-dynamic";

type Post = {
  id: string;
  author_id: string;
  kind: "post" | "short";
  media: { path: string; type: "image" | "video"; poster?: string | null; w?: number; h?: number }[];
  caption: string;
  like_count: number;
  comment_count: number;
  view_count: number;
  created_at: string;
};
type Profile = { id: string; username: string; display_name: string; avatar_url: string | null; avatar_color: string | null };

/** Public shareable post page: /g/<id> */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const postId = id.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 40);
  const base = new URL(req.url).origin;
  const html = { "Content-Type": "text/html; charset=utf-8" };
  const headers = {
    "Content-Type": "application/json",
    apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""}`,
  };

  let post: Post | null = null;
  let author: Profile | null = null;
  try {
    const r = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/gram_posts?id=eq.${postId}&select=*`, { headers, cache: "no-store" });
    if (r.ok) {
      const rows = (await r.json()) as Post[];
      post = rows[0] ?? null;
    }
    if (post) {
      const pr = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/profiles?id=eq.${post.author_id}&select=id,username,display_name,avatar_url,avatar_color`, { headers, cache: "no-store" });
      if (pr.ok) author = ((await pr.json()) as Profile[])[0] ?? null;
    }
  } catch {
    /* */
  }

  if (!post || !author) {
    return new Response(
      `<!doctype html><html><head><meta charset="utf-8"><title>Post not found · NexusGram</title></head><body style="background:#0b0b0f;color:#fff;font-family:system-ui;display:grid;place-items:center;min-height:100vh"><div style="text-align:center"><h1>Post not found</h1><p><a href="${base}" style="color:#9fb3ff">Go to Nexus</a></p></div></body></html>`,
      { status: 404, headers: html },
    );
  }

  const m = post.media[0];
  const cover = mediaUrl(m?.type === "video" ? m.poster : m?.path);
  const title = `${author.display_name} (@${author.username}) on NexusGram`;
  const desc = (post.caption || `${post.kind === "short" ? "Short" : "Post"} by @${author.username}`).slice(0, 160);
  const app = `${base}/gram/p/${post.id}`;
  const body = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(`${base}/g/${post.id}`)}">
${cover ? `<meta property="og:image" content="${esc(cover)}"><meta name="twitter:image" content="${esc(cover)}">` : ""}
<meta name="twitter:card" content="summary_large_image"><meta name="theme-color" content="#0b0b0f">
<style>
*{box-sizing:border-box;margin:0}body{background:#0b0b0f;color:#f5f5f7;font:15px/1.45 system-ui,-apple-system,sans-serif}
.wrap{max-width:520px;margin:0 auto;padding:24px 16px 60px}
.top{display:flex;align-items:center;gap:10px;margin-bottom:18px}
.logo{font-weight:800;letter-spacing:-.02em}.logo b{display:inline-grid;place-items:center;width:28px;height:28px;border-radius:8px;background:#fff;color:#000;margin-right:8px}
.open{margin-left:auto;background:#fff;color:#000;padding:8px 14px;border-radius:999px;font-weight:700;font-size:13px;text-decoration:none}
.card{border:1px solid rgba(255,255,255,.08);border-radius:20px;overflow:hidden;background:#121218}
.head{display:flex;align-items:center;gap:10px;padding:14px}
.av{width:40px;height:40px;border-radius:50%;object-fit:cover;background:#333}
.av.ph{display:grid;place-items:center;font-weight:700}
.name{font-weight:700}.user{color:rgba(255,255,255,.45);font-size:13px}
.media{background:#000;aspect-ratio:1;display:grid;place-items:center}
.media img,.media video{width:100%;height:100%;object-fit:contain;max-height:70vh}
.cap{padding:14px;white-space:pre-wrap}.meta{padding:0 14px 16px;color:rgba(255,255,255,.45);font-size:13px}
.cta{display:block;margin-top:18px;text-align:center;background:#fff;color:#000;padding:14px;border-radius:999px;font-weight:800;text-decoration:none}
</style></head><body><div class="wrap">
<div class="top"><div class="logo"><b>N</b>NexusGram</div><a class="open" href="${app}">Open in Nexus</a></div>
<div class="card">
  <div class="head">${author.avatar_url ? `<img class="av" src="${esc(author.avatar_url)}" alt="">` : `<div class="av ph" style="background:${esc(author.avatar_color || "#333")}">${esc((author.display_name || author.username).slice(0, 2).toUpperCase())}</div>`}
    <div><div class="name">${esc(author.display_name)}</div><div class="user">@${esc(author.username)}</div></div>
  </div>
  <div class="media">${m?.type === "video" ? `<video controls playsinline poster="${esc(mediaUrl(m.poster))}" src="${esc(mediaUrl(m.path))}"></video>` : `<img src="${esc(mediaUrl(m?.path))}" alt="">`}</div>
  ${post.caption ? `<div class="cap">${esc(post.caption)}</div>` : ""}
  <div class="meta">${post.like_count} likes · ${post.comment_count} comments · ${post.view_count} views</div>
</div>
<a class="cta" href="${app}">Open in NexusGram</a>
</div></body></html>`;

  return new Response(body, { headers: { ...html, "Cache-Control": "public, max-age=60" } });
}

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
