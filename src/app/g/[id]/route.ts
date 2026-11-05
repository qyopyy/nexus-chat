import { mediaUrl } from "@/lib/gramPageMedia";
import { absoluteUrl, esc, jsonLd, seoHead, socialPostingLd, truncate } from "@/lib/seo";

export const dynamic = "force-dynamic";

type Post = {
  id: string;
  author_id: string;
  kind: "post" | "short";
  media: { path: string; type: "image" | "video"; poster?: string | null; alt?: string | null; w?: number; h?: number }[];
  caption: string;
  like_count: number;
  comment_count: number;
  view_count: number;
  created_at: string;
  mood?: string | null;
};
type Profile = { id: string; username: string; display_name: string; avatar_url: string | null; avatar_color: string | null };

/** Public shareable post page: /g/<id> — canonical prefers /n/<id> */
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
      `<!doctype html><html lang="en"><head>${seoHead({ title: "Post not found · NexusGram", description: "This NexusGram post was removed or the link is wrong.", url: absoluteUrl(`/g/${postId}`, base), noindex: true })}</head><body style="background:#0b0b0f;color:#fff;font-family:system-ui;display:grid;place-items:center;min-height:100vh"><div style="text-align:center"><h1>Post not found</h1><p><a href="${base}" style="color:#9fb3ff">Go to Nexus</a></p></div></body></html>`,
      { status: 404, headers: html },
    );
  }

  const m = post.media[0];
  const cover = mediaUrl(m?.type === "video" ? m.poster : m?.path);
  const badge = post.kind === "short" ? "Short" : "Post";
  const title = `${author.display_name} (@${author.username}) · ${badge} on NexusGram`;
  const desc = truncate(post.caption || `${badge} by @${author.username} on NexusGram`);
  const canonical = absoluteUrl(`/n/${post.id}`, base);
  const publicUrl = absoluteUrl(`/g/${post.id}`, base);
  const app = absoluteUrl(`/gram/c/${post.id}`, base);
  const profileUrl = absoluteUrl(`/u/${author.username}`, base);
  const alt = m?.alt || post.caption || `${badge} by @${author.username}`;
  const tags = [...post.caption.matchAll(/#([\p{L}\p{N}_]+)/gu)].map((x) => x[1].toLowerCase()).slice(0, 8);
  if (post.mood) tags.unshift(post.mood);

  const ld = socialPostingLd({
    url: canonical,
    headline: title,
    description: desc,
    image: cover,
    datePublished: post.created_at,
    authorName: author.display_name,
    authorUrl: profileUrl,
    interactionStats: { likes: post.like_count, comments: post.comment_count, views: post.view_count },
  });

  const body = `<!doctype html><html lang="en"><head>
${seoHead({
  title,
  description: desc,
  url: publicUrl,
  canonical,
  image: cover,
  type: "article",
  keywords: ["NexusGram", author.username, badge, ...tags],
  publishedTime: post.created_at,
  authorName: author.display_name,
})}
${jsonLd(ld)}
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
  <div class="media">${m?.type === "video" ? `<video controls playsinline poster="${esc(mediaUrl(m.poster))}" src="${esc(mediaUrl(m.path))}"></video>` : `<img src="${esc(mediaUrl(m?.path))}" alt="${esc(alt)}">`}</div>
  ${post.caption ? `<div class="cap">${esc(post.caption)}</div>` : ""}
  <div class="meta">${post.like_count} likes · ${post.comment_count} comments · ${post.view_count} views</div>
</div>
<a class="cta" href="${app}">Open in NexusGram</a>
<p style="margin-top:18px;text-align:center;font-size:12px;color:rgba(255,255,255,.4)">Made with ❤️ by Nexus Project / qyopy · <a href="${esc(absoluteUrl("/", base))}" style="color:#9fb3ff">Share Nexus</a></p>
</div></body></html>`;

  return new Response(body, { headers: { ...html, "Cache-Control": "public, max-age=60, s-maxage=120" } });
}
