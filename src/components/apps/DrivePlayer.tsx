"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, FileText, Gauge, Maximize2, Repeat, Share2, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { fmtBytes, type VaultFile } from "@/lib/protect";
import { isHls, isLossless, playableKind } from "@/lib/driveFolders";
import { offlineUrl } from "@/lib/driveOffline";

export type PlayItem = { kind: "file"; f: VaultFile } | { kind: "url"; url: string; name: string; media: "video" | "audio" };

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const POS = "nexus.drive.pos.v1";
const readPos = (id: string) => {
  try {
    return Number(JSON.parse(localStorage.getItem(POS) ?? "{}")[id]) || 0;
  } catch {
    return 0;
  }
};
const writePos = (id: string, t: number | null) => {
  try {
    const m = JSON.parse(localStorage.getItem(POS) ?? "{}");
    if (t == null) delete m[id];
    else m[id] = Math.floor(t);
    const keys = Object.keys(m);
    if (keys.length > 300) delete m[keys[0]!];
    localStorage.setItem(POS, JSON.stringify(m));
  } catch {
    /* ignore */
  }
};
const clock = (s: number) => {
  if (!Number.isFinite(s)) return "0:00";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const x = Math.floor(s % 60);
  return `${h ? h + ":" + String(m).padStart(2, "0") : m}:${String(x).padStart(2, "0")}`;
};

/**
 * Streams straight from storage: the browser asks for byte ranges, so playback starts at once and
 * seeking works without downloading the whole file. If the file is kept offline, that copy is played instead.
 */
export function DrivePlayer({ item, list, onPick, onClose, onShare }: { item: PlayItem; list: VaultFile[]; onPick: (f: VaultFile) => void; onClose: () => void; onShare?: (f: VaultFile) => void }) {
  const f = item.kind === "file" ? item.f : null;
  const name = item.kind === "file" ? item.f.title?.trim() || item.f.name : item.name;
  const media = item.kind === "file" ? playableKind(item.f.name, item.f.mime) : item.media;
  const id = f?.id ?? null;
  const [src, setSrc] = useState<string | null>(item.kind === "url" ? item.url : null);
  const [mode, setMode] = useState<"stream" | "offline">("stream");
  const [err, setErr] = useState("");
  const [speed, setSpeed] = useState(1);
  const [loop, setLoop] = useState(false);
  const [t, setT] = useState({ cur: 0, dur: 0, buf: 0 });
  const el = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const lastSave = useRef(0);
  const blob = useRef<string | null>(null);

  // find the source: offline copy first, otherwise a long-lived signed link (6 h) so a long film survives seeking
  useEffect(() => {
    setErr("");
    if (item.kind === "url") {
      setSrc(item.url);
      setMode("stream");
      return;
    }
    let dead = false;
    setSrc(null);
    (async () => {
      const off = await offlineUrl(item.f.id);
      if (dead) return off && URL.revokeObjectURL(off);
      if (off) {
        blob.current = off;
        setMode("offline");
        return setSrc(off);
      }
      const { data } = await supabase.storage.from("user-vault").createSignedUrl(item.f.path, 6 * 3600);
      if (dead) return;
      if (!data?.signedUrl) return setErr("Could not open this file.");
      setMode("stream");
      setSrc(data.signedUrl);
    })();
    return () => {
      dead = true;
      if (blob.current) URL.revokeObjectURL(blob.current);
      blob.current = null;
    };
  }, [item]);

  const unsupported = item.kind === "url" && isHls(item.url) && typeof document !== "undefined" && !document.createElement("video").canPlayType("application/vnd.apple.mpegurl");

  useEffect(() => {
    const m = el.current;
    if (!m) return;
    m.playbackRate = speed;
  }, [speed, src]);

  const onLoaded = () => {
    const m = el.current;
    if (!m || !id) return;
    const p = readPos(id);
    if (p > 5 && p < m.duration - 10) m.currentTime = p; // pick up where you left off
  };
  const onTime = () => {
    const m = el.current;
    if (!m) return;
    const b = m.buffered.length ? m.buffered.end(m.buffered.length - 1) : 0;
    setT({ cur: m.currentTime, dur: m.duration || 0, buf: b });
    if (id && Date.now() - lastSave.current > 5000) {
      lastSave.current = Date.now();
      writePos(id, m.currentTime);
    }
  };
  const idx = f ? list.findIndex((x) => x.id === f.id) : -1;
  const step = useCallback(
    (d: number) => {
      const n = list[idx + d];
      if (n) onPick(n);
    },
    [idx, list, onPick],
  );
  const onEnded = () => {
    if (id) writePos(id, null);
    if (!loop && idx >= 0 && list[idx + 1]) step(1);
  };

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const m = el.current;
      if (!m || (e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key === " ") (e.preventDefault(), m.paused ? void m.play() : m.pause());
      else if (e.key === "ArrowRight") m.currentTime = Math.min(m.duration || 0, m.currentTime + 5);
      else if (e.key === "ArrowLeft") m.currentTime = Math.max(0, m.currentTime - 5);
      else if (e.key === "m") m.muted = !m.muted;
      else if (e.key === "f" && media === "video") void m.requestFullscreen?.();
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [media, onClose]);

  const download = async () => {
    if (!f) return;
    const { data } = await supabase.storage.from("user-vault").createSignedUrl(f.path, 600, { download: f.name });
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
  };

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/85 p-2 sm:p-6" onClick={onClose} role="dialog" aria-label={`Playing ${name}`}>
      <div className="flex max-h-full w-full max-w-4xl flex-col gap-2 text-white" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold" data-testid="player-title">{name}</div>
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-white/70">
              <span data-testid="player-mode" className={cn("rounded-full px-2 py-0.5 font-semibold", mode === "offline" ? "bg-emerald-500/25 text-emerald-300" : "bg-white/10")}>
                {mode === "offline" ? "Offline copy" : item.kind === "url" ? "Streaming from the internet" : "Streaming from your Drive"}
              </span>
              {f && isLossless(f.name, f.mime) && <span className="rounded-full bg-amber-400/20 px-2 py-0.5 font-semibold text-amber-200">Lossless</span>}
              {f && <span>{fmtBytes(f.bytes)}</span>}
            </div>
          </div>
          {f && onShare && (
            <button onClick={() => onShare(f)} className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-2 text-sm font-semibold" aria-label="Share link">
              <Share2 className="size-4" /> Share
            </button>
          )}
          {f && (
            <button onClick={() => void download()} className="grid size-9 place-items-center rounded-full bg-white/10" aria-label="Download">
              <Download className="size-4" />
            </button>
          )}
          <button onClick={onClose} className="grid size-9 place-items-center rounded-full bg-white/10" aria-label="Close player">
            <X className="size-5" />
          </button>
        </div>

        {err || unsupported ? (
          <div className="rounded-2xl bg-white/10 p-6 text-sm" role="alert">
            {unsupported ? "This browser can't play .m3u8 live streams directly. Safari can; for other browsers use a direct .mp4/.webm/.mp3 link." : err}
          </div>
        ) : media === "video" || media === "audio" ? (
          <>
            {src ? (
              media === "video" ? (
                <video
                  key={src}
                  ref={el}
                  src={src}
                  controls
                  autoPlay
                  playsInline
                  loop={loop}
                  preload="metadata"
                  className="max-h-[68vh] w-full rounded-2xl bg-black"
                  onLoadedMetadata={onLoaded}
                  onTimeUpdate={onTime}
                  onProgress={onTime}
                  onEnded={onEnded}
                  onError={() => setErr(`Your browser can't play this file as is${f ? " (" + (f.mime || f.name.split(".").pop()) + ")" : ""}. Download it to open in another player.`)}
                />
              ) : (
                <div className="rounded-2xl bg-white/5 p-4">
                  <div className="mb-3 grid h-28 place-items-center rounded-xl bg-gradient-to-br from-fuchsia-600/40 to-indigo-700/40 text-5xl">🎧</div>
                  <audio
                    key={src}
                    ref={el}
                    src={src}
                    controls
                    autoPlay
                    loop={loop}
                    preload="metadata"
                    className="w-full"
                    onLoadedMetadata={onLoaded}
                    onTimeUpdate={onTime}
                    onProgress={onTime}
                    onEnded={onEnded}
                    onError={() => setErr(`Your browser can't play this file as is${f ? " (" + (f.mime || f.name.split(".").pop()) + ")" : ""}. Download it to open in another player.`)}
                  />
                </div>
              )
            ) : (
              <div className="grid h-40 place-items-center rounded-2xl bg-white/5 text-sm text-white/70">Opening…</div>
            )}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="tabular-nums text-white/70" data-testid="player-time">
                {clock(t.cur)} / {clock(t.dur)}
              </span>
              <span className="text-white/50">buffered {t.dur ? Math.round((t.buf / t.dur) * 100) : 0}%</span>
              <span className="ml-auto" />
              {idx >= 0 && (
                <>
                  <button onClick={() => step(-1)} disabled={idx <= 0} className="grid size-8 place-items-center rounded-full bg-white/10 disabled:opacity-30" aria-label="Previous">
                    <ChevronLeft className="size-4" />
                  </button>
                  <button onClick={() => step(1)} disabled={idx >= list.length - 1} className="grid size-8 place-items-center rounded-full bg-white/10 disabled:opacity-30" aria-label="Next">
                    <ChevronRight className="size-4" />
                  </button>
                </>
              )}
              <label className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1.5">
                <Gauge className="size-3.5" />
                <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="bg-transparent text-xs font-semibold outline-none" aria-label="Speed">
                  {SPEEDS.map((s) => (
                    <option key={s} value={s} className="text-black">
                      {s}×
                    </option>
                  ))}
                </select>
              </label>
              <button onClick={() => setLoop((l) => !l)} aria-pressed={loop} aria-label="Repeat" className={cn("grid size-8 place-items-center rounded-full", loop ? "bg-accent" : "bg-white/10")}>
                <Repeat className="size-4" />
              </button>
              {media === "video" && (
                <button onClick={() => void el.current?.requestFullscreen?.()} className="grid size-8 place-items-center rounded-full bg-white/10" aria-label="Full screen">
                  <Maximize2 className="size-4" />
                </button>
              )}
            </div>
            <p className="hidden text-[11px] text-white/40 sm:block">Space play/pause · ← → seek 5 s · M mute · F full screen</p>
          </>
        ) : media === "image" && src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={name} className="max-h-[78vh] w-full rounded-2xl object-contain" />
        ) : media === "pdf" && src ? (
          <iframe src={src} title={name} className="h-[78vh] w-full rounded-2xl bg-white" />
        ) : (
          <div className="grid place-items-center gap-3 rounded-2xl bg-white/10 p-10 text-center text-sm">
            <FileText className="size-10 text-white/60" />
            <span>No preview for this type of file.</span>
            {f && (
              <button onClick={() => void download()} className="rounded-full bg-accent px-4 py-2 font-semibold">
                Download
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
