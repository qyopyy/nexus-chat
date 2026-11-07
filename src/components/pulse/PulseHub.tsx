"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Bookmark, Heart, MessageCircle, Repeat2, Send, Trash2 } from "lucide-react";
import { useApp, toast } from "@/store/app";
import { cn } from "@/lib/utils";
import Avatar from "@/components/ui/Avatar";
import {
  extractPulseHashtags,
  openPulse,
  pulseAgo,
  pulseByTag,
  pulseCreate,
  pulseDelete,
  pulseFeed,
  pulseFollowingIds,
  pulseGet,
  pulseGo,
  pulseHome,
  pulseLike,
  pulseProfile,
  pulseReplies,
  pulseRepost,
  pulseSetFollow,
  pulseToggleBookmark,
  pulseTrendingTags,
  usePulse,
  type PulsePost,
} from "@/lib/pulse";
import { can, pulseMaxChars } from "@/lib/privileges";

type ProfileView = Awaited<ReturnType<typeof pulseProfile>>;
type FeedMode = "foryou" | "following";

function renderPulseBody(body: string, onTag: (tag: string) => void, onMention: (username: string) => void) {
  const parts = body.split(/((?:https?:\/\/[^\s]+)|(?:#[\p{L}\p{N}_]+)|(?:@[a-zA-Z0-9_.]{1,24}))/gu);
  return parts.map((part, i) => {
    if (/^https?:\/\//.test(part)) {
      return (
        <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-[#1d9bf0] hover:underline" onClick={(e) => e.stopPropagation()}>
          {part.length > 42 ? `${part.slice(0, 40)}…` : part}
        </a>
      );
    }
    if (part.startsWith("#")) {
      const tag = part.slice(1);
      return (
        <button key={i} type="button" className="font-semibold text-[#1d9bf0] hover:underline" onClick={(e) => (e.stopPropagation(), onTag(tag))}>
          {part}
        </button>
      );
    }
    if (part.startsWith("@")) {
      const username = part.slice(1);
      return (
        <button key={i} type="button" className="font-semibold text-[#1d9bf0] hover:underline" onClick={(e) => (e.stopPropagation(), onMention(username))}>
          {part}
        </button>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export default function PulseHub({ mobile }: { mobile?: boolean }) {
  const me = useApp((s) => s.userId);
  const profiles = useApp((s) => s.profiles);
  const stack = usePulse((s) => s.stack);
  const route = stack[stack.length - 1] ?? { view: "home" as const };
  const [tab, setTab] = useState<"home" | "compose" | "profile" | "bookmarks">("home");
  const [mode, setMode] = useState<FeedMode>("foryou");
  const [feed, setFeed] = useState<PulsePost[]>([]);
  const [profile, setProfile] = useState<ProfileView>(null);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<PulsePost | null>(null);
  const [thread, setThread] = useState<{ post: PulsePost; replies: PulsePost[] } | null>(null);
  const [tagRows, setTagRows] = useState<PulsePost[] | null>(null);
  const [trending, setTrending] = useState<{ tag: string; count: number }[]>([]);
  const [busy, setBusy] = useState(false);
  const [following, setFollowing] = useState<Set<string>>(new Set());
  const [bookmarkIds, setBookmarkIds] = useState<string[]>([]);

  const refreshFeed = useCallback(async () => {
    const rows = await pulseFeed(null, mode);
    setFeed(rows);
  }, [mode]);

  const refreshProfile = useCallback(async () => {
    const username = me ? profiles[me]?.username : null;
    if (!username) return;
    const p = await pulseProfile(username);
    setProfile(p);
  }, [me, profiles]);

  const openThread = useCallback(async (id: string) => {
    const post = await pulseGet(id);
    if (!post) return toast("Post not found", "error");
    const replies = await pulseReplies(id);
    setThread({ post, replies });
    pulseGo({ view: "post", id });
  }, []);

  useEffect(() => {
    void refreshFeed();
    void pulseTrendingTags().then(setTrending);
    void pulseFollowingIds().then(setFollowing);
  }, [refreshFeed]);

  useEffect(() => {
    if (route.view === "tag") {
      setTagRows(null);
      void pulseByTag(route.tag).then(setTagRows);
    } else {
      setTagRows(null);
    }
    if (route.view === "post") {
      void openThread(route.id);
    }
    if (route.view === "profile") {
      void pulseProfile(route.username).then(setProfile);
      setTab("profile");
    }
  }, [route, openThread]);

  const suggestedTags = useMemo(() => extractPulseHashtags(draft), [draft]);

  const bumpPost = (id: string, fn: (p: PulsePost) => PulsePost) => {
    setFeed((f) => f.map((x) => (x.id === id ? fn(x) : x)));
    setTagRows((f) => (f ? f.map((x) => (x.id === id ? fn(x) : x)) : f));
    if (profile) setProfile({ ...profile, posts: profile.posts.map((x) => (x.id === id ? fn(x) : x)) });
    if (thread?.post.id === id) setThread({ ...thread, post: fn(thread.post) });
    if (thread) setThread((t) => (t ? { ...t, replies: t.replies.map((x) => (x.id === id ? fn(x) : x)) } : t));
  };

  const submit = async () => {
    if (!draft.trim() || busy) return;
    setBusy(true);
    try {
      await pulseCreate(draft.trim(), replyTo?.id ?? null);
      setDraft("");
      setReplyTo(null);
      setTab("home");
      pulseHome();
      await refreshFeed();
      if (thread) await openThread(thread.post.id);
      toast(replyTo ? "Reply posted" : "Posted", "success");
    } catch (err) {
      toast(String((err as Error).message ?? err), "error");
    } finally {
      setBusy(false);
    }
  };

  const listForTab = (): PulsePost[] => {
    if (route.view === "tag") return tagRows ?? [];
    if (tab === "profile") return profile?.posts ?? [];
    if (tab === "bookmarks") return feed.filter((p) => bookmarkIds.includes(p.id) || p.bookmarked);
    return feed;
  };

  const showingThread = route.view === "post" && thread;

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-black text-white">
      <header className={cn("flex shrink-0 items-center gap-2 border-b border-white/10 px-3", mobile ? "pt-safe-3 pb-2" : "h-12")}>
        <button
          onClick={() => {
            if (stack.length > 1) {
              usePulse.setState((s) => ({ stack: s.stack.slice(0, -1) }));
              setThread(null);
              return;
            }
            useApp.setState(mobile ? { hub: null, mobileTab: "gram" } : { hub: "gram" });
          }}
          className="grid size-9 place-items-center rounded-full hover:bg-white/5"
          aria-label="Back"
        >
          <ArrowLeft className="size-5" />
        </button>
        <div className="min-w-0">
          <div className="font-semibold tracking-tight">Pulse</div>
          {route.view === "tag" && <div className="truncate text-[11px] text-white/45">#{route.tag}</div>}
        </div>
        <div className="ml-auto flex gap-1 rounded-full bg-white/5 p-0.5 text-xs font-semibold">
          {(
            [
              ["home", "Home"],
              ["compose", "Post"],
              ["bookmarks", "Saved"],
              ["profile", "You"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => {
                setTab(id);
                setThread(null);
                pulseHome();
                if (id === "profile") void refreshProfile();
                if (id === "home") void refreshFeed();
                if (id === "bookmarks") {
                  setBookmarkIds(JSON.parse(localStorage.getItem("nexus:pulse:bookmarks") || "[]") as string[]);
                  void refreshFeed();
                }
              }}
              className={cn("rounded-full px-2.5 py-1.5 sm:px-3", tab === id && route.view === "home" ? "bg-white text-black" : "text-white/60")}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-xl">
          {tab === "home" && route.view === "home" && (
            <>
              <div className="flex border-b border-white/10 text-sm font-semibold">
                {(
                  [
                    ["foryou", "For you"],
                    ["following", "Following"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => setMode(id)}
                    className={cn("flex-1 py-3", mode === id ? "border-b-2 border-[#1d9bf0] text-white" : "text-white/45 hover:bg-white/[0.03]")}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {trending.length > 0 && (
                <div className="flex gap-1.5 overflow-x-auto border-b border-white/10 px-3 py-2.5">
                  {trending.map((t) => (
                    <button
                      key={t.tag}
                      onClick={() => pulseGo({ view: "tag", tag: t.tag })}
                      className="shrink-0 rounded-full bg-white/5 px-3 py-1 text-xs font-semibold text-[#1d9bf0] hover:bg-white/10"
                    >
                      #{t.tag}
                      <span className="ml-1 text-white/35">{t.count}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {(tab === "compose" || replyTo) && (
            <form
              className="border-b border-white/10 p-4"
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              {replyTo && (
                <div className="mb-2 flex items-center justify-between rounded-xl bg-white/5 px-3 py-2 text-xs text-white/55">
                  <span>
                    Replying to <span className="font-semibold text-[#1d9bf0]">@{profiles[replyTo.author_id]?.username ?? "…"}</span>
                  </span>
                  <button type="button" onClick={() => setReplyTo(null)} className="text-white/40 hover:text-white">
                    Cancel
                  </button>
                </div>
              )}
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value.slice(0, pulseMaxChars()))}
                rows={4}
                placeholder={replyTo ? "Post your reply" : can.longPulse() ? "What’s happening? VIP · 400 chars · #hashtags" : "What’s happening? Use #hashtags"}
                className="w-full resize-none bg-transparent text-lg outline-none placeholder:text-white/35"
                autoFocus={tab === "compose" || !!replyTo}
              />
              {suggestedTags.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1">
                  {suggestedTags.map((t) => (
                    <span key={t} className="rounded-full bg-[#1d9bf0]/15 px-2 py-0.5 text-[11px] font-semibold text-[#1d9bf0]">
                      #{t}
                    </span>
                  ))}
                </div>
              )}
              <div className="mt-2 flex items-center justify-between">
                <span className={cn("text-xs", draft.length > pulseMaxChars() - 20 ? "text-amber-400" : "text-white/40")}>
                  {draft.length}/{pulseMaxChars()}
                  {can.longPulse() && <span className="ml-1 text-[#eb459e]">VIP</span>}
                </span>
                <button type="submit" disabled={busy || !draft.trim()} className="inline-flex items-center gap-2 rounded-full bg-[#1d9bf0] px-4 py-2 text-sm font-bold disabled:opacity-40">
                  <Send className="size-4" /> {replyTo ? "Reply" : "Post"}
                </button>
              </div>
            </form>
          )}

          {tab === "profile" && profile && route.view !== "tag" && !showingThread && (
            <div className="border-b border-white/10 p-4">
              <div className="flex items-center gap-3">
                <Avatar userId={profile.id as string} size={56} plain />
                <div>
                  <div className="text-lg font-bold">@{(profile as { username: string }).username}</div>
                  <div className="text-sm text-white/50">
                    {profile.following} following · {profile.followers} followers
                  </div>
                  {(profile as { bio?: string | null }).bio && <p className="mt-1 text-sm text-white/70">{(profile as { bio?: string | null }).bio}</p>}
                </div>
              </div>
            </div>
          )}

          {route.view === "tag" && (
            <div className="border-b border-white/10 px-4 py-3">
              <p className="text-xl font-black">#{route.tag}</p>
              <p className="text-sm text-white/45">{tagRows === null ? "Loading…" : `${tagRows.length} posts`}</p>
            </div>
          )}

          {showingThread && (
            <div>
              <PulseCard
                post={thread.post}
                following={following.has(thread.post.author_id)}
                expanded
                onLike={async (on) => {
                  const ok = await pulseLike(thread.post.id, on);
                  if (!ok) return;
                  bumpPost(thread.post.id, (x) => ({ ...x, liked: on, like_count: Math.max(0, x.like_count + (on ? 1 : -1)) }));
                }}
                onRepost={() => void pulseRepost(thread.post.id).then(() => refreshFeed())}
                onFollow={async (on) => {
                  const ok = await pulseSetFollow(thread.post.author_id, on);
                  if (!ok) return;
                  setFollowing((prev) => {
                    const n = new Set(prev);
                    if (on) n.add(thread.post.author_id);
                    else n.delete(thread.post.author_id);
                    return n;
                  });
                }}
                onReply={() => {
                  setReplyTo(thread.post);
                  setTab("compose");
                }}
                onOpen={() => {}}
                onTag={(t) => pulseGo({ view: "tag", tag: t })}
                onMention={(u) => void pulseProfile(u).then((p) => p && (setProfile(p), setTab("profile"), pulseGo({ view: "profile", username: u })))}
                onBookmark={() => {
                  const on = pulseToggleBookmark(thread.post.id);
                  bumpPost(thread.post.id, (x) => ({ ...x, bookmarked: on }));
                  toast(on ? "Saved" : "Removed", "success");
                }}
                onDelete={async () => {
                  if (!confirm("Delete this post?") || !(await pulseDelete(thread.post.id))) return;
                  setThread(null);
                  pulseHome();
                  await refreshFeed();
                }}
              />
              <div className="border-b border-white/10 px-4 py-2 text-xs font-semibold tracking-wide text-white/40 uppercase">Replies</div>
              {thread.replies.map((p) => (
                <PulseCard
                  key={p.id}
                  post={p}
                  following={following.has(p.author_id)}
                  onLike={async (on) => {
                    const ok = await pulseLike(p.id, on);
                    if (!ok) return;
                    bumpPost(p.id, (x) => ({ ...x, liked: on, like_count: Math.max(0, x.like_count + (on ? 1 : -1)) }));
                  }}
                  onRepost={() => void pulseRepost(p.id)}
                  onFollow={async (on) => {
                    const ok = await pulseSetFollow(p.author_id, on);
                    if (!ok) return;
                    setFollowing((prev) => {
                      const n = new Set(prev);
                      if (on) n.add(p.author_id);
                      else n.delete(p.author_id);
                      return n;
                    });
                  }}
                  onReply={() => {
                    setReplyTo(p);
                    setTab("compose");
                  }}
                  onOpen={() => void openThread(p.id)}
                  onTag={(t) => pulseGo({ view: "tag", tag: t })}
                  onMention={(u) => void pulseProfile(u).then((p2) => p2 && (setProfile(p2), setTab("profile"), pulseGo({ view: "profile", username: u })))}
                  onBookmark={() => {
                    const on = pulseToggleBookmark(p.id);
                    bumpPost(p.id, (x) => ({ ...x, bookmarked: on }));
                  }}
                  onDelete={
                    me === p.author_id || can.pulseMod()
                      ? async () => {
                          if (!confirm(me === p.author_id ? "Delete?" : "Remove this reply as staff?") || !(await pulseDelete(p.id))) return;
                          setThread((t) => (t ? { ...t, replies: t.replies.filter((r) => r.id !== p.id) } : t));
                        }
                      : undefined
                  }
                />
              ))}
              {!thread.replies.length && <p className="px-4 py-10 text-center text-sm text-white/40">No replies yet — be the first.</p>}
            </div>
          )}

          {!showingThread && (tab === "home" || tab === "profile" || tab === "bookmarks" || route.view === "tag") && (
            <div>
              {listForTab().map((p) => (
                <PulseCard
                  key={p.id}
                  post={p}
                  following={following.has(p.author_id) || (profile?.is_following && p.author_id === (profile as { id: string }).id)}
                  onLike={async (on) => {
                    const ok = await pulseLike(p.id, on);
                    if (!ok) return;
                    bumpPost(p.id, (x) => ({ ...x, liked: on, like_count: Math.max(0, x.like_count + (on ? 1 : -1)) }));
                  }}
                  onRepost={() => void pulseRepost(p.id).then(() => refreshFeed())}
                  onFollow={async (on) => {
                    const ok = await pulseSetFollow(p.author_id, on);
                    if (!ok) return;
                    setFollowing((prev) => {
                      const n = new Set(prev);
                      if (on) n.add(p.author_id);
                      else n.delete(p.author_id);
                      return n;
                    });
                  }}
                  onReply={() => {
                    setReplyTo(p);
                    setTab("compose");
                  }}
                  onOpen={() => void openThread(p.id)}
                  onTag={(t) => pulseGo({ view: "tag", tag: t })}
                  onMention={(u) => void pulseProfile(u).then((pr) => pr && (setProfile(pr), setTab("profile"), pulseGo({ view: "profile", username: u })))}
                  onBookmark={() => {
                    const on = pulseToggleBookmark(p.id);
                    bumpPost(p.id, (x) => ({ ...x, bookmarked: on }));
                    if (tab === "bookmarks" && !on) setFeed((f) => f.filter((x) => x.id !== p.id));
                    toast(on ? "Saved" : "Removed", "success");
                  }}
                  onDelete={
                    me === p.author_id || can.pulseMod()
                      ? async () => {
                          if (!confirm(me === p.author_id ? "Delete this post?" : "Remove this post as staff?") || !(await pulseDelete(p.id))) return;
                          setFeed((f) => f.filter((x) => x.id !== p.id));
                          setTagRows((f) => (f ? f.filter((x) => x.id !== p.id) : f));
                          if (profile) setProfile({ ...profile, posts: profile.posts.filter((x) => x.id !== p.id) });
                        }
                      : undefined
                  }
                />
              ))}
              {listForTab().length === 0 && route.view !== "tag" && (
                <p className="px-4 py-16 text-center text-sm text-white/40">
                  {tab === "bookmarks"
                    ? "No saved posts yet — tap the bookmark on any Pulse."
                    : tab === "home" && mode === "following"
                      ? "Follow people to fill this timeline."
                      : tab === "home"
                        ? "Your feed is quiet — post something with a #hashtag."
                        : "No posts yet."}
                </p>
              )}
              {route.view === "tag" && tagRows === null && <p className="px-4 py-16 text-center text-sm text-white/40">Loading…</p>}
              {route.view === "tag" && tagRows && !tagRows.length && <p className="px-4 py-16 text-center text-sm text-white/40">No posts with #{route.tag} yet.</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PulseCard({
  post,
  following,
  expanded,
  onLike,
  onRepost,
  onFollow,
  onReply,
  onOpen,
  onTag,
  onMention,
  onBookmark,
  onDelete,
}: {
  post: PulsePost;
  following?: boolean;
  expanded?: boolean;
  onLike: (on: boolean) => void | Promise<void>;
  onRepost: () => void;
  onFollow: (on: boolean) => void | Promise<void>;
  onReply: () => void;
  onOpen: () => void;
  onTag: (tag: string) => void;
  onMention: (username: string) => void;
  onBookmark: () => void;
  onDelete?: () => void | Promise<void>;
}) {
  const profiles = useApp((s) => s.profiles);
  const me = useApp((s) => s.userId);
  const a = profiles[post.author_id];
  const liked = !!post.liked;
  const bookmarked = !!post.bookmarked;

  return (
    <article
      className={cn("border-b border-white/10 px-4 py-3 hover:bg-white/[0.02]", !expanded && "cursor-pointer")}
      onClick={() => !expanded && onOpen()}
    >
      <div className="flex gap-3">
        <Avatar userId={post.author_id} size={40} plain />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-bold">@{a?.username ?? "…"}</span>
            <span className="text-white/35">· {pulseAgo(post.created_at)}</span>
            {me && me !== post.author_id && (
              <button
                onClick={(e) => (e.stopPropagation(), void onFollow(!following))}
                className={cn("ml-auto rounded-full px-3 py-0.5 text-xs font-bold", following ? "border border-white/20" : "bg-[#1d9bf0]")}
              >
                {following ? "Following" : "Follow"}
              </button>
            )}
            {onDelete && (me === post.author_id || can.pulseMod()) && (
              <button
                onClick={(e) => (e.stopPropagation(), void onDelete())}
                className="ml-auto grid size-7 place-items-center rounded-full text-white/35 hover:bg-red-500/15 hover:text-red-400"
                title={me === post.author_id ? "Delete" : "Remove (mod)"}
              >
                <Trash2 className="size-3.5" />
              </button>
            )}
          </div>
          <p className={cn("mt-1 whitespace-pre-wrap text-[15px] leading-relaxed", expanded && "text-[17px]")}>{renderPulseBody(post.body, onTag, onMention)}</p>
          {post.repost_of && <div className="mt-1 text-xs text-emerald-400/80">Repost</div>}
          {post.reply_to && !expanded && <div className="mt-1 text-xs text-white/40">Replying in thread</div>}
          <div className="mt-2 flex gap-5 text-white/45 sm:gap-6">
            <button
              onClick={(e) => (e.stopPropagation(), onReply())}
              className="inline-flex items-center gap-1.5 text-xs hover:text-[#1d9bf0]"
            >
              <MessageCircle className="size-4" /> {post.reply_count}
            </button>
            <button onClick={(e) => (e.stopPropagation(), onRepost())} className="inline-flex items-center gap-1.5 text-xs hover:text-emerald-400">
              <Repeat2 className="size-4" /> {post.repost_count}
            </button>
            <button
              onClick={(e) => (e.stopPropagation(), void onLike(!liked))}
              className={cn("inline-flex items-center gap-1.5 text-xs hover:text-pink-400", liked && "text-pink-400")}
            >
              <Heart className={cn("size-4", liked && "fill-current")} /> {post.like_count}
            </button>
            <button
              onClick={(e) => (e.stopPropagation(), onBookmark())}
              className={cn("inline-flex items-center gap-1.5 text-xs hover:text-[#1d9bf0]", bookmarked && "text-[#1d9bf0]")}
              title="Bookmark"
            >
              <Bookmark className={cn("size-4", bookmarked && "fill-current")} />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

export { openPulse };
