"use client";

import { memo, useEffect, useRef, useState } from "react";
import { Check, Clock, Download, FileText, Pencil, Reply, SmilePlus, Trash2 } from "lucide-react";
import { useApp, openProfileCard } from "@/store/app";
import { roleRank } from "@/lib/theme";
import NameTag from "@/components/ui/NameTag";
import { useChat } from "@/store/chat";
import { deleteMessage, editMessage, toggleReaction } from "@/lib/data";
import { cn, formatTime, QUICK_REACTIONS } from "@/lib/utils";
import Avatar from "@/components/ui/Avatar";
import EmojiPicker from "@/components/ui/EmojiPicker";
import type { Message, Reaction } from "@/lib/types";

const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,:;"')\]!?])/g;
const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}|\p{Emoji_Component}|‍|️|\s)+$/u;
const EMPTY_REACTIONS: Reaction[] = [];

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
          <Fragmentless key={i} text={p} />
        ),
      )}
    </>
  );
}
function Fragmentless({ text }: { text: string }) {
  return <>{text}</>;
}

function Attachment({ m }: { m: Message }) {
  if (!m.attachment_url) return null;
  const type = m.attachment_type ?? "";
  if (type.startsWith("image/")) {
    return (
      <a href={m.attachment_url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl">
        <img src={m.attachment_url} alt={m.attachment_name ?? ""} className="max-h-[360px] w-auto max-w-full object-cover" loading="lazy" />
      </a>
    );
  }
  if (type.startsWith("video/")) {
    return <video src={m.attachment_url} controls className="max-h-[360px] max-w-full rounded-xl" />;
  }
  if (type.startsWith("audio/")) {
    return (
      <div className="min-w-[260px]">
        <div className="mb-1 truncate text-xs text-white/70">{m.attachment_name}</div>
        <audio src={m.attachment_url} controls className="w-full" />
      </div>
    );
  }
  return (
    <a href={m.attachment_url} target="_blank" rel="noreferrer" className="flex min-w-[220px] items-center gap-3 rounded-lg bg-black/20 p-2.5 hover:bg-black/30">
      <div className="grid size-10 place-items-center rounded-full bg-accent text-white">
        <FileText className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{m.attachment_name}</div>
        <div className="text-xs text-white/60">Click to download</div>
      </div>
      <Download className="size-4 text-white/60" />
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
  const authorRole = useApp((s) => s.profiles[m.author_id]?.site_role);
  const myRole = useApp((s) => (s.userId ? s.profiles[s.userId]?.site_role : undefined));
  const canModerate = !mine && roleRank(myRole) >= 2 && roleRank(authorRole) < roleRank(myRole);

  const deleted = !!m.deleted_at;
  const bigEmoji = !deleted && !m.attachment_url && m.content.length <= 12 && EMOJI_ONLY.test(m.content) && m.content.trim().length > 0;
  const showAvatar = showNames && !mine;
  const onlyMedia = !!m.attachment_url && !m.content && (m.attachment_type?.startsWith("image/") || m.attachment_type?.startsWith("video/"));

  const grouped: Record<string, { count: number; mine: boolean }> = {};
  for (const r of reactions) {
    const g = (grouped[r.emoji] ??= { count: 0, mine: false });
    g.count++;
    if (r.user_id === me) g.mine = true;
  }

  return (
    <div
      data-mid={m.id}
      className={cn("group relative flex items-end gap-2 rounded-lg px-1", first ? "msg-gap-first mt-2" : "mt-0.5", mine ? "justify-end" : "justify-start")}
    >
      {showAvatar && (
        <div className="w-9 shrink-0">
          {last && (
            <button onClick={(e) => openProfileCard(m.author_id, e)} className="block rounded-full" aria-label="Open profile">
              <Avatar userId={m.author_id} size={36} />
            </button>
          )}
        </div>
      )}

      <div className={cn("flex max-w-[min(560px,78%)] flex-col", mine ? "items-end" : "items-start")}>
        <div
          className={cn(
            "relative text-[15px] leading-snug shadow-sm",
            bigEmoji ? "bg-transparent px-1 shadow-none" : onlyMedia ? "overflow-hidden rounded-2xl p-0.5" : "px-3 py-1.5",
            !bigEmoji && (mine ? "bg-bubble-me text-white" : "bg-bubble text-txt"),
            !bigEmoji && !onlyMedia && "rounded-2xl",
            !bigEmoji && last && !onlyMedia && (mine ? "rounded-br-md bubble-tail-me" : "rounded-bl-md bubble-tail"),
            m.pending && "opacity-70",
          )}
        >
          {showNames && !mine && first && !bigEmoji && (
            <button
              onClick={(e) => openProfileCard(m.author_id, e)}
              className={cn("mb-0.5 block max-w-full text-left text-sm font-semibold hover:underline", onlyMedia && "px-2.5 pt-1.5")}
            >
              <NameTag userId={m.author_id} fallbackColor={author?.avatar_color ?? "#2aabee"} />
            </button>
          )}

          {m.reply_to_id && !deleted && (
            <button
              onClick={() => m.reply_to_id && useChat.setState({ jumpTo: m.reply_to_id })}
              className={cn("mb-1 block w-full rounded-md border-l-[3px] px-2 py-0.5 text-left text-sm", mine ? "border-white/80 bg-white/10" : "border-accent bg-accent/10", onlyMedia && "mx-1 mt-1 w-auto")}
            >
              <div className={cn("truncate text-xs font-semibold", mine ? "text-white" : "text-accent")}>{repliedAuthor?.display_name ?? "Message"}</div>
              <div className="truncate text-xs opacity-80">
                {replied ? (replied.deleted_at ? "Deleted message" : replied.content || replied.attachment_name || "Attachment") : "Original message"}
              </div>
            </button>
          )}

          {deleted ? (
            <span className="text-sm italic opacity-60">Message deleted</span>
          ) : editing ? (
            <InlineEditor message={m} />
          ) : (
            <>
              <Attachment m={m} />
              {m.content && (
                <span className={cn("break-words whitespace-pre-wrap", bigEmoji ? "text-5xl leading-tight" : "msg-text", m.attachment_url && "mt-1 block")}>
                  <Linkified text={m.content} />
                </span>
              )}
            </>
          )}

          {!bigEmoji && (
            <span
              className={cn(
                "float-right mt-1.5 ml-2 flex translate-y-0.5 items-center gap-1 text-[11px] select-none",
                mine ? "text-white/60" : "text-sub",
                onlyMedia && "absolute right-2 bottom-2 rounded-full bg-black/50 px-1.5 text-white",
              )}
            >
              {m.edited_at && !deleted && "edited"}
              {formatTime(m.created_at)}
              {mine && (m.pending ? <Clock className="size-3" /> : <Check className="size-3.5" />)}
            </span>
          )}
        </div>

        {Object.keys(grouped).length > 0 && (
          <div className={cn("mt-1 flex flex-wrap gap-1", mine && "justify-end")}>
            {Object.entries(grouped).map(([emoji, g]) => (
              <button
                key={emoji}
                onClick={() => void toggleReaction(m, emoji)}
                className={cn(
                  "flex items-center gap-1 rounded-full border px-2 py-0.5 text-sm transition",
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

      {/* Discord-style hover toolbar */}
      {!deleted && !m.pending && !editing && (
        <div
          className={cn(
            "absolute -top-4 z-20 hidden items-center rounded-lg border border-black/30 bg-side shadow-lg group-hover:flex",
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
          <ToolBtn label="Reply" onClick={() => useChat.setState({ replyTo: m, editingId: null })}>
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
  return (
    <div className="min-w-[240px]">
      <textarea
        ref={ref}
        value={value}
        rows={Math.min(8, value.split("\n").length)}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (value.trim() && value !== message.content) void editMessage(message.id, value);
            else useChat.setState({ editingId: null });
          }
          if (e.key === "Escape") useChat.setState({ editingId: null });
        }}
        className="w-full resize-none rounded-md bg-black/25 px-2 py-1 text-[15px] outline-none"
      />
      <div className="mt-1 text-[11px] opacity-70">escape to cancel • enter to save</div>
    </div>
  );
}

export default memo(MessageBubbleImpl);
