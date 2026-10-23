"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, ImagePlus, Link2, MessageCircle, Send, Trash2, X } from "lucide-react";
import { useApp, openProfileCard, toast } from "@/store/app";
import { addComment, commentCounts, createPost, loadComments, removeComment, removePost, resolveMentions, searchUsers } from "@/lib/music";
import { musicGo } from "@/store/music";
import { myRank } from "@/lib/admin";
import { cn, formatTime } from "@/lib/utils";
import Avatar from "@/components/ui/Avatar";
import NameTag, { VerifiedCheck } from "@/components/ui/NameTag";
import { spotifyEmbed } from "@/lib/links";
import type { ArtistComment, ArtistPage, ArtistPost } from "@/lib/types";

const TOKEN_RE = /(https?:\/\/[^\s<]+[^\s<.,:;"')\]!?]|@[a-zA-Z0-9_.]{2,32})/g;

/** Text with clickable links and @mentions (users → profile card, artist handles → artist page) */
export function RichText({ text, className }: { text: string; className?: string }) {
  const profiles = useApp((s) => s.profiles);
  const byName = useMemo(() => {
    const m: Record<string, string> = {};
    for (const p of Object.values(profiles)) m[p.username] = p.id;
    return m;
  }, [profiles]);
  useEffect(() => {
    void resolveMentions(text);
  }, [text]);
  const parts = text.split(TOKEN_RE);
  return (
    <span className={cn("break-words whitespace-pre-wrap", className)}>
      {parts.map((p, i) => {
        if (!p) return null;
        if (/^https?:\/\//.test(p))
          return (
            <a key={i} href={p} target="_blank" rel="noreferrer noopener" className="text-[#6ab7ff] hover:underline">
              {p}
            </a>
          );
        if (p.startsWith("@") && p.length > 2) {
          const name = p.slice(1).toLowerCase();
          const uid = byName[name];
          return (
            <button
              key={i}
              onClick={(e) => (uid ? openProfileCard(uid, e) : musicGo({ view: "page", handle: name }))}
              className="rounded bg-accent/15 px-0.5 font-medium text-accent hover:bg-accent/25"
            >
              {p}
            </button>
          );
        }
        return <span key={i}>{p}</span>;
      })}
    </span>
  );
}

/** Textarea with @mention autocomplete */
export function MentionInput({
  value,
  onChange,
  placeholder,
  rows = 2,
  onSubmit,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  onSubmit?: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [sugg, setSugg] = useState<{ id: string; username: string; display_name: string }[]>([]);
  const [q, setQ] = useState<string | null>(null);

  useEffect(() => {
    if (q === null || q.length < 1) return setSugg([]);
    const t = setTimeout(() => void searchUsers(q).then(setSugg), 150);
    return () => clearTimeout(t);
  }, [q]);

  const update = (v: string) => {
    onChange(v);
    const el = ref.current;
    const upto = v.slice(0, el?.selectionStart ?? v.length);
    const m = upto.match(/(?:^|\s)@([a-zA-Z0-9_.]{0,32})$/);
    setQ(m ? m[1] : null);
  };

  const pick = (username: string) => {
    const el = ref.current;
    const pos = el?.selectionStart ?? value.length;
    const before = value.slice(0, pos).replace(/@([a-zA-Z0-9_.]{0,32})$/, `@${username} `);
    const next = before + value.slice(pos);
    onChange(next);
    setQ(null);
    setSugg([]);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(before.length, before.length);
    });
  };

  return (
    <div className="relative">
      <textarea
        ref={ref}
        value={value}
        rows={rows}
        placeholder={placeholder}
        onChange={(e) => update(e.target.value)}
        onKeyDown={(e) => {
          if (sugg.length && (e.key === "Enter" || e.key === "Tab")) {
            e.preventDefault();
            pick(sugg[0].username);
          } else if (e.key === "Enter" && !e.shiftKey && onSubmit && rows <= 1) {
            e.preventDefault();
            onSubmit();
          }
        }}
        className={cn("w-full resize-none rounded-xl bg-rail px-3 py-2.5 text-[15px] outline-none placeholder:text-sub focus:ring-2 focus:ring-accent/50", className)}
      />
      {sugg.length > 0 && (
        <div className="absolute bottom-full left-0 z-20 mb-1 w-64 overflow-hidden rounded-xl bg-menu shadow-2xl ring-1 ring-white/10">
          {sugg.map((u) => (
            <button key={u.id} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(u.username)} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-hover">
              <Avatar userId={u.id} size={24} plain />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{u.display_name}</span>
              <span className="text-xs text-sub">@{u.username}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function PostComposer({ page, onPosted }: { page: ArtistPage; onPosted: (p: ArtistPost) => void }) {
  const [text, setText] = useState("");
  const [link, setLink] = useState("");
  const [showLink, setShowLink] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);

  const submit = async () => {
    if (!text.trim() && !file && !link.trim()) return;
    setBusy(true);
    const p = await createPost(page, text, file, showLink ? link : null);
    setBusy(false);
    if (p) {
      setText("");
      setLink("");
      setFile(null);
      setShowLink(false);
      onPosted(p);
      toast("Posted", "success");
    }
  };

  return (
    <div className="rounded-2xl bg-side p-3">
      <div className="mb-2 flex items-center gap-2 text-sm text-sub">
        {page.image_url ? <img src={page.image_url} alt="" className="size-6 rounded-full object-cover" /> : null}
        Posting as <b className="text-txt">{page.name}</b>
      </div>
      <MentionInput value={text} onChange={setText} rows={3} placeholder="Share news, a snippet, a video… Use @ to mention people" />
      {showLink && (
        <input
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="https://… (Spotify links get a player)"
          className="mt-2 w-full rounded-xl bg-rail px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/50"
        />
      )}
      {file && preview && (
        <div className="relative mt-2 inline-block">
          {file.type.startsWith("image/") ? (
            <img src={preview} alt="" className="max-h-48 rounded-xl" />
          ) : file.type.startsWith("video/") ? (
            <video src={preview} className="max-h-48 rounded-xl" muted />
          ) : (
            <div className="rounded-xl bg-rail px-3 py-2 text-sm">{file.name}</div>
          )}
          <button onClick={() => setFile(null)} className="absolute top-1 right-1 grid size-7 place-items-center rounded-full bg-black/70 text-white" aria-label="Remove">
            <X className="size-4" />
          </button>
        </div>
      )}
      <div className="mt-2 flex items-center gap-1">
        <input ref={input} type="file" hidden accept="image/*,video/*,audio/*" onChange={(e) => (setFile(e.target.files?.[0] ?? null), (e.target.value = ""))} />
        <button onClick={() => input.current?.click()} className="grid size-9 place-items-center rounded-full text-sub hover:bg-hover hover:text-txt" title="Photo, video or audio">
          <ImagePlus className="size-5" />
        </button>
        <button onClick={() => setShowLink((v) => !v)} className={cn("grid size-9 place-items-center rounded-full hover:bg-hover", showLink ? "text-accent" : "text-sub")} title="Add link">
          <Link2 className="size-5" />
        </button>
        <button
          disabled={busy || (!text.trim() && !file && !link.trim())}
          onClick={() => void submit()}
          className="ml-auto flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-2 disabled:opacity-40"
        >
          <Send className="size-4" /> {busy ? "Posting…" : "Post"}
        </button>
      </div>
    </div>
  );
}

export function PostCard({ post, page, onRemoved }: { post: ArtistPost; page?: ArtistPage; onRemoved: () => void }) {
  const me = useApp((s) => s.userId);
  const author = useApp((s) => s.profiles[post.author_id]);
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<ArtistComment[] | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [text, setText] = useState("");
  const canRemove = me === post.author_id || me === page?.owner_id || myRank() >= 2;
  const embed = spotifyEmbed(post.link_url);

  useEffect(() => {
    void commentCounts([post.id]).then((c) => setCount(c[post.id] ?? 0));
  }, [post.id]);

  const openComments = async () => {
    setOpen((v) => !v);
    if (!comments) setComments(await loadComments(post.id));
  };
  const send = async () => {
    if (!text.trim()) return;
    const c = await addComment(post.id, text);
    if (c) {
      setComments((l) => [...(l ?? []), c]);
      setCount((n) => (n ?? 0) + 1);
      setText("");
    }
  };

  return (
    <article className="rounded-2xl bg-side p-3.5">
      <header className="flex items-center gap-2.5">
        {page?.image_url ? (
          <button onClick={() => page && musicGo(page.spotify_id ? { view: "artist", id: page.spotify_id } : { view: "page", handle: page.handle })}>
            <img src={page.image_url} alt="" className="size-10 rounded-full object-cover" />
          </button>
        ) : (
          <Avatar userId={post.author_id} size={40} plain />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 font-semibold">
            <span className="truncate">{page?.name ?? author?.display_name}</span>
            {page?.verified && <VerifiedCheck size={15} />}
          </div>
          <div className="truncate text-xs text-sub">
            {page ? `@${page.handle}` : ""}
            {author && (
              <>
                {" · by "}
                <button onClick={(e) => openProfileCard(post.author_id, e)} className="hover:underline">
                  {author.forum_name ?? author.username}
                </button>
              </>
            )}
            {" · "}
            {new Date(post.created_at).toLocaleDateString([], { month: "short", day: "numeric" })} {formatTime(post.created_at)}
          </div>
        </div>
        {canRemove && (
          <button onClick={() => confirm("Delete this post?") && void removePost(post.id).then((r) => r && onRemoved())} className="grid size-8 place-items-center rounded-full text-sub hover:bg-dnd/15 hover:text-dnd" aria-label="Delete post">
            <Trash2 className="size-4" />
          </button>
        )}
      </header>
      {post.content && <RichText text={post.content} className="mt-2.5 block text-[15px] leading-relaxed" />}
      {post.media_url && (
        <div className="mt-2.5 overflow-hidden rounded-xl">
          {post.media_type?.startsWith("image/") ? (
            <a href={post.media_url} target="_blank" rel="noreferrer">
              <img src={post.media_url} alt="" className="max-h-[480px] w-full object-cover" loading="lazy" />
            </a>
          ) : post.media_type?.startsWith("video/") ? (
            <video src={post.media_url} controls playsInline className="max-h-[480px] w-full bg-black" />
          ) : (
            <audio src={post.media_url} controls className="w-full" />
          )}
        </div>
      )}
      {post.link_url &&
        (embed ? (
          <iframe src={embed} title="Spotify" loading="lazy" allow="encrypted-media" className="mt-2.5 h-[152px] w-full rounded-xl border-0" />
        ) : (
          <a href={post.link_url} target="_blank" rel="noreferrer noopener" className="mt-2.5 flex items-center gap-2 rounded-xl bg-rail px-3 py-2.5 text-sm hover:bg-hover">
            <ExternalLink className="size-4 shrink-0 text-sub" />
            <span className="truncate text-[#6ab7ff]">{post.link_url}</span>
          </a>
        ))}
      <footer className="mt-2 flex items-center">
        <button onClick={() => void openComments()} className="flex items-center gap-1.5 rounded-full px-2 py-1.5 text-sm text-sub hover:bg-hover hover:text-txt">
          <MessageCircle className="size-4" /> {count ?? "…"} {count === 1 ? "comment" : "comments"}
        </button>
      </footer>
      {open && (
        <div className="mt-1 space-y-2.5 border-t border-white/5 pt-2.5">
          {(comments ?? []).map((c) => (
            <div key={c.id} className="flex gap-2">
              <button onClick={(e) => openProfileCard(c.author_id, e)} className="shrink-0">
                <Avatar userId={c.author_id} size={28} plain />
              </button>
              <div className="min-w-0 flex-1 rounded-xl bg-rail px-3 py-2">
                <div className="flex items-center gap-1 text-xs">
                  <NameTag userId={c.author_id} className="font-semibold" />
                  <span className="text-sub">· {formatTime(c.created_at)}</span>
                  {(me === c.author_id || me === page?.owner_id || myRank() >= 2) && (
                    <button
                      onClick={() => void removeComment(c.id).then((r) => r && setComments((l) => (l ?? []).filter((x) => x.id !== c.id)))}
                      className="ml-auto text-sub hover:text-dnd"
                      aria-label="Delete comment"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>
                <RichText text={c.content} className="text-sm" />
              </div>
            </div>
          ))}
          {comments && comments.length === 0 && <p className="text-sm text-sub">No comments yet — start the conversation.</p>}
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <MentionInput value={text} onChange={setText} rows={1} placeholder="Write a comment… (@ to mention)" onSubmit={() => void send()} />
            </div>
            <button disabled={!text.trim()} onClick={() => void send()} className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-white disabled:opacity-40" aria-label="Send">
              <Send className="size-4" />
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
