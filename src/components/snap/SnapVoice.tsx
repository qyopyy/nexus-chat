"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, ChevronDown, ChevronLeft, Mic, Pause, Play, RotateCcw, RotateCw, Square, Trash2, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast, useApp, conversationTitle } from "@/store/app";
import { refreshChatList, sendMessage } from "@/lib/data";
import { uploadVault } from "@/lib/protect";
import { useSignedUrl } from "@/lib/storage";
import { findSnapUser } from "@/lib/snapShare";
import type { Message } from "@/lib/types";
import { baseMime } from "@/lib/snap";
import {
  SLICE_MS,
  VOICE_MAX_MS,
  barsForDuration,
  formatClock,
  formatTimer,
  isVoiceName,
  levelToBar,
  peaksFromChannel,
  pickAudioMime,
  rmsLevel,
} from "@/lib/snapVoice";
import { cn } from "@/lib/utils";
import { downsamplePeaks, isFlat, parseVoiceName, voiceName } from "@/lib/voiceWave";
import SnapWave from "./SnapWave";
import { Sheet } from "./SnapUi";

const CONV_KEY = "snap.voiceConv";

// ---------------------------------------------------------------- playback helpers
let playing: HTMLAudioElement | null = null;
const peakCache = new Map<string, { peaks: number[]; duration: number }>();
let decodeQueue: Promise<unknown> = Promise.resolve();

/** decodes a voice message once (one at a time, so a long thread doesn't freeze a phone) → 50 ms bars */
function analyse(key: string, url: string): Promise<{ peaks: number[]; duration: number } | null> {
  const hit = peakCache.get(key);
  if (hit) return Promise.resolve(hit);
  const job = decodeQueue.then(async () => {
    try {
      const buf = await (await fetch(url)).arrayBuffer();
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      try {
        const audio = await ctx.decodeAudioData(buf);
        const res = { peaks: peaksFromChannel(audio.getChannelData(0), barsForDuration(audio.duration)), duration: audio.duration };
        if (isFlat(res.peaks)) return null; // a silent or broken decode is not a waveform, and is not remembered
        peakCache.set(key, res);
        return res;
      } finally {
        void ctx.close();
      }
    } catch {
      return null;
    }
  });
  decodeQueue = job.catch(() => undefined);
  return job;
}

/** one voice message in the thread: play/pause + waveform you can tap to seek */
function Bubble({ m, mine }: { m: Message; mine: boolean }) {
  const { url } = useSignedUrl(m.attachment_url);
  const audio = useRef<HTMLAudioElement | null>(null);
  const pos = useRef(0);
  const baked = parseVoiceName(m.attachment_name);
  const [peaks, setPeaks] = useState<number[]>(() => peakCache.get(m.id)?.peaks ?? baked?.peaks ?? []);
  const [duration, setDuration] = useState(peakCache.get(m.id)?.duration ?? baked?.duration ?? 0);
  const [on, setOn] = useState(false);
  const [, force] = useState(0);

  useEffect(() => {
    // new voice messages already carry their waveform: nothing to wait for, nothing to redraw
    if (!url || baked) return;
    let live = true;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = () =>
      void analyse(m.id, url).then((r) => {
        if (!live) return;
        if (!r) {
          // a message that was only just uploaded may not be readable yet: try again a few times
          if (++tries < 4) timer = setTimeout(run, 1200 * tries);
          return;
        }
        setPeaks(r.peaks);
        setDuration((d) => d || r.duration);
      });
    run();
    return () => {
      live = false;
      if (timer) clearTimeout(timer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, m.id, !!baked]);

  useEffect(
    () => () => {
      const a = audio.current;
      if (a) {
        a.pause();
        if (playing === a) playing = null;
      }
    },
    [],
  );

  const toggle = () => {
    if (!url) return;
    let a = audio.current;
    if (!a) {
      a = new Audio(url);
      a.preload = "auto";
      a.ontimeupdate = () => {
        pos.current = a!.currentTime;
        force((n) => n + 1);
      };
      a.onloadedmetadata = () => Number.isFinite(a!.duration) && setDuration(a!.duration);
      a.onended = () => {
        setOn(false);
        pos.current = 0;
        force((n) => n + 1);
      };
      a.onpause = () => setOn(false);
      a.onplay = () => setOn(true);
      audio.current = a;
    }
    if (a.paused) {
      if (playing && playing !== a) playing.pause();
      playing = a;
      void a.play().catch(() => toast("Couldn't play that message", "error"));
    } else a.pause();
  };

  const seek = (sec: number) => {
    pos.current = sec;
    if (audio.current) audio.current.currentTime = sec;
    force((n) => n + 1);
  };

  return (
    <div className={cn("flex w-[min(20rem,86%)] items-center gap-3 rounded-3xl px-3 py-2.5", mine ? "ml-auto bg-[#ff453a]" : "mr-auto bg-white/12")}>
      <button type="button" onClick={toggle} disabled={!url} aria-label={on ? "Pause" : "Play"} className="grid size-9 shrink-0 place-items-center rounded-full bg-white/90 text-black disabled:opacity-40">
        {on ? <Pause className="size-4 fill-black" /> : <Play className="size-4 fill-black" />}
      </button>
      <div className="min-w-0 flex-1">
        <SnapWave mode="overview" peaks={peaks.length ? peaks : new Array(40).fill(0.14)} getPos={() => pos.current} duration={duration || 1} onSeek={seek} className="h-9 w-full" played={mine ? "#fff" : "#ff453a"} rest={mine ? "rgba(255,255,255,.45)" : "rgba(255,255,255,.35)"} />
        <div className="mt-0.5 flex justify-between text-[10px] font-semibold tabular-nums opacity-70">
          <span>{formatClock(on || pos.current > 0 ? pos.current : duration)}</span>
          <span>{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- recorder
type Phase = "idle" | "rec" | "paused" | "review";
type Take = { blob: Blob; url: string; ext: string; ms: number; peaks: number[] };

/**
 * Nexus Snap voice messages: record with a live Voice Memos style waveform, scrub the recording, then send it
 * as a normal Nexus voice message to a friend (or reply in a thread). Messages in both directions show up here.
 */
export default function SnapVoice({ onClose, chatId }: { onClose: () => void; chatId?: string | null }) {
  const chats = useApp((s) => s.chatList);
  const me = useApp((s) => s.userId);
  const [convId, setConvId] = useState<string | null>(() => {
    if (chatId) return chatId;
    try {
      return localStorage.getItem(CONV_KEY);
    } catch {
      return null;
    }
  });
  const [picker, setPicker] = useState(false);
  const [find, setFind] = useState("");
  const [findErr, setFindErr] = useState("");
  const [msgs, setMsgs] = useState<Message[] | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [ms, setMs] = useState(0);
  const [take, setTake] = useState<Take | null>(null);
  const [saveCopy, setSaveCopy] = useState(true);
  const [sending, setSending] = useState(false);
  const [playPos, setPlayPos] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const rec = useRef<{ mr: MediaRecorder; stream: MediaStream; ctx: AudioContext; analyser: AnalyserNode; chunks: Blob[]; mime: string; ext: string } | null>(null);
  const peaks = useRef<number[]>([]);
  const elapsed = useRef(0);
  const last = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const phaseRef = useRef<Phase>("idle");
  phaseRef.current = phase;
  const preview = useRef<HTMLAudioElement | null>(null);
  const posRef = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);

  // the chosen conversation must still exist
  useEffect(() => {
    if (convId && chats.length && !chats.some((c) => c.id === convId)) setConvId(null);
  }, [convId, chats]);
  useEffect(() => {
    if (!convId) setPicker(true);
    else
      try {
        localStorage.setItem(CONV_KEY, convId);
      } catch {
        /* private mode */
      }
  }, [convId]);

  // thread: voice messages both ways, live
  useEffect(() => {
    if (!convId) {
      setMsgs(null);
      return;
    }
    let live = true;
    setMsgs(null);
    const keep = (m: Message) => isVoiceName(m.attachment_name) && !!m.attachment_type?.startsWith("audio/") && !m.deleted_at;
    const load = async () => {
      const { data } = await supabase.from("messages").select("*").eq("conversation_id", convId).like("attachment_type", "audio/%").order("created_at", { ascending: false }).limit(60);
      if (live) setMsgs(((data ?? []) as Message[]).filter(keep).reverse());
    };
    void load();
    const ch = supabase
      .channel(`snapvoice:${convId}:${Math.random().toString(36).slice(2, 8)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${convId}` }, ({ new: row }) => {
        const m = row as Message;
        if (keep(m)) setMsgs((x) => (x && !x.some((y) => y.id === m.id) ? [...x, m] : x));
      })
      .subscribe();
    const poll = setInterval(() => void load(), 20_000); // safety net if the realtime socket sleeps
    return () => {
      live = false;
      clearInterval(poll);
      void supabase.removeChannel(ch);
    };
  }, [convId]);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs?.length]);

  // ---------------------------------------------------------------- recording
  const releaseMic = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    const r = rec.current;
    if (!r) return;
    r.stream.getTracks().forEach((t) => t.stop());
    void r.ctx.close().catch(() => undefined);
  }, []);

  const cancel = useCallback(() => {
    const r = rec.current;
    if (r) {
      r.mr.onstop = null;
      try {
        if (r.mr.state !== "inactive") r.mr.stop();
      } catch {
        /* already stopped */
      }
    }
    releaseMic();
    rec.current = null;
    peaks.current = [];
    elapsed.current = 0;
    setMs(0);
    setPhase("idle");
  }, [releaseMic]);

  useEffect(
    () => () => {
      cancel();
      preview.current?.pause();
    },
    [cancel],
  );

  const stopRecording = useCallback(() => {
    const r = rec.current;
    if (!r || r.mr.state === "inactive") return;
    r.mr.stop();
  }, []);

  const startRecording = async () => {
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      toast("Voice recording isn't supported in this browser.", "error");
      return;
    }
    const fmt = pickAudioMime((m) => MediaRecorder.isTypeSupported(m));
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: { ideal: 2 }, sampleRate: { ideal: 48000 } } });
    } catch {
      toast("Allow the microphone for Nexus to record a voice message.", "error");
      return;
    }
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    void ctx.resume().catch(() => undefined);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.25;
    ctx.createMediaStreamSource(stream).connect(analyser);
    let mr: MediaRecorder;
    try {
      mr = new MediaRecorder(stream, fmt ? { mimeType: fmt.mime, audioBitsPerSecond: 510_000 } : undefined);
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      void ctx.close();
      toast("Couldn't start recording on this device.", "error");
      return;
    }
    const mime = baseMime(mr.mimeType || fmt?.mime || "audio/webm");
    const ext = mime.includes("mp4") || mime.includes("aac") ? "m4a" : mime.includes("ogg") ? "ogg" : "webm";
    const chunks: Blob[] = [];
    mr.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
    mr.onstop = () => {
      releaseMic();
      const blob = new Blob(chunks, { type: mime });
      const total = elapsed.current;
      rec.current = null;
      if (blob.size === 0 || total < 300) {
        peaks.current = [];
        elapsed.current = 0;
        setMs(0);
        setPhase("idle");
        if (total >= 1) toast("Too short. Hold on a bit longer.");
        return;
      }
      setTake({ blob, url: URL.createObjectURL(blob), ext, ms: total, peaks: peaks.current.slice() });
      posRef.current = 0;
      setPlayPos(0);
      setPhase("review");
    };
    rec.current = { mr, stream, ctx, analyser, chunks, mime, ext };
    peaks.current = [];
    elapsed.current = 0;
    last.current = performance.now();
    setMs(0);
    mr.start(250);
    setPhase("rec");
    try {
      navigator.vibrate?.(15);
    } catch {
      /* not supported */
    }
    const buf = new Uint8Array(analyser.fftSize);
    let acc = 0;
    timer.current = setInterval(() => {
      const now = performance.now();
      const dt = now - last.current;
      last.current = now;
      if (phaseRef.current !== "rec") return;
      elapsed.current += dt;
      acc += dt;
      analyser.getByteTimeDomainData(buf);
      const bar = levelToBar(rmsLevel(buf));
      while (acc >= SLICE_MS) {
        peaks.current.push(bar);
        acc -= SLICE_MS;
      }
      setMs(elapsed.current);
      if (elapsed.current >= VOICE_MAX_MS) stopRecording();
    }, 25);
  };

  const pauseResume = () => {
    const r = rec.current;
    if (!r) return;
    if (phase === "rec") {
      r.mr.pause();
      setPhase("paused");
    } else if (phase === "paused") {
      last.current = performance.now();
      r.mr.resume();
      setPhase("rec");
    }
  };

  // ---------------------------------------------------------------- review (play, scrub, send)
  useEffect(() => {
    if (!take) return;
    const a = new Audio(take.url);
    a.preload = "auto";
    a.ontimeupdate = () => {
      posRef.current = a.currentTime;
      setPlayPos(a.currentTime);
    };
    a.onended = () => {
      setIsPlaying(false);
      posRef.current = 0;
      setPlayPos(0);
      a.currentTime = 0;
    };
    a.onplay = () => setIsPlaying(true);
    a.onpause = () => setIsPlaying(false);
    preview.current = a;
    return () => {
      a.pause();
      preview.current = null;
      setIsPlaying(false);
      URL.revokeObjectURL(take.url);
    };
  }, [take]);

  const seekPreview = (sec: number) => {
    posRef.current = sec;
    setPlayPos(sec);
    if (preview.current) preview.current.currentTime = sec;
  };
  const duration = take ? take.ms / 1000 : 0;
  const togglePreview = () => {
    const a = preview.current;
    if (!a) return;
    if (a.paused) {
      if (playing && playing !== a) playing.pause();
      playing = a;
      void a.play();
    } else a.pause();
  };
  const skip = (d: number) => seekPreview(Math.max(0, Math.min(duration, posRef.current + d)));

  const discard = () => {
    setTake(null);
    peaks.current = [];
    elapsed.current = 0;
    setMs(0);
    setPhase("idle");
  };

  const send = async () => {
    if (!take || !convId || sending) return;
    setSending(true);
    try {
      const file = new File([take.blob], voiceName(Date.now(), take.ms / 1000, downsamplePeaks(take.peaks), take.ext), { type: baseMime(take.blob.type) });
      await sendMessage(convId, "", file);
      if (saveCopy) {
        void uploadVault(file, "Snap Voice", undefined, { kind: "file", note: "Nexus Snap voice message", duration_ms: take.ms, original: true }).catch(() => undefined);
      }
      toast("Voice message sent", "success");
      discard();
      setTimeout(() => {
        void supabase
          .from("messages")
          .select("*")
          .eq("conversation_id", convId)
          .like("attachment_type", "audio/%")
          .order("created_at", { ascending: false })
          .limit(60)
          .then(({ data }) => setMsgs(((data ?? []) as Message[]).filter((m) => isVoiceName(m.attachment_name) && !m.deleted_at).reverse()));
      }, 900);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't send", "error");
    } finally {
      setSending(false);
    }
  };

  // ---------------------------------------------------------------- picking who to talk to
  const startWith = async (input: string) => {
    setFindErr("");
    try {
      const u = await findSnapUser(input);
      const { data, error } = await supabase.rpc("get_or_create_dm", { p_user: u.id });
      if (error || !data) throw new Error(error?.message || "Couldn't open a chat with them.");
      void refreshChatList();
      setConvId(data as string);
      setPicker(false);
      setFind("");
    } catch (e) {
      setFindErr(e instanceof Error ? e.message : "Couldn't find them.");
    }
  };

  const title = convId ? conversationTitle(useApp.getState(), convId) || "Chat" : "Pick a chat";
  const busy = phase !== "idle";

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-black">
      <header className="flex items-center gap-2 px-3 pb-2 pt-safe-3">
        <button type="button" onClick={onClose} disabled={phase === "rec"} aria-label="Back to camera" className="grid size-10 place-items-center rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-40">
          <ChevronLeft className="size-5" />
        </button>
        <button type="button" onClick={() => !busy && setPicker(true)} className="mx-auto inline-flex min-w-0 max-w-[70%] items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-sm font-bold">
          <span className="truncate">{title}</span>
          <ChevronDown className="size-4 shrink-0 opacity-60" />
        </button>
        <span className="size-10" />
      </header>

      <div ref={listRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-2">
        {!convId && <p className="p-6 text-center text-sm text-white/60">Choose who to send voice messages to.</p>}
        {convId && msgs === null && <p className="p-6 text-center text-sm text-white/60">Loading…</p>}
        {convId && msgs?.length === 0 && <p className="p-6 text-center text-sm text-white/60">No voice messages yet. Tap the red button and say something.</p>}
        {msgs?.map((m) => (
          <Bubble key={m.id} m={m} mine={m.author_id === me} />
        ))}
      </div>

      <div className="relative z-10 rounded-t-3xl bg-[#111114] px-4 pb-safe-2 pt-4">
        {phase === "idle" && (
          <div className="grid place-items-center gap-2 pb-2">
            <button type="button" onClick={() => void startRecording()} disabled={!convId} aria-label="Record voice message" className="grid size-[76px] place-items-center rounded-full border-4 border-white/90 transition active:scale-90 disabled:opacity-40">
              <Mic className="size-8 text-[#ff453a]" />
            </button>
            <p className="text-[11px] text-white/45">Tap to record · sent as a Nexus voice message</p>
          </div>
        )}

        {(phase === "rec" || phase === "paused") && (
          <div className="space-y-3">
            <SnapWave mode="live" getPeaks={() => peaks.current} className="h-24 w-full" />
            <div className="text-center text-5xl font-extralight tabular-nums tracking-tight">{formatTimer(ms)}</div>
            <div className="flex items-center justify-around pb-2">
              <button type="button" onClick={cancel} aria-label="Cancel recording" className="grid size-12 place-items-center rounded-full bg-white/10 hover:bg-white/20">
                <X className="size-5" />
              </button>
              <button type="button" onClick={stopRecording} aria-label="Stop recording" className="grid size-[76px] place-items-center rounded-full border-4 border-white/90 active:scale-90">
                <span className="size-7 rounded-md bg-[#ff453a]" />
              </button>
              <button type="button" onClick={pauseResume} aria-label={phase === "rec" ? "Pause recording" : "Resume recording"} className="grid size-12 place-items-center rounded-full bg-white/10 hover:bg-white/20">
                {phase === "rec" ? <Pause className="size-5 fill-white" /> : <Mic className="size-5 text-[#ff453a]" />}
              </button>
            </div>
          </div>
        )}

        {phase === "review" && take && (
          <div className="space-y-3">
            <SnapWave mode="scroll" peaks={take.peaks} getPos={() => posRef.current} duration={duration} onSeek={seekPreview} className="h-24 w-full" />
            <div className="flex items-baseline justify-center gap-2 tabular-nums">
              <span className="text-4xl font-extralight">{formatTimer(playPos * 1000)}</span>
              <span className="text-xs text-white/45">/ {formatTimer(take.ms)}</span>
            </div>
            <div className="flex items-center justify-center gap-6">
              <button type="button" onClick={() => skip(-15)} aria-label="Back 15 seconds" className="grid size-11 place-items-center rounded-full text-white/80 hover:bg-white/10">
                <RotateCcw className="size-6" />
              </button>
              <button type="button" onClick={togglePreview} aria-label={isPlaying ? "Pause" : "Play"} className="grid size-14 place-items-center rounded-full bg-white text-black active:scale-95">
                {isPlaying ? <Pause className="size-6 fill-black" /> : <Play className="size-6 fill-black" />}
              </button>
              <button type="button" onClick={() => skip(15)} aria-label="Forward 15 seconds" className="grid size-11 place-items-center rounded-full text-white/80 hover:bg-white/10">
                <RotateCw className="size-6" />
              </button>
            </div>
            <div className="flex items-center justify-between gap-3 pb-1">
              <button type="button" onClick={discard} aria-label="Delete recording" className="grid size-12 place-items-center rounded-full bg-white/10 hover:bg-white/20">
                <Trash2 className="size-5" />
              </button>
              <label className="flex items-center gap-2 text-[11px] text-white/60">
                <input type="checkbox" checked={saveCopy} onChange={(e) => setSaveCopy(e.target.checked)} className="size-4 accent-[#ff453a]" />
                Save a copy to Nexus Drive
              </label>
              <button type="button" onClick={() => void send()} disabled={sending || !convId} aria-label="Send voice message" className="grid size-12 place-items-center rounded-full bg-[#ff453a] text-white active:scale-90 disabled:opacity-50">
                <ArrowUp className="size-6" />
              </button>
            </div>
          </div>
        )}
      </div>

      {picker && (
        <Sheet title="Send voice messages to…" onClose={() => convId && setPicker(false)} z="z-[60]">
          <form
            className="flex gap-2 px-4 pb-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (find.trim()) void startWith(find);
            }}
          >
            <input
              value={find}
              onChange={(e) => {
                setFind(e.target.value);
                setFindErr("");
              }}
              placeholder="@username or email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="min-w-0 flex-1 rounded-full bg-white/10 px-4 py-2.5 text-sm outline-none placeholder:text-white/40 focus:bg-white/15"
            />
            <button type="submit" disabled={!find.trim()} className="rounded-full bg-white px-4 text-sm font-bold text-black disabled:opacity-40">
              Go
            </button>
          </form>
          {findErr && <p className="px-4 pb-3 text-xs text-rose-300">{findErr}</p>}
          {chats.length === 0 && <p className="px-4 pb-4 text-sm text-white/55">No chats yet. Type a username or email above.</p>}
          {chats.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                setConvId(c.id);
                setPicker(false);
              }}
              className={cn("flex w-full items-center gap-3 border-t border-white/10 px-4 py-3 text-left hover:bg-white/5", c.id === convId && "bg-white/5")}
            >
              <span className="grid size-9 place-items-center rounded-full bg-white/15 text-sm font-bold uppercase">{(conversationTitle(useApp.getState(), c.id) || "?")[0]}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{conversationTitle(useApp.getState(), c.id) || "Chat"}</span>
              {c.id === convId && <span className="text-xs text-white/50">current</span>}
            </button>
          ))}
        </Sheet>
      )}
    </div>
  );
}
