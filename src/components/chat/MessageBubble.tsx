"use client";

import { memo, useEffect, useRef, useState } from "react";
import { Bookmark, Check, Clock, Copy, Download, FileText, Flag, Forward, Lock, Pencil, Pin, Reply, SmilePlus, Sparkles, Trash2 } from "lucide-react";
import { openReport } from "@/lib/adminTools";
import { usePrefs } from "@/lib/prefs";
import { useApp, openProfileCard, toast } from "@/store/app";
import { roleRank } from "@/lib/theme";
import NameTag from "@/components/ui/NameTag";
import { useChat } from "@/store/chat";
import { deleteMessage, editMessage, parseForwarded, toggleReaction } from "@/lib/data";
import { pinMessage, toggleSaveMessage } from "@/lib/chatDelight";
import { refreshPins } from "./PinsBar";
import { EFFECTS, isEffect, playEffect } from "@/lib/effects";
import { haptic } from "@/lib/haptics";
import { cn, formatTime, QUICK_REACTIONS } from "@/lib/utils";
import Avatar from "@/components/ui/Avatar";
import EmojiPicker from "@/components/ui/EmojiPicker";
import { EmojiText } from "@/components/ui/CustomEmoji";
import Sheet, { SheetGroup, SheetItem } from "@/components/ui/Sheet";
import VoicePlayer from "./VoicePlayer";
import AttachViewer, { AttachDownloadButton } from "./AttachViewer";
import VideoEmbed from "@/components/videos/VideoEmbed";
import GameInvite from "@/components/games/GameInvite";
import { ScoreChallengeCard } from "@/components/games/ScoreChallenge";
import ServerInvite from "@/components/space/ServerInvite";
import LinkEmbed from "./LinkEmbed";
import AcetateEmbed from "@/components/acetate/AcetateEmbed";
import MessageVeil from "./MessageVeil";
import { PollCard } from "./Poll";
import { POLL_RE } from "@/lib/polls";
import { BUMP_PIN_RE, CAPSULE_RE, JAM_RE } from "@/lib/chatExtras";
import { BumpPinCard, CapsuleCard, JamCard } from "./Extras";
import { useSignedUrl } from "@/lib/storage";
import { downloadAttachment } from "@/lib/downloadAttachment";
import { FormattedText } from "@/lib/chatFormat";
import ForwardPicker from "./ForwardPicker";
import type { Message, Reaction } from "@/lib/types";
const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}|\p{Emoji_Component}|‍|️|\s)+$/u;
const EMPTY_REACTIONS: Reaction[] = [];
const SWIPE = 64;

export function isVoice(m: Pick<Message, "attachment_type" | "attachment_name">) {
  return !!m.attachment_type?.startsWith("audio/") && !!m.attachment_name?.startsWith("voice-");
}

/** Discord-style markup, colors, spoilers, timed vanish spans */
function Linkified({ text, createdAt }: { text: string; createdAt?: string }) {
  return <FormattedText text={text} createdAt={createdAt} />;
}

function Attachment({ m, mine }: { m: Message; mine: boolean }) {
  const { url, loading, failed } = useSignedUrl(m.attachment_url);
  const [viewer, setViewer] = useState(false);
  if (!m.attachment_url) return null;
  const type = m.attachment_type ?? "";
  const media = type.startsWith("image/") || type.startsWith("video/");
  const name = m.attachment_name ?? "attachment";
  if (loading) {
    return media ? (
      <div className="grid h-36 w-[min(16rem,72vw)] max-w-full animate-pulse place-items-center rounded-xl bg-black/25 text-xs opacity-60 min-[400px]:h-48 min-[400px]:w-64">Loading…</div>
    ) : (
      <div className="h-12 w-[min(14rem,70vw)] max-w-full animate-pulse rounded-lg bg-black/20" />
    );
  }
  if (failed || !url) {
    return (
      <div className="flex max-w-[min(100%,18rem)] items-center gap-2 rounded-lg bg-black/20 px-2.5 py-2 text-[11px] opacity-80 min-[400px]:max-w-none min-[400px]:px-3 min-[400px]:text-xs">
        <Lock className="size-4 shrink-0" /> Private file — only members of this chat can open it
      </div>
    );
  }
  if (isVoice(m)) {
    return (
      <div className="flex min-w-0 items-center gap-1">
        <VoicePlayer url={url} mine={mine} seed={m.id} />
        <AttachDownloadButton
          url={url}
          name={name.endsWith(".webm") || name.endsWith(".m4a") || name.endsWith(".ogg") ? name : `${name}.webm`}
          className={cn("grid size-8 shrink-0 place-items-center rounded-full opacity-70 hover:opacity-100", mine ? "text-white/80 hover:bg-white/15" : "text-sub hover:bg-black/10")}
        />
      </div>
    );
  }
  if (type.startsWith("image/")) {
    return (
      <>
        <div className="group relative max-w-full">
          <button
            type="button"
            className="block max-w-full overflow-hidden rounded-xl text-left"
            onClick={(e) => {
              e.stopPropagation();
              setViewer(true);
            }}
            aria-label={`View ${name}`}
          >
            <img
              src={url}
              alt={name}
              className="max-h-[min(52vh,280px)] w-auto max-w-full object-cover min-[400px]:max-h-[min(60vh,360px)]"
              loading="lazy"
              draggable={false}
            />
          </button>
          <AttachDownloadButton
            url={url}
            name={name}
            className="absolute right-1.5 bottom-1.5 grid size-8 place-items-center rounded-full bg-black/55 text-white opacity-95 shadow-sm hover:bg-black/70 min-[400px]:opacity-0 min-[400px]:group-hover:opacity-100"
          />
        </div>
        <AttachViewer open={viewer} url={url} name={name} onClose={() => setViewer(false)} />
      </>
    );
  }
  if (type.startsWith("video/")) {
    return (
      <div className="relative max-w-full">
        <video src={url} controls playsInline className="max-h-[min(52vh,280px)] max-w-full rounded-xl min-[400px]:max-h-[min(60vh,360px)]" />
        <AttachDownloadButton
          url={url}
          name={name}
          className="absolute top-1.5 right-1.5 grid size-8 place-items-center rounded-full bg-black/55 text-white hover:bg-black/70"
        />
      </div>
    );
  }
  if (type.startsWith("audio/")) {
    return (
      <div className="w-full min-w-0 max-w-[min(100%,18rem)] min-[400px]:min-w-[220px] min-[400px]:max-w-full">
        <div className="mb-1 flex items-center gap-2">
          <div className="min-w-0 flex-1 truncate text-[11px] opacity-70 min-[400px]:text-xs">{name}</div>
          <AttachDownloadButton
            url={url}
            name={name}
            className={cn("grid size-7 shrink-0 place-items-center rounded-full opacity-80 hover:opacity-100", mine ? "text-white/80 hover:bg-white/15" : "text-sub hover:bg-black/10")}
          />
        </div>
        <audio src={url} controls className="w-full max-w-full" />
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        void downloadAttachment(url, name).then((ok) => toast(ok ? "Saved" : "Opened download", ok ? "success" : "info"));
      }}
      className="flex w-full min-w-0 max-w-[min(100%,18rem)] items-center gap-2 rounded-lg bg-black/20 p-2 text-left hover:bg-black/30 min-[400px]:min-w-[200px] min-[400px]:max-w-full min-[400px]:gap-3 min-[400px]:p-2.5"
    >
      <div className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-white min-[400px]:size-10">
        <FileText className="size-4 min-[400px]:size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium min-[400px]:text-sm">{name}</div>
        <div className="text-[10px] opacity-60 min-[400px]:text-xs">Tap to download</div>
      </div>
      <Download className="size-4 shrink-0 opacity-60" />
    </button>
  );
}

function MessageBubbleImpl({
  message: m,
  mine,
  first,
  last,
  showNames,
  replied,
  linkEmbeds = false,
}: {
  message: Message;
  mine: boolean;
  first: boolean;
  last: boolean;
  showNames: boolean;
  replied: Message | null;
  /** rich OG/SEO link cards — enabled for private DMs & groups */
  linkEmbeds?: boolean;
}) {
  const author = useApp((s) => s.profiles[m.author_id]);
  const repliedAuthor = useApp((s) => (replied ? s.profiles[replied.author_id] : undefined));
  const reactions = useChat((s) => s.reactions[m.id] ?? EMPTY_REACTIONS);
  const editing = useChat((s) => s.editingId === m.id);
  const me = useApp((s) => s.userId);
  const [picker, setPicker] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [forwardOpen, setForwardOpen] = useState(false);
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
  const jumbo = usePrefs((s) => s.jumboEmoji);
  const bigEmoji = jumbo && !deleted && !m.attachment_url && m.content.length <= 12 && EMOJI_ONLY.test(m.content) && m.content.trim().length > 0;
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
  const openForward = () => {
    haptic.light();
    setSheet(false);
    setForwardOpen(true);
  };
  const heart = () => {
    if (!grouped["❤️"]?.mine) void toggleReaction(m, "❤️");
    setBurst((b) => b + 1);
    haptic.medium();
  };
  const forwarded = !deleted ? parseForwarded(m.content) : null;
  const displayContent = forwarded ? forwarded.body : m.content;

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
            "msg-bubble relative text-[15px] leading-snug shadow-sm msg-text",
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
              {forwarded && (
                <div
                  className={cn(
                    "mb-0.5 flex items-center gap-1 text-[11px] font-medium opacity-75",
                    mine ? "text-white/75" : "text-sub",
                    onlyMedia && "px-2.5 pt-1.5",
                  )}
                >
                  <Forward className="size-3 shrink-0" />
                  <span className="truncate">Forwarded from {forwarded.from}</span>
                </div>
              )}
              <VeilIf m={m} mine={mine}>
              <Attachment m={m} mine={mine} />
              {POLL_RE.test(displayContent) ? (
                <PollCard id={displayContent.match(POLL_RE)![1]} mine={mine} />
              ) : JAM_RE.test(displayContent) ? (
                <JamCard id={displayContent.match(JAM_RE)![1]} />
              ) : CAPSULE_RE.test(displayContent) ? (
                <CapsuleCard id={displayContent.match(CAPSULE_RE)![1]} mine={mine} />
              ) : BUMP_PIN_RE.test(displayContent) ? (
                <BumpPinCard text={displayContent} mine={mine} />
              ) : displayContent ? (
                <span className={cn("break-words whitespace-pre-wrap", bigEmoji ? "text-5xl leading-tight" : "msg-text", m.attachment_url && "mt-1 block")}>
                  <Linkified text={displayContent} createdAt={m.created_at} />
                </span>
              ) : null}
              {linkEmbeds &&
                displayContent &&
                /https?:\/\//i.test(displayContent) &&
                !POLL_RE.test(displayContent) &&
                !JAM_RE.test(displayContent) &&
                !CAPSULE_RE.test(displayContent) &&
                !BUMP_PIN_RE.test(displayContent) &&
                !displayContent.includes("/acetate/s/") && <LinkEmbed text={displayContent} mine={mine} />}
              {displayContent.includes("/v/") && !deleted && <VideoEmbed text={displayContent} />}
              {displayContent.includes("/acetate/s/") && !deleted && <AcetateEmbed text={displayContent} />}
              {displayContent.includes("play=") && !deleted && <GameInvite text={displayContent} />}
              {m.content.includes("🎯") && /Beat my score/i.test(m.content) && !deleted && <ScoreChallengeCard text={m.content} fromId={m.author_id} />}
              {(displayContent.includes("/i/") || /[?&]join=/.test(displayContent)) && !deleted && <ServerInvite text={displayContent} />}
              </VeilIf>
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
                <EmojiText value={emoji} />
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
          <ToolBtn label="Forward" onClick={openForward}>
            <Forward className="size-[18px]" />
          </ToolBtn>
          <ToolBtn
            label="Save"
            onClick={() => void toggleSaveMessage(m.id)}
          >
            <Bookmark className="size-[18px]" />
          </ToolBtn>
          <ToolBtn
            label="Pin"
            onClick={() => void pinMessage(m.id).then((ok) => ok && refreshPins())}
          >
            <Pin className="size-[18px]" />
          </ToolBtn>
          {mine && !m.attachment_url && (
            <ToolBtn label="Edit" onClick={() => useChat.setState({ editingId: m.id, replyTo: null })}>
              <Pencil className="size-[18px]" />
            </ToolBtn>
          )}
          {!mine && (
            <ToolBtn label="Report" danger onClick={() => openReport({ messageId: m.id, userId: m.author_id, excerpt: m.content?.slice(0, 200) })}>
              <Flag className="size-[18px]" />
            </ToolBtn>
          )}
          {(mine || canModerate) && (
            <ToolBtn label={mine ? "Delete" : "Delete (moderator)"} danger onClick={() => (!usePrefs.getState().confirmDelete || confirm("Delete this message?")) && void deleteMessage(m.id)}>
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
          <SheetItem icon={<Forward className="size-5" />} label="Forward" onClick={openForward} />
          <SheetItem
            icon={<Bookmark className="size-5" />}
            label="Save message"
            onClick={() => {
              setSheet(false);
              void toggleSaveMessage(m.id);
            }}
          />
          <SheetItem
            icon={<Pin className="size-5" />}
            label="Pin to chat"
            onClick={() => {
              setSheet(false);
              void pinMessage(m.id).then((ok) => ok && refreshPins());
            }}
          />
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
        {!mine && (
          <SheetGroup>
            <SheetItem
              icon={<Flag className="size-5" />}
              label="Report message"
              danger
              onClick={() => {
                setSheet(false);
                openReport({ messageId: m.id, userId: m.author_id, excerpt: m.content?.slice(0, 200) });
              }}
            />
          </SheetGroup>
        )}
        {(mine || canModerate) && (
          <SheetGroup>
            <SheetItem
              icon={<Trash2 className="size-5" />}
              label={mine ? "Delete message" : "Delete (moderator)"}
              danger
              onClick={() => {
                setSheet(false);
                if ((!usePrefs.getState().confirmDelete || confirm("Delete this message?"))) void deleteMessage(m.id);
              }}
            />
          </SheetGroup>
        )}
      </Sheet>

      <ForwardPicker message={m} open={forwardOpen} onClose={() => setForwardOpen(false)} />
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

/** wraps the message body in a spoiler / invisible-ink cover when the sender chose one */
function VeilIf({ m, mine, children }: { m: Message; mine: boolean; children: React.ReactNode }) {
  if (m.hidden) return <MessageVeil kind="hidden" mine={mine}>{children}</MessageVeil>;
  if (m.spoiler) return <MessageVeil kind="spoiler" mine={mine}>{children}</MessageVeil>;
  return <>{children}</>;
}
