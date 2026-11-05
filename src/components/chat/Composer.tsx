"use client";

import { usePrefs } from "@/lib/prefs";
import { useEffect, useRef, useState } from "react";
import { FileText, Mic, Paperclip, Pencil, Reply, SendHorizontal, Smile, Sparkles, Timer, Trash2, Wand2, X } from "lucide-react";
import { useApp, conversationTitle, toast } from "@/store/app";
import { useChat } from "@/store/chat";
import { TTL_OPTIONS, runBotCommand, sendMessage, setTtl } from "@/lib/data";
import { NEED, gate, myTier } from "@/lib/premium";
import { sendLive, sendTyping } from "@/lib/realtime";
import { EFFECTS, playEffect, type EffectKind } from "@/lib/effects";
import { haptic } from "@/lib/haptics";
import { cn, formatBytes } from "@/lib/utils";
import EmojiPicker from "@/components/ui/EmojiPicker";
import Sheet from "@/components/ui/Sheet";
import { isVoice } from "./MessageBubble";
import { ComposerPlus } from "./Extras";
import AttachEditor, { shouldOpenAttachEditor } from "./AttachEditor";

const MAX_FREE = 25 * 1024 * 1024;
const MAX_PREMIUM = 100 * 1024 * 1024;
const MAX_VOICE_SECONDS = 300;

function voiceMime() {
  if (typeof MediaRecorder === "undefined") return null;
  for (const t of ["audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"]) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return "";
}

type Rec = { recorder: MediaRecorder; stream: MediaStream; chunks: Blob[]; started: number; ctx: AudioContext; analyser: AnalyserNode; mime: string };

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
  const [preview, setPreview] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs] = useState(0);
  const [levels, setLevels] = useState<number[]>(() => Array(28).fill(0.1));
  const [editOpen, setEditOpen] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const rec = useRef<Rec | null>(null);
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
      if (max === MAX_FREE && file.size <= MAX_PREMIUM) gate(NEED.uploads100, "Files up to 100 MB");
      else toast(`That file is ${formatBytes(file.size)} — the limit is ${max / 1048576} MB.`, "error");
      setFile(null);
    }
  }, [file, setFile]);

  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [text]);

  // stop recording if the chat changes / unmounts
  useEffect(() => () => cancelRecording(), [conversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  function submit(withEffect: EffectKind | null = effect) {
    if (!text.trim() && !file) return;
    haptic.light();
    const t = text.trim();
    // Any /command — built-in or community bots
    const isCmd = !file && /^\/[a-z][\w-]{0,30}\b/i.test(t);
    void sendMessage(conversationId, text, file, withEffect).then(() => {
      if (isCmd) void runBotCommand(conversationId, t);
    });
    setText("");
    if (me) sendLive(me, "");
    setFile(null);
    setEditOpen(false);
    setEffect(null);
  }

  // ---------------------------------------------------------------- voice messages
  async function startRecording() {
    const mime = voiceMime();
    if (mime === null || !navigator.mediaDevices?.getUserMedia) {
      toast("Voice messages aren't supported in this browser.", "error");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 64000 }) : new MediaRecorder(stream);
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const r: Rec = { recorder, stream, chunks: [], started: Date.now(), ctx, analyser, mime: recorder.mimeType || mime || "audio/webm" };
      recorder.ondataavailable = (e) => e.data.size && r.chunks.push(e.data);
      recorder.start(250);
      rec.current = r;
      setRecording(true);
      setRecSecs(0);
      haptic.medium();
    } catch {
      toast("Microphone permission is needed for voice messages.", "error");
    }
  }

  useEffect(() => {
    if (!recording) return;
    const buf = new Uint8Array(128);
    let raf = 0;
    let lastPush = 0;
    const loop = (t: number) => {
      const r = rec.current;
      if (!r) return;
      if (t - lastPush > 90) {
        lastPush = t;
        r.analyser.getByteTimeDomainData(buf);
        let peak = 0;
        for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
        setLevels((l) => [...l.slice(1), Math.max(0.08, Math.min(1, peak / 64))]);
        const secs = Math.floor((Date.now() - r.started) / 1000);
        setRecSecs(secs);
        if (secs >= MAX_VOICE_SECONDS) void finishRecording();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [recording]); // eslint-disable-line react-hooks/exhaustive-deps

  function teardown(r: Rec) {
    r.stream.getTracks().forEach((t) => t.stop());
    void r.ctx.close();
    rec.current = null;
    setRecording(false);
    setLevels(Array(28).fill(0.1));
  }

  function cancelRecording() {
    const r = rec.current;
    if (!r) return;
    r.recorder.onstop = null;
    if (r.recorder.state !== "inactive") r.recorder.stop();
    teardown(r);
  }

  async function finishRecording() {
    const r = rec.current;
    if (!r) return;
    const secs = (Date.now() - r.started) / 1000;
    await new Promise<void>((res) => {
      r.recorder.onstop = () => res();
      r.recorder.stop();
    });
    teardown(r);
    if (secs < 0.8) {
      toast("Hold on a little longer to record", "info");
      return;
    }
    const type = r.mime.split(";")[0];
    const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
    const blob = new Blob(r.chunks, { type });
    const f = new File([blob], `voice-${Date.now()}.${ext}`, { type });
    haptic.success();
    void sendMessage(conversationId, "", f, null);
  }

  // ---------------------------------------------------------------- render
  const placeholder = kind === "text" ? `Message #${title}` : kind === "dm" ? `Message ${title}` : "Message";
  const canSend = !!text.trim() || !!file;
  const chosen = EFFECTS.find((e) => e.id === effect);
  const mm = `${Math.floor(recSecs / 60)}:${String(recSecs % 60).padStart(2, "0")}`;

  return (
    <div className="composer shrink-0 bg-wall px-2 pt-1.5 pb-safe-2 sm:px-6 sm:pb-3">
      <div className="mx-auto max-w-4xl">
        {slow > 0 && (
          <div className="mb-1 flex items-center gap-1.5 px-2 text-xs font-semibold text-sub">
            <span className="animate-pulse">🐢</span> Slow mode is on · one message every {slow >= 60 ? `${Math.round(slow / 60)} min` : `${slow}s`}
          </div>
        )}
        {(replyTo || file || chosen) && !recording && (
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
              <div className="flex min-w-0 items-center gap-2">
                {preview ? (
                  <img src={preview} alt="" className="size-12 rounded-lg object-cover" />
                ) : (
                  <div className="grid size-12 place-items-center rounded-lg bg-accent text-white">
                    <FileText className="size-6" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{file.name}</div>
                  <div className="text-xs text-sub">{formatBytes(file.size)}</div>
                </div>
                {shouldOpenAttachEditor(file) && (
                  <button onClick={() => setEditOpen(true)} className="grid size-9 place-items-center rounded-full text-accent hover:bg-white/5" aria-label="Edit attachment" title="Edit">
                    <Wand2 className="size-4" />
                  </button>
                )}
                <button onClick={() => setFile(null)} className="p-1 text-sub" aria-label="Remove file">
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
          </div>
        )}

        {recording ? (
          <div className="flex animate-fade items-center gap-2">
            <button onClick={cancelRecording} className="grid size-11 shrink-0 place-items-center rounded-full text-dnd active:scale-90" aria-label="Discard recording">
              <Trash2 className="size-[22px]" />
            </button>
            <div className="flex h-11 min-w-0 flex-1 items-center gap-3 rounded-full bg-side px-4">
              <span className="size-2.5 shrink-0 animate-pulse rounded-full bg-dnd" />
              <span className="w-10 shrink-0 text-[15px] font-semibold tabular-nums">{mm}</span>
              <div className="flex h-6 min-w-0 flex-1 items-center justify-end gap-[3px] overflow-hidden">
                {levels.map((l, i) => (
                  <span key={i} className="w-[3px] shrink-0 rounded-full bg-accent transition-[height] duration-75" style={{ height: `${Math.round(l * 100)}%` }} />
                ))}
              </div>
            </div>
            <button
              onClick={() => void finishRecording()}
              className="grid size-11 shrink-0 animate-pop place-items-center rounded-full bg-accent text-white shadow-lg shadow-accent/30 active:scale-90"
              aria-label="Send voice message"
            >
              <SendHorizontal className="size-5" />
            </button>
          </div>
        ) : (
          <div className="relative flex items-end gap-1.5">
            <input
              ref={fileInput}
              type="file"
              accept="image/*,audio/wav,audio/mpeg,audio/mp3,audio/aac,audio/mp4,audio/x-m4a,.wav,.mp3,.aac,.m4a,video/*,*/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setFile(f);
                e.target.value = "";
              }}
            />
            <button onClick={() => fileInput.current?.click()} className="grid size-11 shrink-0 place-items-center rounded-full text-sub transition hover:text-txt active:scale-90" title="Attach image, audio, or file">
              <Paperclip className="size-[22px]" />
            </button>
            <ComposerPlus conversationId={conversationId} />

            <div className="flex min-h-11 min-w-0 flex-1 items-end rounded-[22px] border border-white/[.06] bg-side pr-1">
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
                  const f = e.clipboardData.files?.[0];
                  if (f) {
                    e.preventDefault();
                    setFile(f);
                  }
                }}
                onKeyDown={(e) => {
                  const touchDevice = window.matchMedia("(hover: none)").matches;
                  const enterSends = usePrefs.getState().enterToSend;
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
                    useChat.setState({ replyTo: null });
                  }
                }}
                className="max-h-[180px] min-h-11 min-w-0 flex-1 resize-none bg-transparent py-[11px] pl-4 text-[16px] leading-[22px] outline-none placeholder:text-sub md:text-[15px]"
              />
              <button onClick={() => setEffects(true)} className={cn("grid size-9 shrink-0 place-items-center rounded-full transition active:scale-90 mb-1", effect ? "text-accent" : "text-sub hover:text-accent")} title="Send with effect">
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
                className="grid size-11 shrink-0 animate-pop place-items-center rounded-full bg-accent text-white shadow-lg shadow-accent/25 transition active:scale-90"
                title="Send (hold for effects)"
              >
                <SendHorizontal className="size-5" />
              </button>
            ) : (
              <button
                onClick={() => void startRecording()}
                className="grid size-11 shrink-0 place-items-center rounded-full bg-side text-sub transition hover:text-accent active:scale-90"
                title="Record a voice message"
              >
                <Mic className="size-[22px]" />
              </button>
            )}
            {timerAllowed && (
              <button
                onClick={() => setTimerOpen(true)}
                className={cn(
                  "relative grid size-11 shrink-0 place-items-center rounded-full transition active:scale-90",
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
        <p className="mb-3 text-sm text-sub">All messages in this chat — old and new, from everyone — are deleted for good once they&apos;re older than the time you pick. Files and voice messages too.</p>
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

      <Sheet open={effects} onClose={() => setEffects(false)} title="Send with effect">
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
