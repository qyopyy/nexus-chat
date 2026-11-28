"use client";

import { usePrefs } from "@/lib/prefs";
import { useEffect, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { Bold, Camera, FileText, Mic, Paperclip, Pencil, Reply, SendHorizontal, Smile, Sparkles, Strikethrough, Timer, Type, Underline, Wand2, X } from "lucide-react";
import { useApp, conversationTitle, toast } from "@/store/app";
import { useChat } from "@/store/chat";
import { TTL_OPTIONS, runBotCommand, sendMessage, setTtl, type SendMode } from "@/lib/data";
import { MSG_LIMIT_FREE, MSG_LIMIT_PREMIUM, NEED, gate, msgLimit, myTier, useMyTier } from "@/lib/premium";
import { sendLive, sendTyping } from "@/lib/realtime";
import { startLiveConfig, useLive } from "@/lib/liveConfig";
import { liveGet } from "@/lib/liveConfigCore";
import { startE2eeAutoLock } from "@/lib/e2ee";
import { EFFECTS, playEffect, type EffectKind } from "@/lib/effects";
import { haptic } from "@/lib/haptics";
import { cn, formatBytes } from "@/lib/utils";
import EmojiPicker from "@/components/ui/EmojiPicker";
import { withCustomEmojis } from "@/lib/customEmoji";
import Sheet from "@/components/ui/Sheet";
import { isVoice } from "./MessageBubble";
import VoiceRecorder from "./VoiceRecorder";
import { ComposerPlus } from "./Extras";
import { DictateButton, ScheduledBar } from "./ScheduleMessage";
import AttachEditor, { shouldOpenAttachEditor } from "./AttachEditor";
import { FORMAT_COLORS, VANISH_PICKS, wrapSelection } from "@/lib/chatFormat";
import { charCountLabel, composerPlaceholder, editingEscape, extraFilesNote, firstDroppedFile, limitTone, overLimit, safeDraft, trimDraft } from "@/lib/hundred";

const SnapCamera = dynamic(() => import("@/components/snap/SnapCamera"), { ssr: false });

/** Supabase Pro — everyone gets 1 GB per file; premium up to 5 GB (bucket cap). */
const MAX_FREE = 1024 * 1024 * 1024;
const MAX_PREMIUM = 5 * 1024 * 1024 * 1024;

export default function Composer({
  conversationId,
  file,
  setFile,
}: {
  conversationId: string;
  file: File | null;
  setFile: (f: File | null) => void;
}) {
  const me = useApp((s) => s.userId);
  useEffect(() => {
    startLiveConfig();
    startE2eeAutoLock();
  }, []);
  const title = useApp((s) => conversationTitle(s, conversationId));
  const kind = useApp((s) => s.convKinds[conversationId]);
  const replyTo = useChat((s) => s.replyTo);
  const editingId = useChat((s) => s.editingId);
  const replyAuthor = useApp((s) => (replyTo ? s.profiles[replyTo.author_id]?.display_name : undefined));
  const [text, setText] = useState("");
  const [picker, setPicker] = useState(false);
  const [effects, setEffects] = useState(false);
  const [timerOpen, setTimerOpen] = useState(false);
  const ttl = useApp((s) => s.convTtl[conversationId]);
  const slow = useApp((s) => {
    for (const list of Object.values(s.channels)) {
      const c = list.find((x) => x.id === conversationId);
      if (c) return c.slowmode ?? 0;
    }
    return 0;
  });
  const timerAllowed = kind === "dm" || kind === "group";
  const [effect, setEffect] = useState<EffectKind | null>(null);
  const [mode, setMode] = useState<SendMode>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [recCtx, setRecCtx] = useState<AudioContext | null>(null);
  const [recQuality, setRecQuality] = useState<"" | "HD" | "Studio">("");
  const recording = !!recCtx;
  const tier = useMyTier();
  const limit = msgLimit(tier);
  const [editOpen, setEditOpen] = useState(false);
  const [fmtOpen, setFmtOpen] = useState(false);
  const [snapOpen, setSnapOpen] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const [vanishOpen, setVanishOpen] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
    const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);
  const skipAutoEdit = useRef(false);

  // Open Discord-style editor when an image / editable audio is attached (picker, paste, or drop)
  useEffect(() => {
    if (!file) {
      setEditOpen(false);
      return;
    }
    if (skipAutoEdit.current) {
      skipAutoEdit.current = false;
      return;
    }
    if (shouldOpenAttachEditor(file)) setEditOpen(true);
  }, [file]);

  // focus on desktop only — on phones it would pop the keyboard every time a chat opens
  useEffect(() => {
    if (window.matchMedia("(hover: hover)").matches) area.current?.focus();
  }, [conversationId]);
  useEffect(() => {
    if (replyTo) area.current?.focus();
  }, [replyTo]);

  // Restore unsent draft when switching chats
  useEffect(() => {
    try {
      const draft = localStorage.getItem(`nexus.draft.${conversationId}`) || "";
      setText(safeDraft(draft));
    } catch {
      setText("");
    }
  }, [conversationId]);

  // Persist draft (debounced via rAF coalesce on each keystroke is fine at chat scale)
  useEffect(() => {
    try {
      const key = `nexus.draft.${conversationId}`;
      if (!trimDraft(text)) localStorage.removeItem(key);
      else localStorage.setItem(key, safeDraft(text));
    } catch {
      /* private mode */
    }
  }, [text, conversationId]);

  useEffect(() => {
    if (file && file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setPreview(url);
      return () => URL.revokeObjectURL(url);
    }
    setPreview(null);
  }, [file]);

  useEffect(() => {
    if (!file) return;
    const max = myTier() >= NEED.uploads100 ? MAX_PREMIUM : MAX_FREE;
    if (file.size > max) {
      if (max === MAX_FREE && file.size <= MAX_PREMIUM) gate(NEED.uploads100, "Files up to 5 GB");
      else {
        const lim = max >= 1073741824 ? `${(max / 1073741824).toFixed(0)} GB` : `${max / 1048576} MB`;
        toast(`That file is ${formatBytes(file.size)} — the limit is ${lim}.`, "error");
      }
      setFile(null);
    }
  }, [file, setFile]);

  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [text]);

  // a recording belongs to one chat: leaving it discards it (the recorder cleans up when it unmounts)
  useEffect(() => () => setRecCtx(null), [conversationId]);

  function submit(withEffect: EffectKind | null = effect) {
    if (!text.trim() && !file) return;
    const t = text.trim();
    if (t.length > limit) {
      // keep the draft — nothing is cleared until it fits
      if (tier < NEED.longMessages && t.length <= MSG_LIMIT_PREMIUM) gate(NEED.longMessages, `Messages over ${MSG_LIMIT_FREE.toLocaleString()} characters`);
      else toast(`Messages can be up to ${limit.toLocaleString()} characters — this one is ${t.length.toLocaleString()}.`, "error");
      return;
    }
    haptic.light();
    // Any /command — built-in or community bots
    const isCmd = !file && /^\/[a-z][\w-]{0,30}\b/i.test(t);
    // `:name:` typed by hand → your custom emoji (personal first, then this server's / any server you're in)
    const outText = isCmd ? text : withCustomEmojis(text);
    void sendMessage(conversationId, outText, file, withEffect, mode).then(() => {
      if (isCmd) void runBotCommand(conversationId, t);
    });
    setText("");
    try {
      localStorage.removeItem(`nexus.draft.${conversationId}`);
    } catch {
      /* ignore */
    }
    if (me) sendLive(me, "");
    setFile(null);
    setEditOpen(false);
    setEffect(null);
    setMode(null);
  }

  /** Wrap the current textarea selection (or insert empty markers) with Discord-style markup */
  function applyWrap(open: string, close: string) {
    const el = area.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const next = wrapSelection(text, start, end, open, close);
    setText(next.text);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(next.cursor, next.cursor);
    });
    haptic.select();
  }

  // ---------------------------------------------------------------- voice messages
  // The AudioContext is created right here, inside the tap: phones only wake audio from a real tap, and a sleeping context
  // is what made the live waveform sit flat. The recorder bar itself lives in VoiceRecorder.tsx.
  function beginRecording() {
    if (recCtx) return;
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      toast("Voice messages aren't supported in this browser.", "error");
      return;
    }
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      void ctx.resume?.();
      const hdv = myTier() >= NEED.hdVoice;
      setRecQuality(hdv && usePrefs.getState().studioVoice ? "Studio" : hdv ? "HD" : "");
      setRecCtx(ctx);
      haptic.medium();
    } catch {
      toast("Couldn't start the microphone.", "error");
    }
  }

  function recordingDone(f: File | null) {
    setRecCtx(null);
    if (!f) return;
    haptic.success();
    void sendMessage(conversationId, "", f, null);
  }

  // ---------------------------------------------------------------- render
  const placeholder = editingId || replyTo ? composerPlaceholder(!!editingId, !!replyTo) : kind === "text" ? `Message #${title}` : kind === "dm" ? `Message ${title}` : "Message";
  const canSend = (!!text.trim() || !!file) && !overLimit(text.length, limit);
  const chosen = EFFECTS.find((e) => e.id === effect);

  return (
    <div className="composer shrink-0 bg-wall px-2 pt-1.5 pb-safe-2 sm:px-6 sm:pb-3">
      <div className="mx-auto max-w-4xl">
        {slow > 0 && (
          <div className="mb-1 flex items-center gap-1.5 px-2 text-xs font-semibold text-sub">
            <span className="animate-pulse">🐢</span> Slow mode is on · one message every {slow >= 60 ? `${Math.round(slow / 60)} min` : `${slow}s`}
          </div>
        )}
        <ScheduledBar conversationId={conversationId} />
        {(replyTo || file || chosen || mode) && !recording && (
          <div className="mb-1.5 flex animate-fade flex-col gap-1.5 rounded-2xl bg-side px-3 py-2">
            {replyTo && (
              <div className="flex items-center gap-3">
                <Reply className="size-5 shrink-0 text-accent" />
                <div className="min-w-0 flex-1 border-l-2 border-accent pl-2">
                  <div className="text-xs font-semibold text-accent">Reply to {replyAuthor ?? "message"}</div>
                  <div className="truncate text-sm text-sub">{replyTo.content || (isVoice(replyTo) ? "🎤 Voice message" : replyTo.attachment_name)}</div>
                </div>
                <button onClick={() => useChat.setState({ replyTo: null })} className="p-1 text-sub" aria-label="Cancel reply">
                  <X className="size-5" />
                </button>
              </div>
            )}
            {file && (
              <div className="flex min-w-0 items-center gap-1.5 min-[400px]:gap-2">
                {preview ? (
                  <img src={preview} alt="" className="size-10 shrink-0 rounded-lg object-cover min-[400px]:size-12" />
                ) : (
                  <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent text-white min-[400px]:size-12">
                    <FileText className="size-5 min-[400px]:size-6" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium min-[400px]:text-sm">{file.name}</div>
                  <div className="text-[10px] text-sub min-[400px]:text-xs">{formatBytes(file.size)}</div>
                </div>
                {shouldOpenAttachEditor(file) && (
                  <button onClick={() => setEditOpen(true)} className="grid size-8 shrink-0 place-items-center rounded-full text-accent hover:bg-white/5 min-[400px]:size-9" aria-label="Edit attachment" title="Edit">
                    <Wand2 className="size-4" />
                  </button>
                )}
                <button onClick={() => setFile(null)} className="shrink-0 p-1 text-sub" aria-label="Remove file">
                  <X className="size-5" />
                </button>
              </div>
            )}
            {chosen && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-lg">{chosen.icon}</span>
                <span className="flex-1">
                  Sending with <b>{chosen.label}</b>
                </span>
                <button onClick={() => setEffect(null)} className="p-1 text-sub" aria-label="Remove effect">
                  <X className="size-4" />
                </button>
              </div>
            )}
            {mode && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-lg">{mode === "hidden" ? "🙈" : "⚠️"}</span>
                <span className="flex-1">
                  {mode === "hidden" ? (
                    <>
                      Sending as a <b>hidden message</b> — they hold to reveal it
                    </>
                  ) : (
                    <>
                      Sending behind a <b>spoiler</b> cover
                    </>
                  )}
                </span>
                <button onClick={() => setMode(null)} className="p-1 text-sub" aria-label="Send normally">
                  <X className="size-4" />
                </button>
              </div>
            )}
          </div>
        )}

        {!recording && text.length > limit - 400 && (
          <div className={cn("mb-1 flex items-center justify-end gap-2 px-2 text-xs font-semibold tabular-nums", text.trim().length > limit ? "text-dnd" : "text-sub")}>
            {text.trim().length > limit && tier < NEED.longMessages && text.trim().length <= MSG_LIMIT_PREMIUM && (
              <button onClick={() => gate(NEED.longMessages, `Messages over ${MSG_LIMIT_FREE.toLocaleString()} characters`)} className="rounded-full bg-[#ffd400]/15 px-2 py-0.5 font-bold text-[#ffd400] hover:bg-[#ffd400]/25">
                ⚡ Send up to {MSG_LIMIT_PREMIUM.toLocaleString()} with Lighting
              </button>
            )}
            <span>
              {text.trim().length.toLocaleString()} / {limit.toLocaleString()}
            </span>
          </div>
        )}
        {recCtx ? (
          <VoiceRecorder
            ctx={recCtx}
            studio={recQuality === "Studio"}
            badge={recQuality}
            maxSec={liveGet<number>(useLive.getState().map, "nexus.max_voice_sec")}
            onDone={recordingDone}
            onError={(m) => toast(m, m.startsWith("Hold on") ? "info" : "error")}
          />
        ) : (
          <div className="relative flex items-end gap-1.5">
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp,image/heic,image/heif,image/avif,audio/wav,audio/mpeg,audio/mp3,audio/aac,audio/mp4,audio/x-m4a,audio/ogg,audio/flac,.wav,.mp3,.aac,.m4a,.ogg,.flac,video/mp4,video/webm,video/quicktime,video/x-matroska,.mov,.m4v,.mkv,.pdf,.txt,.md,.csv,.json,.zip"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setFile(f);
                e.target.value = "";
              }}
            />
            <button onClick={() => fileInput.current?.click()} className="grid size-11 shrink-0 place-items-center rounded-full text-sub transition hover:text-txt active:scale-90 max-[520px]:hidden" title="Attach image, audio, or file">
              <Paperclip className="size-[22px]" />
            </button>
            <button onClick={() => setSnapOpen(true)} className="grid size-11 shrink-0 place-items-center rounded-full text-sub transition hover:text-txt active:scale-90 max-[520px]:hidden" title="Camera (Nexus Snap) — saved to your Drive vault with a link" aria-label="Open camera">
              <Camera className="size-[22px]" />
            </button>
            <ComposerPlus
              conversationId={conversationId}
              phoneItems={(item) => (
                <>
                  {item("📎", "Attach", "Photo, video, audio or a file", () => fileInput.current?.click())}
                  {item("📷", "Camera", "Nexus Snap, saved to your Drive", () => setSnapOpen(true))}
                  {item("✨", "Send with effect", "Confetti, hidden message, spoiler", () => setEffects(true))}
                  {item("🅰️", "Text formatting", "Bold, colors, spoiler, vanish", () => setFmtOpen((v) => !v))}
                  {timerAllowed && item("⏱", "Disappearing messages", ttl ? `On: ${TTL_OPTIONS.find((o) => o.secs === ttl)?.label}` : "Off", () => setTimerOpen(true))}
                </>
              )}
            />

            <div className="flex min-h-11 min-w-0 flex-1 flex-col rounded-[22px] border border-white/[.06] bg-side">
              {fmtOpen && (
                <div className="flex flex-wrap items-center gap-0.5 border-b border-white/[.06] px-1.5 pt-1.5 pb-1">
                  <FmtBtn title="Bold ** **" onClick={() => applyWrap("**", "**")}><Bold className="size-3.5" /></FmtBtn>
                  <FmtBtn title="Underline __ __" onClick={() => applyWrap("__", "__")}><Underline className="size-3.5" /></FmtBtn>
                  <FmtBtn title="Strike ~~ ~~" onClick={() => applyWrap("~~", "~~")}><Strikethrough className="size-3.5" /></FmtBtn>
                  <FmtBtn title="Spoiler || ||" onClick={() => applyWrap("||", "||")}><span className="text-[11px] font-black">||</span></FmtBtn>
                  <FmtBtn title="Color" onClick={() => setColorOpen(true)}><span className="size-3.5 rounded-full bg-[linear-gradient(135deg,#ef4444,#3b82f6,#22c55e)]" /></FmtBtn>
                  <FmtBtn title="Rainbow" onClick={() => applyWrap("{rainbow}", "{/rainbow}")}><span className="text-[11px] font-black">🌈</span></FmtBtn>
                  <FmtBtn title="Vanish selection" onClick={() => setVanishOpen(true)}><Timer className="size-3.5" /></FmtBtn>
                  <FmtBtn title="Ghost" onClick={() => applyWrap("{ghost}", "{/ghost}")}><span className="text-[11px] opacity-50">Aa</span></FmtBtn>
                </div>
              )}
              <div className="flex min-h-11 min-w-0 flex-1 items-end pr-1">
                <textarea
                  ref={area}
                  rows={1}
                  value={text}
                  placeholder={placeholder}
                  enterKeyHint="send"
                  onChange={(e) => {
                    setText(e.target.value);
                    if (me && e.target.value) sendTyping(me);
                    if (me) sendLive(me, e.target.value);
                  }}
                  onPaste={(e) => {
                    const picked = firstDroppedFile(e.clipboardData.files);
                    if (picked.file) {
                      e.preventDefault();
                      setFile(picked.file);
                      const note = extraFilesNote(picked.extra);
                      if (note) toast(note, "info");
                    }
                  }}
                  onKeyDown={(e) => {
                    const touchDevice = window.matchMedia("(hover: none)").matches;
                    const enterSends = usePrefs.getState().enterToSend;
                    const mod = e.metaKey || e.ctrlKey;
                    if (mod && e.key.toLowerCase() === "b") {
                      e.preventDefault();
                      applyWrap("**", "**");
                      return;
                    }
                    if (mod && e.key.toLowerCase() === "u") {
                      e.preventDefault();
                      applyWrap("__", "__");
                      return;
                    }
                    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && !touchDevice && (enterSends || e.ctrlKey || e.metaKey)) {
                      e.preventDefault();
                      submit();
                    } else if (e.key === "ArrowUp" && !text) {
                      const mine = [...useChat.getState().messages].reverse().find((m) => m.author_id === me && !m.deleted_at && !m.attachment_url && !m.pending);
                      if (mine) {
                        e.preventDefault();
                        useChat.setState({ editingId: mine.id });
                      }
                    } else if (e.key === "Escape") {
                      const target = editingEscape(useChat.getState().editingId, useChat.getState().replyTo);
                      if (target === "edit") useChat.setState({ editingId: null });
                      else if (target === "reply") useChat.setState({ replyTo: null });
                    }
                  }}
                  className="max-h-[180px] min-h-11 min-w-0 flex-1 resize-none bg-transparent py-[11px] pl-4 text-[16px] leading-[22px] outline-none placeholder:text-sub md:text-[15px]"
                />
                <div className="contents max-[520px]:hidden">
                  <DictateButton
                    onText={(t) => {
                      setText((x) => (x.trim() ? `${x.trimEnd()} ${t}` : t));
                      area.current?.focus();
                    }}
                  />
                </div>
                {limitTone(text.length, limit) !== "ok" && (
                  <span className={cn("mb-2 shrink-0 text-[10px] font-semibold tabular-nums", limitTone(text.length, limit) === "over" ? "text-dnd" : "text-sub")} aria-live="polite">
                    {charCountLabel(text.length, limit)}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setFmtOpen((v) => !v)}
                  className={cn("mb-1 grid size-9 shrink-0 place-items-center rounded-full transition active:scale-90 max-[520px]:hidden", fmtOpen ? "text-accent" : "text-sub hover:text-accent")}
                  title="Text formatting"
                >
                  <Type className="size-5" />
                </button>
                <button onClick={() => setEffects(true)} className={cn("grid size-9 shrink-0 place-items-center rounded-full transition active:scale-90 mb-1 max-[520px]:hidden", effect ? "text-accent" : "text-sub hover:text-accent")} title="Send with effect">
                  <Sparkles className="size-5" />
                </button>
                <div className="relative mb-1 hidden sm:block">
                  <button onClick={() => setPicker((v) => !v)} className="grid size-9 place-items-center rounded-full text-sub hover:text-idle" title="Emoji">
                    <Smile className="size-5" />
                  </button>
                  {picker && (
                    <EmojiPicker
                      keepOpen
                      className="absolute right-0 bottom-12"
                      onClose={() => setPicker(false)}
                      onPick={(e) => {
                        setText((t) => t + e);
                        area.current?.focus();
                      }}
                    />
                  )}
                </div>
              </div>
            </div>

            {canSend ? (
              <button
                onPointerDown={() => {
                  held.current = false;
                  holdTimer.current = setTimeout(() => {
                    held.current = true;
                    haptic.medium();
                    setEffects(true);
                  }, 450);
                }}
                onPointerUp={() => holdTimer.current && clearTimeout(holdTimer.current)}
                onPointerLeave={() => holdTimer.current && clearTimeout(holdTimer.current)}
                onClick={() => {
                  if (!held.current) submit();
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setEffects(true);
                }}
                className={cn("grid size-11 shrink-0 animate-pop place-items-center rounded-full bg-accent text-white shadow-lg shadow-accent/25 transition active:scale-90 ")}
                title="Send (hold for effects)"
              >
                <SendHorizontal className="size-5" />
              </button>
            ) : (
              <button
                onClick={beginRecording}
                className={cn("grid size-11 shrink-0 place-items-center rounded-full bg-side text-sub transition hover:text-accent active:scale-90 ")}
                title="Record a voice message"
              >
                <Mic className="size-[22px]" />
              </button>
            )}
            {timerAllowed && (
              <button
                onClick={() => setTimerOpen(true)}
                className={cn(
                  "relative grid size-11 shrink-0 place-items-center rounded-full transition active:scale-90 max-[520px]:hidden",
                  ttl ? "bg-accent/20 text-accent" : "bg-side text-sub hover:text-accent",
                )}
                title={ttl ? `Messages disappear after ${TTL_OPTIONS.find((o) => o.secs === ttl)?.label}` : "Disappearing messages"}
                aria-label="Disappearing messages timer"
              >
                <Timer className="size-[21px]" />
                {!!ttl && (
                  <span className="absolute -top-0.5 -right-0.5 rounded-full bg-accent px-1 text-[9px] leading-[14px] font-black text-white">{TTL_OPTIONS.find((o) => o.secs === ttl)?.short}</span>
                )}
              </button>
            )}
          </div>
        )}
        {editingId && (
          <div className="mt-1 flex items-center gap-1 px-2 text-xs text-sub">
            <Pencil className="size-3" /> Editing message — enter to save, escape to cancel
          </div>
        )}
      </div>

      <Sheet open={timerOpen} onClose={() => setTimerOpen(false)} title="Disappearing messages">
        <p className="mb-3 text-sm text-sub">
          Chat-wide timer deletes every message older than the time you pick. Tip: select text in the composer → Format → Vanish to hide just that span after a countdown.
        </p>
        <div className="space-y-1.5 pb-1">
          {TTL_OPTIONS.map((o) => (
            <button
              key={o.label}
              onClick={async () => {
                setTimerOpen(false);
                if ((ttl ?? null) === o.secs) return;
                if (o.secs && !confirm(`Delete every message older than ${o.label} in this chat, now and from now on?`)) return;
                haptic.select();
                await setTtl(conversationId, o.secs);
              }}
              className={cn("flex w-full items-center gap-3 rounded-2xl bg-white/[.06] px-4 py-3 text-left transition active:scale-[.98]", (ttl ?? null) === o.secs && "ring-2 ring-accent")}
            >
              <Timer className={cn("size-5", o.secs ? "text-accent" : "text-sub")} />
              <span className="flex-1 font-semibold">{o.label}</span>
              {(ttl ?? null) === o.secs && <span className="text-xs font-bold text-accent">ON</span>}
            </button>
          ))}
        </div>
      </Sheet>

      <Sheet open={colorOpen} onClose={() => setColorOpen(false)} title="Colored text">
        <p className="mb-3 text-sm text-sub">Select text first (or place the cursor), then pick a color. Pink leads for Ksubi Pink vibes.</p>
        <div className="grid grid-cols-3 gap-2 pb-2">
          {FORMAT_COLORS.map((c) => (
            <button
              key={c.id}
              type="button"
              title={c.label}
              onClick={() => {
                setColorOpen(false);
                applyWrap(`{c:${c.id}}`, "{/c}");
              }}
              className={cn(
                "flex items-center gap-2 rounded-2xl bg-white/[.06] px-3 py-3 text-left transition active:scale-[.98] hover:bg-white/[.1]",
                c.id === "pink" && "ring-1 ring-[#ff4da6]/55",
              )}
            >
              <span className="size-5 rounded-full ring-2 ring-white/20" style={{ background: c.hex }} />
              <span className="font-semibold" style={{ color: c.hex }}>
                {c.label}
              </span>
            </button>
          ))}
        </div>
      </Sheet>

      <Sheet open={vanishOpen} onClose={() => setVanishOpen(false)} title="Vanish selection">
        <p className="mb-3 text-sm text-sub">Wraps the selected text so it disappears for everyone after the countdown (from when the message is sent).</p>
        <div className="space-y-1.5 pb-1">
          {VANISH_PICKS.map((o) => (
            <button
              key={o.secs}
              type="button"
              onClick={() => {
                setVanishOpen(false);
                applyWrap(`{v:${o.secs}}`, "{/v}");
              }}
              className="flex w-full items-center gap-3 rounded-2xl bg-white/[.06] px-4 py-3 text-left active:scale-[.98]"
            >
              <Timer className="size-5 text-accent" />
              <span className="flex-1 font-semibold">{o.label}</span>
            </button>
          ))}
        </div>
      </Sheet>

      <Sheet open={effects} onClose={() => setEffects(false)} title="Send with effect">
        <div className="mb-2 grid grid-cols-2 gap-2">
          {(
            [
              ["hidden", "🙈", "Hidden message", "Invisible ink — hold to read"],
              ["spoiler", "⚠️", "Spoiler", "Text & media behind a cover"],
            ] as const
          ).map(([id, icon, label, hint]) => (
            <button
              key={id}
              onClick={() => {
                haptic.select();
                setMode(mode === id ? null : id);
                setEffects(false);
                area.current?.focus();
              }}
              className={cn("flex items-center gap-2.5 rounded-2xl bg-white/[.06] p-3 text-left transition active:scale-95", mode === id && "ring-2 ring-accent")}
            >
              <span className="text-2xl">{icon}</span>
              <span className="min-w-0">
                <span className="block text-[13px] font-bold">{label}</span>
                <span className="block truncate text-[11px] text-sub">{hint}</span>
              </span>
            </button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2 pb-1">
          {EFFECTS.map((e) => (
            <button
              key={e.id}
              onClick={() => {
                haptic.select();
                setEffects(false);
                if (canSend) submit(e.id);
                else {
                  setEffect(e.id);
                  playEffect(e.id);
                  area.current?.focus();
                }
              }}
              className={cn("flex flex-col items-center gap-1.5 rounded-2xl bg-white/[.06] py-4 transition active:scale-95", effect === e.id && "ring-2 ring-accent")}
            >
              <span className="text-3xl">{e.icon}</span>
              <span className="text-[13px] font-semibold">{e.label}</span>
            </button>
          ))}
        </div>
        <p className="px-2 pt-2 pb-1 text-center text-xs text-sub">Tip: hold the send button to pick an effect. Words like “congrats” or “happy birthday” trigger one automatically.</p>
      </Sheet>

      {snapOpen && <SnapCamera chatId={conversationId} onClose={() => setSnapOpen(false)} onAttach={(f) => setFile(f)} />}

      {file && editOpen && shouldOpenAttachEditor(file) && (
        <AttachEditor
          file={file}
          open={editOpen}
          onClose={() => setEditOpen(false)}
          onApply={(f) => {
            skipAutoEdit.current = true;
            setFile(f);
            setEditOpen(false);
          }}
        />
      )}
    </div>
  );
}

function FmtBtn({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="grid size-8 place-items-center rounded-lg text-sub transition hover:bg-white/10 hover:text-txt active:scale-90"
    >
      {children}
    </button>
  );
}
