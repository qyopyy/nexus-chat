import { mediaUrl } from "@/lib/gramPageMedia";
import { absoluteUrl, esc, jsonLd, seoHead, socialPostingLd, truncate } from "@/lib/seo";

export const dynamic = "force-dynamic";

type Post = {
  id: string;
  author_id: string;
  kind: "post" | "short";
  media: { path: string; type: "image" | "video"; poster?: string | null; alt?: string | null }[];
  caption: string;
  like_count: number;
  comment_count: number;
  view_count: number;
  created_at: string;
  mood?: string | null;
};
type Story = {
  id: string;
  author_id: string;
  media: { path: string; type: "image" | "video"; poster?: string | null; alt?: string | null };
  caption: string;
  like_count: number;
  view_count: number;
  created_at: string;
  expires_at: string;
};
type Profile = { id: string; username: string; display_name: string; avatar_url: string | null; avatar_color: string | null };

/** Public shareable NexusGram content: /n/<id> (post or story) */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contentId = id.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 40);
  const base = new URL(req.url).origin;
  const html = { "Content-Type": "text/html; charset=utf-8" };
  const headers = {
    "Content-Type": "application/json",
    apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""}`,
  };

  let kind: "post" | "story" | null = null;
  let post: Post | null = null;
  let story: Story | null = null;
  let author: Profile | null = null;

  try {
    const pr = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/gram_posts?id=eq.${contentId}&select=*`, { headers, cache: "no-store" });
    if (pr.ok) {
      const rows = (await pr.json()) as Post[];
      if (rows[0]) {
        post = rows[0];
        kind = "post";
      }
    }
    if (!post) {
      const sr = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/gram_stories?id=eq.${contentId}&select=*`, { headers, cache: "no-store" });
      if (sr.ok) {
        const rows = (await sr.json()) as Story[];
        if (rows[0] && new Date(rows[0].expires_at).getTime() > Date.now()) {
          story = rows[0];
          kind = "story";
        }
      }
    }
    const authorId = post?.author_id ?? story?.author_id;
    if (authorId) {
      const ar = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/profiles?id=eq.${authorId}&select=id,username,display_name,avatar_url,avatar_color`, { headers, cache: "no-store" });
      if (ar.ok) author = ((await ar.json()) as Profile[])[0] ?? null;
    }
  } catch {
    /* */
  }

  if (!kind || !author || (!post && !story)) {
    return new Response(
      `<!doctype html><html lang="en"><head>${seoHead({ title: "Not found · NexusGram", description: "This NexusGram link is missing or expired.", url: absoluteUrl(`/n/${contentId}`, base), noindex: true })}</head><body style="background:#0b0b0f;color:#fff;font-family:system-ui;display:grid;place-items:center;min-height:100vh"><div style="text-align:center"><h1>Content not found</h1><p><a href="${base}" style="color:#9fb3ff">Go to Nexus</a></p></div></body></html>`,
      { status: 404, headers: html },
    );
  }

  const m = kind === "post" ? post!.media[0] : story!.media;
  const cover = mediaUrl(m?.type === "video" ? m.poster : m?.path);
  const caption = (kind === "post" ? post!.caption : story!.caption) || "";
  const badge = kind === "story" ? "Story" : post!.kind === "short" ? "Short" : "Post";
  const title = `${author.display_name} (@${author.username}) · ${badge} on NexusGram`;
  const desc = truncate(caption || `${badge} by @${author.username} on NexusGram`);
  const publicUrl = absoluteUrl(`/n/${contentId}`, base);
  const app = absoluteUrl(`/gram/c/${contentId}`, base);
  const profileUrl = absoluteUrl(`/u/${author.username}`, base);
  const likes = kind === "post" ? post!.like_count : story!.like_count;
  const views = kind === "post" ? post!.view_count : story!.view_count;
  const created = kind === "post" ? post!.created_at : story!.created_at;
  const alt = m?.alt || caption || `${badge} by @${author.username}`;
  const tags = [...caption.matchAll(/#([\p{L}\p{N}_]+)/gu)].map((x) => x[1].toLowerCase()).slice(0, 8);
  if (post?.mood) tags.unshift(post.mood);

  const ld = socialPostingLd({
    url: publicUrl,
    headline: title,
    description: desc,
    image: cover,
    datePublished: created,
    authorName: author.display_name,
    authorUrl: profileUrl,
    interactionStats: {
      likes,
      comments: kind === "post" ? post!.comment_count : undefined,
      views,
    },
  });

  const body = `<!doctype html><html lang="en"><head>
${seoHead({
  title,
  description: desc,
  url: publicUrl,
  image: cover,
  type: "article",
  keywords: ["NexusGram", author.username, badge, ...tags],
  publishedTime: created,
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
.badge{margin-left:auto;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:rgba(255,255,255,.55);border:1px solid rgba(255,255,255,.12);padding:4px 8px;border-radius:999px}
.media{background:#000;aspect-ratio:1;display:grid;place-items:center}
.media img,.media video{width:100%;height:100%;object-fit:contain;max-height:70vh}
.cap{padding:14px;white-space:pre-wrap}.meta{padding:0 14px 16px;color:rgba(255,255,255,.45);font-size:13px}
.cta{display:block;margin-top:18px;text-align:center;background:#fff;color:#000;padding:14px;border-radius:999px;font-weight:800;text-decoration:none}
.tags{display:flex;flex-wrap:wrap;gap:6px;padding:0 14px 14px}
.tags span{font-size:12px;font-weight:600;color:#9fb3ff;background:rgba(159,179,255,.1);padding:4px 8px;border-radius:999px}
</style></head><body><div class="wrap">
<div class="top"><div class="logo"><b>N</b>NexusGram</div><a class="open" href="${app}">Open in Nexus</a></div>
<div class="card">
  <div class="head">${author.avatar_url ? `<img class="av" src="${esc(author.avatar_url)}" alt="">` : `<div class="av ph" style="background:${esc(author.avatar_color || "#333")}">${esc((author.display_name || author.username).slice(0, 2).toUpperCase())}</div>`}
    <div><div class="name"><a href="${esc(profileUrl)}" style="color:inherit;text-decoration:none">${esc(author.display_name)}</a></div><div class="user">@${esc(author.username)}</div></div>
    <span class="badge">${esc(badge)}</span>
  </div>
  <div class="media">${m?.type === "video" ? `<video controls playsinline poster="${esc(mediaUrl(m.poster))}" src="${esc(mediaUrl(m.path))}"></video>` : `<img src="${esc(mediaUrl(m?.path))}" alt="${esc(alt)}">`}</div>
  ${caption ? `<div class="cap">${esc(caption)}</div>` : ""}
  ${tags.length ? `<div class="tags">${tags.map((t) => `<span>#${esc(t)}</span>`).join("")}</div>` : ""}
  <div class="meta">${likes} likes · ${views} views${kind === "post" ? ` · ${post!.comment_count} comments` : ""}</div>
</div>
<a class="cta" href="${app}">Open in NexusGram</a>
<p style="margin-top:18px;text-align:center;font-size:12px;color:rgba(255,255,255,.4)">Made with ❤️ by Nexus Project / qyopy · <a href="${esc(absoluteUrl("/", base))}" style="color:#9fb3ff">Share Nexus</a></p>
</div></body></html>`;

  return new Response(body, { headers: { ...html, "Cache-Control": "public, max-age=60, s-maxage=120" } });
}
