"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Heart, MessageCircle, Repeat2, Send } from "lucide-react";
import { useApp, toast } from "@/store/app";
import { cn } from "@/lib/utils";
import Avatar from "@/components/ui/Avatar";
import {
  openPulse,
  pulseAgo,
  pulseCreate,
  pulseFeed,
  pulseProfile,
  pulseLike,
  pulseRepost,
  pulseSetFollow,
  type PulsePost,
} from "@/lib/pulse";

type ProfileView = Awaited<ReturnType<typeof pulseProfile>>;

export default function PulseHub({ mobile }: { mobile?: boolean }) {
  const me = useApp((s) => s.userId);
  const profiles = useApp((s) => s.profiles);
  const [tab, setTab] = useState<"home" | "compose" | "profile">("home");
  const [feed, setFeed] = useState<PulsePost[]>([]);
  const [profile, setProfile] = useState<ProfileView>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [following, setFollowing] = useState<Set<string>>(new Set());

  const refreshFeed = useCallback(async () => {
    const rows = await pulseFeed();
    setFeed(rows);
  }, []);

  const refreshProfile = useCallback(async () => {
    const username = me ? profiles[me]?.username : null;
    if (!username) return;
    const p = await pulseProfile(username);
    setProfile(p);
  }, [me, profiles]);

  useEffect(() => {
    void refreshFeed();
  }, [refreshFeed]);

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-black text-white">
      <header className={cn("flex shrink-0 items-center gap-2 border-b border-white/10 px-3", mobile ? "pt-safe-3 pb-2" : "h-12")}>
        <button
          onClick={() => useApp.setState(mobile ? { hub: null, mobileTab: "gram" } : { hub: "gram" })}
          className="grid size-9 place-items-center rounded-full hover:bg-white/5"
          aria-label="Back"
        >
          <ArrowLeft className="size-5" />
        </button>
        <div className="font-semibold tracking-tight">Pulse</div>
        <span className="hidden text-xs text-white/45 sm:inline">Twitter-style posts · follows · likes</span>
        <div className="ml-auto flex gap-1 rounded-full bg-white/5 p-0.5 text-xs font-semibold">
          {(
            [
              ["home", "Home"],
              ["compose", "Post"],
              ["profile", "You"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => {
                setTab(id);
                if (id === "profile") void refreshProfile();
                if (id === "home") void refreshFeed();
              }}
              className={cn("rounded-full px-3 py-1.5", tab === id ? "bg-white text-black" : "text-white/60")}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-xl">
          {tab === "compose" && (
            <form
              className="border-b border-white/10 p-4"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!draft.trim() || busy) return;
                setBusy(true);
                try {
                  await pulseCreate(draft.trim());
                  setDraft("");
                  setTab("home");
                  await refreshFeed();
                  toast("Posted", "success");
                } catch (err) {
                  toast(String((err as Error).message ?? err), "error");
                } finally {
                  setBusy(false);
                }
              }}
            >
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value.slice(0, 280))}
                rows={4}
                placeholder="What’s happening?"
                className="w-full resize-none bg-transparent text-lg outline-none placeholder:text-white/35"
              />
              <div className="mt-2 flex items-center justify-between">
                <span className="text-xs text-white/40">{draft.length}/280</span>
                <button type="submit" disabled={busy || !draft.trim()} className="inline-flex items-center gap-2 rounded-full bg-[#1d9bf0] px-4 py-2 text-sm font-bold disabled:opacity-40">
                  <Send className="size-4" /> Post
                </button>
              </div>
            </form>
          )}

          {tab === "profile" && profile && (
            <div className="border-b border-white/10 p-4">
              <div className="flex items-center gap-3">
                <Avatar userId={profile.id as string} size={56} plain />
                <div>
                  <div className="text-lg font-bold">@{(profile as { username: string }).username}</div>
                  <div className="text-sm text-white/50">
                    {profile.following} following · {profile.followers} followers
                  </div>
                </div>
              </div>
            </div>
          )}

          {(tab === "home" || tab === "profile") && (
            <div>
              {(tab === "profile" ? profile?.posts ?? [] : feed).map((p) => (
                <PulseCard
                  key={p.id}
                  post={p}
                  following={following.has(p.author_id) || (profile?.is_following && p.author_id === (profile as { id: string }).id)}
                  onLike={async (on) => {
                    const ok = await pulseLike(p.id, on);
                    if (!ok) return;
                    const bump = (list: PulsePost[]) =>
                      list.map((x) => (x.id === p.id ? { ...x, liked: on, like_count: Math.max(0, x.like_count + (on ? 1 : -1)) } : x));
                    setFeed((f) => bump(f));
                    if (profile) setProfile({ ...profile, posts: bump(profile.posts) });
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
                />
              ))}
              {(tab === "home" ? feed : profile?.posts ?? []).length === 0 && (
                <p className="px-4 py-16 text-center text-sm text-white/40">
                  {tab === "home" ? "Your feed is quiet — post something or follow people." : "No posts yet."}
                </p>
              )}
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
  onLike,
  onRepost,
  onFollow,
}: {
  post: PulsePost;
  following?: boolean;
  onLike: (on: boolean) => void | Promise<void>;
  onRepost: () => void;
  onFollow: (on: boolean) => void | Promise<void>;
}) {
  const profiles = useApp((s) => s.profiles);
  const me = useApp((s) => s.userId);
  const a = profiles[post.author_id];
  const liked = !!post.liked;

  return (
    <article className="border-b border-white/10 px-4 py-3 hover:bg-white/[0.02]">
      <div className="flex gap-3">
        <Avatar userId={post.author_id} size={40} plain />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-bold">@{a?.username ?? "…"}</span>
            <span className="text-white/35">· {pulseAgo(post.created_at)}</span>
            {me && me !== post.author_id && (
              <button
                onClick={() => void onFollow(!following)}
                className={cn("ml-auto rounded-full px-3 py-0.5 text-xs font-bold", following ? "border border-white/20" : "bg-[#1d9bf0]")}
              >
                {following ? "Following" : "Follow"}
              </button>
            )}
          </div>
          <p className="mt-1 whitespace-pre-wrap text-[15px] leading-relaxed">{post.body}</p>
          {post.repost_of && <div className="mt-1 text-xs text-emerald-400/80">Repost</div>}
          <div className="mt-2 flex gap-6 text-white/45">
            <span className="inline-flex items-center gap-1.5 text-xs">
              <MessageCircle className="size-4" /> {post.reply_count}
            </span>
            <button onClick={onRepost} className="inline-flex items-center gap-1.5 text-xs hover:text-emerald-400">
              <Repeat2 className="size-4" /> {post.repost_count}
            </button>
            <button
              onClick={() => void onLike(!liked)}
              className={cn("inline-flex items-center gap-1.5 text-xs hover:text-pink-400", liked && "text-pink-400")}
            >
              <Heart className={cn("size-4", liked && "fill-current")} /> {post.like_count}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

export { openPulse };
