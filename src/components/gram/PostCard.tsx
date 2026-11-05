"use client";

import { useEffect, useRef, useState } from "react";
import { Bookmark, ChevronLeft, ChevronRight, Download, Flag, Heart, Link2, MessageCircle, Ellipsis, Repeat2, Rocket, Send, Share2, Trash2, X } from "lucide-react";
import { useApp, toast } from "@/store/app";
import { myRank } from "@/lib/admin";
import { boostGramPost, can, isBoosted } from "@/lib/privileges";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import { addComment, ago, comments, extractHashtags, fmt, GRAM_GENRES, GRAM_MOODS, gramGo, isSaved, mediaUrl, publicContentUrl, publicProfileUrl, removeComment, removePost, reportPost, resolvePostGenre, setLike, setSave, useGram, type Comment, type Post } from "@/lib/gram";
import Avatar from "@/components/ui/Avatar";
import NameTag from "@/components/ui/NameTag";

export function Author({ userId, sub, size = 34 }: { userId: string; sub?: string; size?: number }) {
  const p = useApp((s) => s.profiles[userId]);
  return (
    <button onClick={() => p && gramGo({ view: "profile", username: p.username })} className="flex min-w-0 items-center gap-2.5 text-left">
      <Avatar userId={userId} size={size} plain />
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">
          <NameTag userId={userId} badges={false} />
        </span>
        {sub && <span className="block truncate text-xs text-sub">{sub}</span>}
      </span>
    </button>
  );
}

/** big heart that pops on double-tap */
function Burst({ show }: { show: number }) {
  if (!show) return null;
  return (
    <div key={show} className="pointer-events-none absolute inset-0 grid place-items-center">
      <Heart className="size-28 animate-[gramheart_.8s_ease-out_forwards] fill-white text-white drop-shadow-[0_6px_20px_rgba(0,0,0,.45)]" />
    </div>
  );
}

export default function PostCard({ post, onRemoved }: { post: Post; onRemoved?: () => void }) {
  const meId = useApp((s) => s.userId);
  const author = useApp((s) => s.profiles[post.author_id]);
  const [liked, setLiked] = useState(!!post.liked);
  const [likes, setLikes] = useState(post.like_count);
  const [i, setI] = useState(0);
  const [burst, setBurst] = useState(0);
  const [showComments, setShowComments] = useState(false);
  const [menu, setMenu] = useState(false);
  const [more, setMore] = useState(false);
  const [saved, setSaved] = useState(!!post.saved);
  const [boosted, setBoosted] = useState(false);
  const lastTap = useRef(0);
  const m = post.media[i];
  const mine = post.author_id === meId;

  useEffect(() => {
    void isSaved(post.id).then(setSaved);
  }, [post.id]);
  useEffect(() => {
    setBoosted(isBoosted(post.id));
  }, [post.id]);

  const toggle = (force?: boolean) => {
    const on = force ?? !liked;
    if (on === liked) return;
    haptic.light();
    setLiked(on);
    setLikes((n) => n + (on ? 1 : -1));
    void setLike(post.id, on);
  };
  const tap = () => {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      toggle(true);
      setBurst(now);
    }
    lastTap.current = now;
  };

  return (
    <article className="overflow-hidden border-line/60 bg-chat sm:rounded-2xl sm:border">
      <header className="flex items-center gap-2 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <Author userId={post.author_id} sub={ago(post.created_at)} />
        </div>
        <div className="relative">
          <button onClick={() => setMenu(!menu)} className="tap-target grid place-items-center rounded-full hover:bg-hover" aria-label="More">
            <Ellipsis className="size-5" />
          </button>
          {menu && (
            <div className="absolute top-9 right-0 z-20 w-52 rounded-xl bg-menu p-1 shadow-2xl" onMouseLeave={() => setMenu(false)}>
              <button
                onClick={() => {
                  void navigator.clipboard.writeText(publicContentUrl(post.id));
                  toast("Share link copied (/n/…)", "success");
                  setMenu(false);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-hover"
              >
                <Link2 className="size-4" /> Copy /n/ link
              </button>
              {author && (
                <button
                  onClick={() => {
                    void navigator.clipboard.writeText(publicProfileUrl(author.username));
                    toast("Profile link copied", "success");
                    setMenu(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-hover"
                >
                  <Share2 className="size-4" /> Copy profile link
                </button>
              )}
              <button
                onClick={() => {
                  setMenu(false);
                  useGram.setState({ create: post.kind === "short" ? "short" : "post", remixOf: post.id });
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-hover"
              >
                <Repeat2 className="size-4" /> Remix
              </button>
              {mine && can.boostGram() && (
                <button
                  onClick={() => {
                    setMenu(false);
                    if (boostGramPost(post.id)) setBoosted(true);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-hover"
                  disabled={boosted}
                >
                  <Rocket className={cn("size-4", boosted && "text-[#eb459e]")} /> {boosted ? "Boosted (24h)" : "Boost (VIP)"}
                </button>
              )}
              {post.author_id !== meId && (
                <button
                  onClick={async () => {
                    setMenu(false);
                    const reason = prompt("Why are you reporting this post?");
                    if (reason?.trim()) await reportPost(post.id, reason);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-hover"
                >
                  <Flag className="size-4" /> Report
                </button>
              )}
              {(post.author_id === meId || (useApp.getState().profiles[meId ?? ""]?.site_role ?? "member") !== "member") && (
                <button
                  onClick={async () => {
                    setMenu(false);
                    if (confirm("Delete this post?") && (await removePost(post.id))) onRemoved?.();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-dnd hover:bg-dnd/10"
                >
                  <Trash2 className="size-4" /> Delete
                </button>
              )}
            </div>
          )}
        </div>
      </header>

      <div className="relative bg-black select-none" onClick={tap}>
        {m.type === "video" ? (
          <video
            src={mediaUrl(m.path)}
            poster={mediaUrl(m.poster)}
            controls
            playsInline
            loop
            controlsList={myRank() >= 1 ? undefined : "nodownload"}
            className="max-h-[78vh] w-full object-contain"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={mediaUrl(m.path)} alt={m.alt || post.caption || "NexusGram post"} loading="lazy" draggable={false} className="max-h-[78vh] w-full object-contain" style={m.w && m.h ? { aspectRatio: `${m.w}/${m.h}` } : undefined} />
        )}
        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
          {(() => {
            const g = resolvePostGenre(post);
            const meta = g ? GRAM_GENRES.find((x) => x.id === g) : null;
            return meta ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  gramGo({ view: "explore", genre: meta.id });
                }}
                className="rounded-full px-2.5 py-1 text-[11px] font-bold text-black shadow"
                style={{ background: meta.hue }}
              >
                {meta.label}
              </button>
            ) : null;
          })()}
          {post.mood && (
            <span className="rounded-full px-2.5 py-1 text-[11px] font-bold text-black shadow" style={{ background: GRAM_MOODS.find((x) => x.id === post.mood)?.hue || "#fff" }}>
              {GRAM_MOODS.find((x) => x.id === post.mood)?.label || post.mood}
            </span>
          )}
        </div>
        <div className="absolute top-3 right-3 flex items-center gap-1.5">
          {m.type === "video" && myRank() >= 1 && (
            <a
              href={mediaUrl(m.path)}
              download={`nexusgram-${post.id.slice(0, 8)}.mp4`}
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur"
              title="Download video (VIP+)"
            >
              <Download className="size-3.5" /> Save
            </a>
          )}
          {post.remix_of && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                gramGo({ view: "post", id: post.remix_of! });
              }}
              className="flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur"
            >
              <Repeat2 className="size-3.5" /> Remix
            </button>
          )}
        </div>
        <Burst show={burst} />
        {post.media.length > 1 && (
          <>
            {i > 0 && (
              <button onClick={(e) => (e.stopPropagation(), setI(i - 1))} className="absolute top-1/2 left-2 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-black shadow" aria-label="Previous">
                <ChevronLeft className="size-5" />
              </button>
            )}
            {i < post.media.length - 1 && (
              <button onClick={(e) => (e.stopPropagation(), setI(i + 1))} className="absolute top-1/2 right-2 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-black shadow" aria-label="Next">
                <ChevronRight className="size-5" />
              </button>
            )}
            <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1">
              {post.media.map((_, k) => (
                <span key={k} className={cn("size-1.5 rounded-full", k === i ? "bg-white" : "bg-white/45")} />
              ))}
            </div>
          </>
        )}
      </div>

      <div className="px-3 pt-2 pb-3">
        <div className="flex items-center gap-1">
          <button onClick={() => toggle()} className="tap-target grid place-items-center rounded-full active:scale-90" aria-label={liked ? "Unlike" : "Like"}>
            <Heart className={cn("size-7 transition", liked ? "fill-[#ff3040] text-[#ff3040]" : "")} />
          </button>
          <button onClick={() => setShowComments(true)} className="tap-target grid place-items-center rounded-full active:scale-90" aria-label="Comments">
            <MessageCircle className="size-7 -scale-x-100" />
          </button>
          <button
            onClick={() => {
              void navigator.clipboard.writeText(publicContentUrl(post.id));
              toast("Share link copied", "success");
            }}
            className="tap-target grid place-items-center rounded-full active:scale-90"
            aria-label="Share"
          >
            <Share2 className="size-6" />
          </button>
          {mine && can.boostGram() && (
            <button
              onClick={() => {
                if (boostGramPost(post.id)) setBoosted(true);
              }}
              className={cn("tap-target grid place-items-center rounded-full active:scale-90", boosted && "text-[#eb459e]")}
              aria-label="Boost post"
              title={boosted ? "Boosted for 24h" : "Boost (VIP)"}
            >
              <Rocket className={cn("size-6", boosted && "fill-current")} />
            </button>
          )}
          <button
            onClick={async () => {
              const on = !saved;
              if (await setSave(post.id, on)) {
                setSaved(on);
                haptic.light();
              }
            }}
            className="tap-target ml-auto grid place-items-center rounded-full active:scale-90"
            aria-label={saved ? "Unsave" : "Save"}
          >
            <Bookmark className={cn("size-6", saved && "fill-current")} />
          </button>
        </div>
        <div className="px-1 text-[11px] text-sub">{fmt(post.view_count)} views</div>
        <div className="px-1 text-sm font-semibold">{fmt(likes)} likes</div>
        {post.caption && (
          <p className={cn("px-1 text-sm whitespace-pre-wrap", !more && "line-clamp-2")} onClick={() => setMore(true)}>
            <b className="mr-1.5">{author?.username}</b>
            <CaptionText text={post.caption} />
          </p>
        )}
        {extractHashtags(post.caption).length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1.5 px-1">
            {extractHashtags(post.caption).slice(0, 6).map((t) => (
              <button key={t} onClick={() => gramGo({ view: "explore", tag: t })} className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] font-semibold text-[#9fb3ff] hover:bg-white/10">
                #{t}
              </button>
            ))}
          </div>
        )}
        {post.comment_count > 0 && (
          <button onClick={() => setShowComments(true)} className="px-1 pt-1 text-sm text-sub">
            View all {post.comment_count} comments
          </button>
        )}
      </div>
      {showComments && <CommentsSheet post={post} onClose={() => setShowComments(false)} />}
    </article>
  );
}

function CaptionText({ text }: { text: string }) {
  const parts = text.split(/(#[\p{L}\p{N}_]+)/gu);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("#") ? (
          <button
            key={i}
            type="button"
            className="font-semibold text-[#9fb3ff]"
            onClick={(e) => {
              e.stopPropagation();
              gramGo({ view: "explore", tag: p.slice(1).toLowerCase() });
            }}
          >
            {p}
          </button>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

export function CommentsSheet({ post, onClose }: { post: Post; onClose: () => void }) {
  const meId = useApp((s) => s.userId);
  const [rows, setRows] = useState<Comment[] | null>(null);
  const [text, setText] = useState("");
  useEffect(() => void comments(post.id).then(setRows), [post.id]);
  return (
    <div className="fixed inset-0 z-[85] flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
      <div className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-t-3xl bg-chat sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center border-b border-line/60 px-4 py-3">
          <div className="flex-1 text-center font-bold">Comments</div>
          <button onClick={onClose} className="grid size-8 place-items-center rounded-full hover:bg-hover" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        <div className="min-h-40 flex-1 space-y-3 overflow-y-auto p-4">
          {rows === null ? (
            <p className="text-center text-sm text-sub">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-sub">No comments yet. Start the conversation.</p>
          ) : (
            rows.map((c) => (
              <div key={c.id} className="group flex gap-2.5">
                <Avatar userId={c.author_id} size={32} plain />
                <div className="min-w-0 flex-1 text-sm">
                  <span className="mr-1.5 font-semibold">
                    <NameTag userId={c.author_id} badges={false} />
                  </span>
                  <span className="text-xs text-sub">{ago(c.created_at)}</span>
                  <p className="break-words whitespace-pre-wrap">{c.body}</p>
                </div>
                {(c.author_id === meId || post.author_id === meId) && (
                  <button onClick={async () => (await removeComment(c.id)) && setRows((r) => (r ?? []).filter((x) => x.id !== c.id))} className="text-sub opacity-0 group-hover:opacity-100 hover:text-dnd" aria-label="Delete comment">
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
            ))
          )}
        </div>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!text.trim()) return;
            const c = await addComment(post.id, text);
            if (c) {
              setRows((r) => [...(r ?? []), c]);
              setText("");
            }
          }}
          className="flex items-center gap-2 border-t border-line/60 p-3 pb-safe-3"
        >
          {meId && <Avatar userId={meId} size={32} plain />}
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a comment…" maxLength={1000} className="min-w-0 flex-1 rounded-full bg-black/25 px-4 py-2 text-sm outline-none" />
          <button disabled={!text.trim()} className="grid size-9 place-items-center rounded-full bg-accent text-white disabled:opacity-40" aria-label="Post comment">
            <Send className="size-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
