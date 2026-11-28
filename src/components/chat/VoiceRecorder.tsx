"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Pause, SendHorizontal, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { clock, downsamplePeaks, elapsedMs, levelFromBytes, voiceName } from "@/lib/voiceWave";

const BARS = 44;

function pickMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const t of ["audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"]) {
    try {
      if (MediaRecorder.isTypeSupported(t)) return t;
    } catch {
      /* try the next */
    }
  }
  return "";
}

type Session = {
  rec: MediaRecorder;
  stream: MediaStream;
  chunks: Blob[];
  started: number;
  pausedTotal: number;
  pauseAt: number | null;
  peaks: number[];
  mime: string;
  analyser: AnalyserNode;
};

/**
 * The recording bar: delete, live waveform + time, pause / resume and send.
 * `ctx` is an AudioContext the parent created inside the tap (phones only allow that), so it is awake and the waveform moves.
 * Calls onDone(file) to send, or onDone(null) when discarded / failed.
 */
export default function VoiceRecorder({
  ctx,
  studio,
  badge,
  maxSec,
  onDone,
  onError,
}: {
  ctx: AudioContext;
  studio: boolean;
  badge: "" | "HD" | "Studio";
  maxSec: number;
  onDone: (file: File | null) => void;
  onError: (message: string) => void;
}) {
  const S = useRef<Session | null>(null);
  const done = useRef(false);
  const [ready, setReady] = useState(false);
  const [paused, setPaused] = useState(false);
  const [ms, setMs] = useState(0);
  const [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(0.08));
  const cb = useRef({ onDone, onError, maxSec });
  cb.current = { onDone, onError, maxSec };

  function release() {
    const s = S.current;
    S.current = null;
    if (s) {
      try {
        s.stream.getTracks().forEach((t) => t.stop());
      } catch {
        /* already stopped */
      }
    }
    void ctx.close().catch(() => {});
  }

  // start the microphone
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        void ctx.resume?.();
        const audio: MediaTrackConstraints = studio
          ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 2 }, sampleRate: { ideal: 48000 } }
          : { echoCancellation: true, noiseSuppression: true, channelCount: { ideal: 2 }, sampleRate: { ideal: 48000 } };
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true }); // some phones refuse the extra settings
        }
        if (!alive) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const mime = pickMime();
        // 510 kbps first (the top of Opus), then plain options: some phones refuse a bitrate or a mime type
        const tries: MediaRecorderOptions[] = [];
        if (mime) tries.push({ mimeType: mime, audioBitsPerSecond: 510_000 }, { mimeType: mime });
        tries.push({ audioBitsPerSecond: 510_000 }, {});
        let rec: MediaRecorder | null = null;
        for (const o of tries) {
          try {
            rec = new MediaRecorder(stream, o);
            break;
          } catch {
            /* next */
          }
        }
        if (!rec) throw new Error("This browser can't record audio.");
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.3;
        ctx.createMediaStreamSource(stream).connect(analyser);
        const s: Session = { rec, stream, chunks: [], started: Date.now(), pausedTotal: 0, pauseAt: null, peaks: [], mime: rec.mimeType || mime || "audio/webm", analyser };
        rec.ondataavailable = (e) => e.data && e.data.size && s.chunks.push(e.data);
        rec.onerror = () => {
          if (done.current) return;
          done.current = true;
          release();
          cb.current.onError("The recording stopped unexpectedly. Try again.");
          cb.current.onDone(null);
        };
        stream.getAudioTracks().forEach((t) => {
          t.onended = () => {
            if (done.current || !S.current) return;
            void finish(); // microphone was taken away (a call came in): keep what we have
          };
        });
        rec.start(250);
        S.current = s;
        setReady(true);
      } catch (e) {
        if (!alive || done.current) return;
        done.current = true;
        release();
        const denied = e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError");
        cb.current.onError(denied ? "Microphone permission is needed for voice messages." : e instanceof Error ? e.message : "Couldn't start the microphone.");
        cb.current.onDone(null);
      }
    })();
    return () => {
      alive = false;
      if (!done.current) {
        done.current = true;
        const s = S.current;
        try {
          if (s && s.rec.state !== "inactive") s.rec.stop();
        } catch {
          /* ignore */
        }
        release();
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // live waveform + clock
  useEffect(() => {
    if (!ready) return;
    const buf = new Uint8Array(512);
    let raf = 0;
    let last = 0;
    const loop = (t: number) => {
      const s = S.current;
      if (!s) return;
      if (t - last > 55) {
        last = t;
        const now = Date.now();
        const elapsed = elapsedMs(s.started, s.pausedTotal, s.pauseAt, now);
        setMs(elapsed);
        if (s.pauseAt === null) {
          s.analyser.getByteTimeDomainData(buf);
          const level = levelFromBytes(buf);
          s.peaks.push(level);
          setLevels((l) => [...l.slice(1), level]);
          if (elapsed >= cb.current.maxSec * 1000) void finish();
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  function togglePause() {
    const s = S.current;
    if (!s) return;
    try {
      if (s.pauseAt === null) {
        s.rec.pause();
        s.pauseAt = Date.now();
        setPaused(true);
      } else {
        s.rec.resume();
        s.pausedTotal += Date.now() - s.pauseAt;
        s.pauseAt = null;
        setPaused(false);
      }
    } catch {
      /* recorder not ready */
    }
  }

  function discard() {
    if (done.current) return;
    done.current = true;
    const s = S.current;
    try {
      if (s && s.rec.state !== "inactive") {
        s.rec.ondataavailable = null;
        s.rec.stop();
      }
    } catch {
      /* ignore */
    }
    release();
    cb.current.onDone(null);
  }

  async function finish() {
    const s = S.current;
    if (!s || done.current) return;
    done.current = true;
    if (s.pauseAt !== null) {
      s.pausedTotal += Date.now() - s.pauseAt;
      s.pauseAt = null;
    }
    const secs = elapsedMs(s.started, s.pausedTotal, null, Date.now()) / 1000;
    // wait for the last chunk, but never hang: a phone that never fires "stop" still sends what it has
    await new Promise<void>((res) => {
      const t = setTimeout(res, 2500);
      s.rec.onstop = () => {
        clearTimeout(t);
        res();
      };
      try {
        if (s.rec.state !== "inactive") s.rec.stop();
        else {
          clearTimeout(t);
          res();
        }
      } catch {
        clearTimeout(t);
        res();
      }
    });
    release();
    if (secs < 0.8) {
      cb.current.onError("Hold on a little longer to record");
      cb.current.onDone(null);
      return;
    }
    const type = s.mime.split(";")[0] || "audio/webm";
    const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
    const blob = new Blob(s.chunks, { type });
    if (!blob.size) {
      cb.current.onError("Nothing was recorded. Try again.");
      cb.current.onDone(null);
      return;
    }
    // the waveform and length travel in the file name, so the sent bubble draws instantly (see voiceWave.ts)
    cb.current.onDone(new File([blob], voiceName(Date.now(), secs, downsamplePeaks(s.peaks), ext), { type }));
  }

  const btn = "grid size-11 shrink-0 touch-manipulation place-items-center rounded-full active:scale-90";
  return (
    <div className="flex animate-fade items-center gap-2" data-testid="voice-recorder">
      <button type="button" onClick={discard} className={cn(btn, "text-dnd")} aria-label="Delete recording">
        <Trash2 className="size-[22px]" />
      </button>
      <div className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-full bg-side px-3 min-[400px]:gap-3 min-[400px]:px-4">
        <span className={cn("size-2.5 shrink-0 rounded-full bg-dnd", !paused && ready && "animate-pulse", paused && "opacity-40")} />
        <span className="w-10 shrink-0 text-[15px] font-semibold tabular-nums" aria-live="off">
          {clock(ms)}
        </span>
        {badge && (
          <span className="shrink-0 rounded-md bg-[#ffd400]/15 px-1.5 py-0.5 text-[10px] font-black tracking-wide text-[#ffd400] max-[420px]:hidden" title={studio ? "Studio voice · raw stereo, no noise filter · up to 510 kbps" : "HD voice · up to 510 kbps"}>
            ⚡ {badge}
          </span>
        )}
        <div className="flex h-7 min-w-0 flex-1 items-center justify-end gap-[2px] overflow-hidden" aria-hidden>
          {levels.map((l, i) => (
            <span key={i} className={cn("w-[3px] shrink-0 rounded-full transition-[height] duration-75", paused ? "bg-sub" : "bg-accent")} style={{ height: `${Math.round(l * 100)}%`, minHeight: 3 }} />
          ))}
        </div>
      </div>
      <button type="button" onClick={togglePause} disabled={!ready} className={cn(btn, "bg-side text-txt disabled:opacity-40")} aria-label={paused ? "Resume recording" : "Pause recording"}>
        {paused ? <Mic className="size-5 text-accent" /> : <Pause className="size-5 fill-current" />}
      </button>
      <button type="button" onClick={() => void finish()} disabled={!ready} className={cn(btn, "animate-pop bg-accent text-white shadow-lg shadow-accent/30 disabled:opacity-40")} aria-label="Send voice message">
        <SendHorizontal className="size-5" />
      </button>
    </div>
  );
}
