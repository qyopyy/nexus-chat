"use client";

import { memo, useEffect, useRef, useState } from "react";
import { Check, Clock, Copy, Download, FileText, Lock, Pencil, Reply, SmilePlus, Sparkles, Trash2 } from "lucide-react";
import { useApp, openProfileCard, toast } from "@/store/app";
import { roleRank } from "@/lib/theme";
import NameTag from "@/components/ui/NameTag";
import { useChat } from "@/store/chat";
import { deleteMessage, editMessage, toggleReaction } from "@/lib/data";
import { EFFECTS, isEffect, playEffect } from "@/lib/effects";
import { haptic } from "@/lib/haptics";
import { cn, formatTime, QUICK_REACTIONS } from "@/lib/utils";
import Avatar from "@/components/ui/Avatar";
import EmojiPicker from "@/components/ui/EmojiPicker";
import Sheet, { SheetGroup, SheetItem } from "@/components/ui/Sheet";
import VoicePlayer from "./VoicePlayer";
import VideoEmbed from "@/components/videos/VideoEmbed";
import GameInvite from "@/components/games/GameInvite";
import { useSignedUrl } from "@/lib/storage";
import type { Message, Reaction } from "@/lib/types";

const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,:;"')\]!?])/g;
const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}|\p{Emoji_Component}|‍|️|\s)+$/u;
const EMPTY_REACTIONS: Reaction[] = [];
const SWIPE = 64;

export function isVoice(m: Pick<Message, "attachment_type" | "attachment_name">) {
  return !!m.attachment_type?.startsWith("audio/") && !!m.attachment_name?.startsWith("voice-");
}

function Linkified({ text }: { text: string }) {
  const parts = text.split(URL_RE);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <a key={i} href={p} target="_blank" rel="noreferrer noopener" className="text-[#6ab7ff] underline-offset-2 hover:underline">
            {p}
          </a>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

function Attachment({ m, mine }: { m: Message; mine: boolean }) {
  const { url, loading, failed } = useSignedUrl(m.attachment_url);
  if (!m.attachment_url) return null;
  const type = m.attachment_type ?? "";
  const media = type.startsWith("image/") || type.startsWith("video/");
  if (loading) {
    return media ? (
      <div className="grid h-48 w-64 max-w-full animate-pulse place-items-center rounded-xl bg-black/25 text-xs opacity-60">Loading…</div>
    ) : (
      <div className="h-12 w-56 animate-pulse rounded-lg bg-black/20" />
    );
  }
  if (failed || !url) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-black/20 px-3 py-2 text-xs opacity-80">
        <Lock className="size-4" /> Private file — only members of this chat can open it
      </div>
    );
  }
  if (isVoice(m)) return <VoicePlayer url={url} mine={mine} seed={m.id} />;
  if (type.startsWith("image/")) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl" onClick={(e) => e.stopPropagation()}>
        <img src={url} alt={m.attachment_name ?? ""} className="max-h-[360px] w-auto max-w-full object-cover" loading="lazy" draggable={false} />
      </a>
    );
  }
  if (type.startsWith("video/")) {
    return <video src={url} controls playsInline className="max-h-[360px] max-w-full rounded-xl" />;
  }
  if (type.startsWith("audio/")) {
    return (
      <div className="min-w-[220px] max-w-full">
        <div className="mb-1 truncate text-xs opacity-70">{m.attachment_name}</div>
        <audio src={url} controls className="w-full" />
      </div>
    );
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className="flex min-w-[200px] max-w-full items-center gap-3 rounded-lg bg-black/20 p-2.5 hover:bg-black/30">
      <div className="grid size-10 place-items-center rounded-full bg-accent text-white">
        <FileText className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{m.attachment_name}</div>
        <div className="text-xs opacity-60">Tap to download</div>
      </div>
      <Download className="size-4 opacity-60" />
    </a>
  );
}

function MessageBubbleImpl({
  message: m,
  mine,
  first,
  last,
  showNames,
  replied,
}: {
  message: Message;
  mine: boolean;
  first: boolean;
  last: boolean;
  showNames: boolean;
  replied: Message | null;
}) {
  const author = useApp((s) => s.profiles[m.author_id]);
  const repliedAuthor = useApp((s) => (replied ? s.profiles[replied.author_id] : undefined));
  const reactions = useChat((s) => s.reactions[m.id] ?? EMPTY_REACTIONS);
  const editing = useChat((s) => s.editingId === m.id);
  const me = useApp((s) => s.userId);
  const [picker, setPicker] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [burst, setBurst] = useState(0);
  const [dx, setDx] = useState(0);
  const authorRole = useApp((s) => s.profiles[m.author_id]?.site_role);
  const myRole = useApp((s) => (s.userId ? s.profiles[s.userId]?.site_role : undefined));
  const canModerate = !mine && roleRank(myRole) >= 2 && roleRank(authorRole) < roleRank(myRole);
  const touch = useRef<{ x: number; y: number; mode: "?" | "h" | "v"; moved: boolean; fired: boolean; ctl: boolean } | null>(null);
  const press = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTap = useRef(0);

  const deleted = !!m.deleted_at;
  const interactive = !deleted && !m.pending && !editing;
  const voice = isVoice(m);
  const bigEmoji = !deleted && !m.attachment_url && m.content.length <= 12 && EMOJI_ONLY.test(m.content) && m.content.trim().length > 0;
  const showAvatar = showNames && !mine;
  const onlyMedia = !!m.attachment_url && !m.content && (m.attachment_type?.startsWith("image/") || m.attachment_type?.startsWith("video/"));
  const effect = isEffect(m.effect) ? EFFECTS.find((e) => e.id === m.effect) : undefined;

  const grouped: Record<string, { count: number; mine: boolean }> = {};
  for (const r of reactions) {
    const g = (grouped[r.emoji] ??= { count: 0, mine: false });
    g.count++;
    if (r.user_id === me) g.mine = true;
  }

  const reply = () => {
    haptic.light();
    useChat.setState({ replyTo: m, editingId: null });
  };
  const heart = () => {
    if (!grouped["❤️"]?.mine) void toggleReaction(m, "❤️");
    setBurst((b) => b + 1);
    haptic.medium();
  };

  return (
    <div
      data-mid={m.id}
      className={cn("group relative flex items-end gap-2 rounded-lg px-1 select-none md:select-text", first ? "msg-gap-first mt-2" : "mt-0.5", mine ? "justify-end" : "justify-start")}
      onPointerDown={(e) => {
        if (!interactive || e.pointerType === "mouse") return;
        const ctl = !!(e.target as HTMLElement).closest("button,a,audio,video,textarea,input");
        touch.current = { x: e.clientX, y: e.clientY, mode: "?", moved: false, fired: false, ctl };
        if (!ctl) press.current = setTimeout(() => {
          if (touch.current && !touch.current.moved) {
            touch.current.fired = true;
            haptic.medium();
            setSheet(true);
          }
        }, 420);
      }}
      onPointerMove={(e) => {
        const t = touch.current;
        if (!t) return;
        const mx = e.clientX - t.x;
        const my = e.clientY - t.y;
        if (t.mode === "?") {
          if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
          t.moved = true;
          if (press.current) clearTimeout(press.current);
          t.mode = Math.abs(mx) > Math.abs(my) && mx < 0 ? "h" : "v";
          if (t.mode === "h") (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }
        if (t.mode !== "h") return;
        const nx = Math.max(-SWIPE * 1.4, Math.min(0, mx));
        if (dx > -SWIPE && nx <= -SWIPE) haptic.select();
        setDx(nx);
      }}
      onPointerUp={() => {
        if (press.current) clearTimeout(press.current);
        const t = touch.current;
        touch.current = null;
        if (!t) return;
        if (t.mode === "h") {
          if (dx <= -SWIPE) reply();
          setDx(0);
          return;
        }
        if (!t.moved && !t.fired && !t.ctl) {
          const now = Date.now();
          if (now - lastTap.current < 300) {
            lastTap.current = 0;
            heart();
          } else lastTap.current = now;
        }
      }}
      onPointerCancel={() => {
        if (press.current) clearTimeout(press.current);
        touch.current = null;
        setDx(0);
      }}
      onContextMenu={(e) => {
        if (interactive && window.matchMedia("(hover: none)").matches) e.preventDefault();
      }}
      onDoubleClick={(e) => interactive && !(e.target as HTMLElement).closest("button,a,audio,video,textarea") && heart()}
    >
      {/* swipe-to-reply indicator */}
      {dx < 0 && (
        <span
          className="pointer-events-none absolute top-1/2 right-1 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-txt"
          style={{ opacity: Math.min(1, -dx / SWIPE), transform: `translateY(-50%) scale(${dx <= -SWIPE ? 1.1 : 0.7 + (-dx / SWIPE) * 0.3})` }}
        >
          <Reply className="size-4" />
        </span>
      )}

      {showAvatar && (
        <div className="w-9 shrink-0" style={{ transform: dx ? `translateX(${dx}px)` : undefined }}>
          {last && (
            <button onClick={(e) => openProfileCard(m.author_id, e)} className="block rounded-full" aria-label="Open profile">
              <Avatar userId={m.author_id} size={36} />
            </button>
          )}
        </div>
      )}

      <div
        className={cn("flex max-w-[min(560px,80%)] flex-col", mine ? "items-end" : "items-start")}
        style={{ transform: dx ? `translateX(${dx}px)` : undefined, transition: dx ? "none" : "transform .25s cubic-bezier(.2,.9,.3,1)" }}
      >
        <div
          className={cn(
            "relative text-[15px] leading-snug shadow-sm",
            bigEmoji ? "bg-transparent px-1 shadow-none" : onlyMedia ? "overflow-hidden rounded-2xl p-0.5" : "px-3 py-1.5",
            !bigEmoji && (mine ? "bg-bubble-me text-white" : "bg-bubble text-txt"),
            !bigEmoji && !onlyMedia && "rounded-[20px]",
            !bigEmoji && last && !onlyMedia && (mine ? "rounded-br-md bubble-tail-me" : "rounded-bl-md bubble-tail"),
            effect && !bigEmoji && "effect-glow",
            m.pending && "opacity-70",
            sheet && "scale-[1.03] transition-transform",
          )}
        >
          {showNames && !mine && first && !bigEmoji && (
            <button
              onClick={(e) => openProfileCard(m.author_id, e)}
              className={cn("mb-0.5 block max-w-full text-left text-sm font-semibold hover:underline", onlyMedia && "px-2.5 pt-1.5")}
            >
              {m.bot_name ? (
                <span className="inline-flex items-center gap-1">
                  <span style={{ color: author?.avatar_color ?? "#5865f2" }}>{m.bot_name}</span>
                  <span className="rounded bg-[#5865f2] px-1 text-[9px] leading-4 font-black text-white">WEBHOOK</span>
                </span>
              ) : (
                <NameTag userId={m.author_id} fallbackColor={author?.avatar_color ?? "#2aabee"} />
              )}
            </button>
          )}

          {m.reply_to_id && !deleted && (
            <button
              onClick={() => m.reply_to_id && useChat.setState({ jumpTo: m.reply_to_id })}
              className={cn("mb-1 block w-full rounded-lg border-l-[3px] px-2 py-0.5 text-left text-sm", mine ? "border-white/80 bg-white/10" : "border-accent bg-accent/10", onlyMedia && "mx-1 mt-1 w-auto")}
            >
              <div className={cn("truncate text-xs font-semibold", mine ? "text-white" : "text-accent")}>{repliedAuthor?.display_name ?? "Message"}</div>
              <div className="truncate text-xs opacity-80">
                {replied ? (replied.deleted_at ? "Deleted message" : replied.content || (isVoice(replied) ? "🎤 Voice message" : replied.attachment_name) || "Attachment") : "Original message"}
              </div>
            </button>
          )}

          {deleted ? (
            <span className="text-sm italic opacity-60">Message deleted</span>
          ) : editing ? (
            <InlineEditor message={m} />
          ) : (
            <>
              <Attachment m={m} mine={mine} />
              {m.content && (
                <span className={cn("break-words whitespace-pre-wrap", bigEmoji ? "text-5xl leading-tight" : "msg-text", m.attachment_url && "mt-1 block")}>
                  <Linkified text={m.content} />
                </span>
              )}
              {m.content.includes("/v/") && !deleted && <VideoEmbed text={m.content} />}
              {m.content.includes("play=") && !deleted && <GameInvite text={m.content} />}
            </>
          )}

          {!bigEmoji && (
            <span
              className={cn(
                "float-right mt-1.5 ml-2 flex translate-y-0.5 items-center gap-1 text-[11px] select-none",
                mine ? "text-white/60" : "text-sub",
                onlyMedia && "absolute right-2 bottom-2 rounded-full bg-black/50 px-1.5 text-white",
                voice && "-mt-4",
              )}
            >
              {m.edited_at && !deleted && "edited"}
              {formatTime(m.created_at)}
              {mine && (m.pending ? <Clock className="size-3" /> : <Check className="size-3.5" />)}
            </span>
          )}

          {burst > 0 && (
            <span key={burst} className="heart-burst pointer-events-none absolute inset-0 grid place-items-center text-5xl" aria-hidden>
              ❤️
            </span>
          )}
        </div>

        {effect && !deleted && (
          <button onClick={() => playEffect(effect.id)} className="mt-0.5 flex items-center gap-1 px-1 text-[11px] font-semibold text-accent active:scale-95">
            <Sparkles className="size-3" /> Sent with {effect.label} · replay
          </button>
        )}

        {Object.keys(grouped).length > 0 && (
          <div className={cn("mt-1 flex flex-wrap gap-1", mine && "justify-end")}>
            {Object.entries(grouped).map(([emoji, g]) => (
              <button
                key={emoji}
                onClick={() => {
                  haptic.light();
                  void toggleReaction(m, emoji);
                }}
                className={cn(
                  "flex items-center gap-1 rounded-full border px-2 py-0.5 text-sm transition active:scale-90",
                  g.mine ? "border-accent bg-accent/25 text-white" : "border-transparent bg-black/30 text-txt hover:border-white/20",
                )}
              >
                <span>{emoji}</span>
                <span className="text-xs font-semibold">{g.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Discord-style hover toolbar (mouse only) */}
      {interactive && (
        <div
          className={cn(
            "hover-only absolute -top-4 z-20 hidden items-center rounded-lg border border-black/30 bg-side shadow-lg group-hover:flex",
            picker && "flex",
            mine ? "right-2" : "right-2 sm:left-auto",
          )}
        >
          {QUICK_REACTIONS.slice(0, 3).map((e) => (
            <button key={e} onClick={() => void toggleReaction(m, e)} className="grid size-8 place-items-center rounded-md text-lg hover:bg-hover">
              {e}
            </button>
          ))}
          <ToolBtn label="Add reaction" onClick={() => setPicker((v) => !v)}>
            <SmilePlus className="size-[18px]" />
          </ToolBtn>
          <ToolBtn label="Reply" onClick={reply}>
            <Reply className="size-[18px]" />
          </ToolBtn>
          {mine && !m.attachment_url && (
            <ToolBtn label="Edit" onClick={() => useChat.setState({ editingId: m.id, replyTo: null })}>
              <Pencil className="size-[18px]" />
            </ToolBtn>
          )}
          {(mine || canModerate) && (
            <ToolBtn label={mine ? "Delete" : "Delete (moderator)"} danger onClick={() => confirm("Delete this message?") && void deleteMessage(m.id)}>
              <Trash2 className="size-[18px]" />
            </ToolBtn>
          )}
          {picker && (
            <EmojiPicker
              className="absolute top-10 right-0"
              onClose={() => setPicker(false)}
              onPick={(e) => {
                setPicker(false);
                void toggleReaction(m, e);
              }}
            />
          )}
        </div>
      )}

      {/* long-press action sheet (touch) */}
      <Sheet open={sheet} onClose={() => setSheet(false)}>
        <div className="mb-3 flex justify-between rounded-full bg-white/[.07] p-1.5">
          {QUICK_REACTIONS.map((e) => (
            <button
              key={e}
              onClick={() => {
                haptic.light();
                void toggleReaction(m, e);
                setSheet(false);
              }}
              className={cn("grid size-10 place-items-center rounded-full text-[26px] transition active:scale-125", grouped[e]?.mine && "bg-accent/30")}
            >
              {e}
            </button>
          ))}
        </div>
        <SheetGroup>
          <SheetItem icon={<Reply className="size-5" />} label="Reply" onClick={() => (setSheet(false), reply())} />
          {m.content && (
            <SheetItem
              icon={<Copy className="size-5" />}
              label="Copy text"
              onClick={() => {
                void navigator.clipboard?.writeText(m.content);
                haptic.success();
                toast("Copied", "success");
                setSheet(false);
              }}
            />
          )}
          {effect && <SheetItem icon={<Sparkles className="size-5" />} label={`Replay ${effect.label}`} onClick={() => (setSheet(false), playEffect(effect.id))} />}
          {mine && !m.attachment_url && <SheetItem icon={<Pencil className="size-5" />} label="Edit" onClick={() => (setSheet(false), useChat.setState({ editingId: m.id, replyTo: null }))} />}
        </SheetGroup>
        {(mine || canModerate) && (
          <SheetGroup>
            <SheetItem
              icon={<Trash2 className="size-5" />}
              label={mine ? "Delete message" : "Delete (moderator)"}
              danger
              onClick={() => {
                setSheet(false);
                if (confirm("Delete this message?")) void deleteMessage(m.id);
              }}
            />
          </SheetGroup>
        )}
      </Sheet>
    </div>
  );
}

function ToolBtn({ children, label, onClick, danger }: { children: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn("grid size-8 place-items-center rounded-md text-sub transition hover:bg-hover", danger ? "hover:text-dnd" : "hover:text-txt")}
    >
      {children}
    </button>
  );
}

function InlineEditor({ message }: { message: Message }) {
  const [value, setValue] = useState(message.content);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);
  const save = () => {
    if (value.trim() && value !== message.content) void editMessage(message.id, value);
    else useChat.setState({ editingId: null });
  };
  return (
    <div className="min-w-[220px]">
      <textarea
        ref={ref}
        value={value}
        rows={Math.min(8, value.split("\n").length)}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            save();
          }
          if (e.key === "Escape") useChat.setState({ editingId: null });
        }}
        className="w-full resize-none rounded-md bg-black/25 px-2 py-1 text-[16px] outline-none md:text-[15px]"
      />
      <div className="mt-1 flex items-center justify-end gap-3 text-[12px]">
        <button onClick={() => useChat.setState({ editingId: null })} className="opacity-70">
          Cancel
        </button>
        <button onClick={save} className="rounded-full bg-white/20 px-2.5 py-0.5 font-semibold">
          Save
        </button>
      </div>
    </div>
  );
}

export default memo(MessageBubbleImpl);
