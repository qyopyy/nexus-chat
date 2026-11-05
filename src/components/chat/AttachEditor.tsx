"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  Disc3,
  FlipHorizontal2,
  Minimize2,
  Move,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  X,
  ZoomIn,
} from "lucide-react";
import {
  DEFAULT_FILTERS,
  canvasToBlob,
  drawImage,
  filterCss,
  loadImageFromFile,
  type FilterAdjust,
} from "@/lib/imageEdit";
import { formatDuration, isEditableAudio, processChatAudio } from "@/lib/attachAudio";
import { cn, formatBytes } from "@/lib/utils";
import { haptic } from "@/lib/haptics";

const IMG_FILTERS: { label: string; patch: Partial<FilterAdjust> }[] = [
  { label: "None", patch: { ...DEFAULT_FILTERS } },
  { label: "Vivid", patch: { saturate: 145, contrast: 112, brightness: 104 } },
  { label: "Soft", patch: { contrast: 92, brightness: 108, saturate: 88, blur: 0.35 } },
  { label: "Mono", patch: { grayscale: 100, contrast: 118 } },
  { label: "Film", patch: { sepia: 38, contrast: 108, saturate: 82 } },
  { label: "Cool", patch: { hue: 195, saturate: 115 } },
  { label: "Warm", patch: { hue: 22, saturate: 125, brightness: 105 } },
  { label: "Punch", patch: { contrast: 128, saturate: 130, brightness: 102 } },
];

const ASPECTS: { id: string; label: string; ratio: number | null }[] = [
  { id: "free", label: "Free", ratio: null },
  { id: "1:1", label: "1:1", ratio: 1 },
  { id: "4:5", label: "4:5", ratio: 4 / 5 },
  { id: "16:9", label: "16:9", ratio: 16 / 9 },
  { id: "9:16", label: "9:16", ratio: 9 / 16 },
];

type Props = {
  file: File;
  open: boolean;
  onClose: () => void;
  onApply: (file: File) => void;
};

function isImage(f: File) {
  return /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(f.name);
}

export default function AttachEditor({ file, open, onClose, onApply }: Props) {
  if (!open || typeof document === "undefined") return null;
  const mode = isImage(file) ? "image" : isEditableAudio(file) ? "audio" : null;
  if (!mode) return null;

  return createPortal(
    <div className="fixed inset-0 z-[95] flex flex-col bg-[#0b0d12]/95 backdrop-blur-md" role="dialog" aria-modal>
      {mode === "image" ? (
        <ImageAttachEditor file={file} onClose={onClose} onApply={onApply} />
      ) : (
        <AudioAttachEditor file={file} onClose={onClose} onApply={onApply} />
      )}
    </div>,
    document.body,
  );
}

function EditorChrome({
  title,
  subtitle,
  onClose,
  onApply,
  busy,
  applyLabel = "Use",
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  onApply: () => void;
  busy?: boolean;
  applyLabel?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <>
      <header className="flex shrink-0 items-center gap-2 border-b border-white/10 px-3 py-3 sm:px-5">
        <button onClick={onClose} className="grid size-10 place-items-center rounded-full text-sub hover:bg-white/5" aria-label="Cancel">
          <X className="size-5" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold">{title}</div>
          {subtitle && <div className="truncate text-xs text-sub">{subtitle}</div>}
        </div>
        <button
          disabled={busy}
          onClick={onApply}
          className="inline-flex h-10 items-center gap-1.5 rounded-full bg-accent px-4 text-sm font-bold text-white shadow-lg shadow-accent/25 disabled:opacity-50"
        >
          <Check className="size-4" />
          {busy ? "Working…" : applyLabel}
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      {footer}
    </>
  );
}

/* ─── Image ─────────────────────────────────────────────────────────────── */

function ImageAttachEditor({ file, onClose, onApply }: { file: File; onClose: () => void; onApply: (f: File) => void }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [nat, setNat] = useState({ w: 1, h: 1 });
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [aspectId, setAspectId] = useState("free");
  const [filters, setFilters] = useState<FilterAdjust>({ ...DEFAULT_FILTERS });
  const [flipH, setFlipH] = useState(false);
  const [quality, setQuality] = useState(0.88);
  const [compress, setCompress] = useState(true);
  const [tab, setTab] = useState<"frame" | "effects">("frame");
  const [busy, setBusy] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    let dead = false;
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    void loadImageFromFile(file).then((el) => {
      if (dead) return;
      setImg(el);
      setNat({ w: el.naturalWidth || el.width, h: el.naturalHeight || el.height });
      setScale(1);
      setOffset({ x: 0, y: 0 });
    });
    return () => {
      dead = true;
      URL.revokeObjectURL(url);
    };
  }, [file]);

  const aspect = ASPECTS.find((a) => a.id === aspectId)?.ratio ?? null;

  const frame = useMemo(() => {
    const maxW = 720;
    const maxH = 480;
    let fw = nat.w;
    let fh = nat.h;
    if (aspect) {
      if (nat.w / nat.h > aspect) {
        fh = nat.h;
        fw = fh * aspect;
      } else {
        fw = nat.w;
        fh = fw / aspect;
      }
    }
    const k = Math.min(1, maxW / fw, maxH / fh);
    return { w: Math.round(fw * k), h: Math.round(fh * k), srcW: fw, srcH: fh };
  }, [nat, aspect]);

  const coverScale = useMemo(() => {
    if (!img) return 1;
    return Math.max(frame.srcW / nat.w, frame.srcH / nat.h);
  }, [img, frame, nat]);

  const drawScale = coverScale * scale;

  const clampOffset = useCallback(
    (x: number, y: number, s = drawScale) => {
      const dw = nat.w * s;
      const dh = nat.h * s;
      const maxX = Math.max(0, (dw - frame.srcW) / 2);
      const maxY = Math.max(0, (dh - frame.srcH) / 2);
      return {
        x: Math.max(-maxX, Math.min(maxX, x)),
        y: Math.max(-maxY, Math.min(maxY, y)),
      };
    },
    [nat, frame, drawScale],
  );

  useEffect(() => {
    setOffset((o) => clampOffset(o.x, o.y));
  }, [scale, aspectId, clampOffset]);

  async function apply() {
    if (!img) return;
    setBusy(true);
    try {
      const outW = Math.max(1, Math.round(frame.srcW));
      const outH = Math.max(1, Math.round(frame.srcH));
      // Source crop in original pixels
      const dw = nat.w * drawScale;
      const dh = nat.h * drawScale;
      const left = (dw - frame.srcW) / 2 - offset.x;
      const top = (dh - frame.srcH) / 2 - offset.y;
      const sx = left / drawScale;
      const sy = top / drawScale;
      const sw = frame.srcW / drawScale;
      const sh = frame.srcH / drawScale;

      const canvas = document.createElement("canvas");
      drawImage(canvas, img, {
        width: outW,
        height: outH,
        crop: { x: sx, y: sy, w: sw, h: sh },
        filters,
        flipH,
        jpegFill: true,
        fillColor: "#000000",
      });

      // Cap long edge for chat (Discord-like)
      const maxEdge = compress ? 1600 : 2400;
      const edge = Math.max(canvas.width, canvas.height);
      let final = canvas;
      if (edge > maxEdge) {
        const k = maxEdge / edge;
        const c2 = document.createElement("canvas");
        c2.width = Math.max(1, Math.round(canvas.width * k));
        c2.height = Math.max(1, Math.round(canvas.height * k));
        const g = c2.getContext("2d")!;
        g.imageSmoothingEnabled = true;
        g.imageSmoothingQuality = "high";
        g.drawImage(canvas, 0, 0, c2.width, c2.height);
        final = c2;
      }

      const q = compress ? quality : 0.94;
      const blob = await canvasToBlob(final, "image/jpeg", q);
      const base = file.name.replace(/\.[^.]+$/, "") || "image";
      const out = new File([blob], `${base}.jpg`, { type: "image/jpeg" });
      haptic.success();
      onApply(out);
    } catch {
      haptic.medium();
    } finally {
      setBusy(false);
    }
  }

  const previewStyle = img
    ? {
        width: nat.w * drawScale * (frame.w / frame.srcW),
        height: nat.h * drawScale * (frame.h / frame.srcH),
        transform: `translate(calc(-50% + ${offset.x * (frame.w / frame.srcW)}px), calc(-50% + ${offset.y * (frame.h / frame.srcH)}px))${flipH ? " scaleX(-1)" : ""}`,
        filter: filterCss(filters),
      }
    : undefined;

  return (
    <EditorChrome
      title="Edit image"
      subtitle={`${file.name} · ${formatBytes(file.size)}`}
      onClose={onClose}
      onApply={() => void apply()}
      busy={busy}
      applyLabel="Attach"
      footer={
        <div className="shrink-0 border-t border-white/10 bg-[#0b0d12] px-3 pt-2 pb-safe-2 sm:px-5">
          <div className="mb-2 flex gap-1 rounded-full bg-white/[.06] p-1">
            {(
              [
                ["frame", "Resize & move", Move],
                ["effects", "Effects", Sparkles],
              ] as const
            ).map(([id, label, Icon]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-full py-2 text-xs font-semibold", tab === id ? "bg-accent text-white" : "text-sub")}
              >
                <Icon className="size-3.5" />
                {label}
              </button>
            ))}
          </div>
          {tab === "frame" ? (
            <div className="space-y-3 pb-2">
              <div className="flex flex-wrap gap-1.5">
                {ASPECTS.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => setAspectId(a.id)}
                    className={cn("rounded-full px-3 py-1.5 text-xs font-semibold", aspectId === a.id ? "bg-white/15 text-txt" : "bg-white/[.05] text-sub")}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
              <label className="block text-xs font-semibold text-sub">
                <span className="mb-1 flex items-center gap-1.5">
                  <ZoomIn className="size-3.5" /> Zoom {Math.round(scale * 100)}%
                </span>
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.01}
                  value={scale}
                  onChange={(e) => setScale(Number(e.target.value))}
                  className="w-full accent-[var(--accent)]"
                />
              </label>
              <label className="flex items-center gap-3 rounded-2xl bg-white/[.05] px-3 py-2.5 text-sm">
                <input type="checkbox" checked={compress} onChange={(e) => setCompress(e.target.checked)} className="size-4 accent-[var(--accent)]" />
                <span className="flex-1">
                  <span className="font-semibold">Send compressed</span>
                  <span className="block text-xs text-sub">Smaller JPEG · long edge ≤ 1600</span>
                </span>
              </label>
              {compress && (
                <label className="block text-xs font-semibold text-sub">
                  Quality {Math.round(quality * 100)}%
                  <input type="range" min={0.55} max={0.95} step={0.01} value={quality} onChange={(e) => setQuality(Number(e.target.value))} className="mt-1 w-full accent-[var(--accent)]" />
                </label>
              )}
            </div>
          ) : (
            <div className="space-y-3 pb-2">
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {IMG_FILTERS.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => setFilters({ ...DEFAULT_FILTERS, ...p.patch })}
                    className="shrink-0 rounded-full bg-white/[.08] px-3 py-1.5 text-xs font-semibold"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ["brightness", "Brightness", 50, 150],
                    ["contrast", "Contrast", 50, 160],
                    ["saturate", "Saturate", 0, 200],
                    ["blur", "Blur", 0, 4],
                  ] as const
                ).map(([key, label, min, max]) => (
                  <label key={key} className="text-[11px] font-semibold text-sub">
                    {label}
                    <input
                      type="range"
                      min={min}
                      max={max}
                      step={key === "blur" ? 0.1 : 1}
                      value={filters[key]}
                      onChange={(e) => setFilters((f) => ({ ...f, [key]: Number(e.target.value) }))}
                      className="mt-1 w-full accent-[var(--accent)]"
                    />
                  </label>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setFlipH((v) => !v)}
                  className={cn("inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-semibold", flipH ? "bg-accent/25 text-accent" : "bg-white/[.06]")}
                >
                  <FlipHorizontal2 className="size-4" /> Flip
                </button>
                <button
                  onClick={() => {
                    setFilters({ ...DEFAULT_FILTERS });
                    setFlipH(false);
                    setScale(1);
                    setOffset({ x: 0, y: 0 });
                    setAspectId("free");
                  }}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white/[.06] py-2.5 text-sm font-semibold"
                >
                  <RotateCcw className="size-4" /> Reset
                </button>
              </div>
            </div>
          )}
        </div>
      }
    >
      <div className="flex h-full min-h-[280px] items-center justify-center p-4">
        <div
          ref={stageRef}
          className="relative touch-none overflow-hidden rounded-2xl bg-black/50 ring-1 ring-white/10"
          style={{ width: frame.w, height: frame.h, maxWidth: "100%" }}
          onPointerDown={(e) => {
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
          }}
          onPointerMove={(e) => {
            if (!drag.current) return;
            const k = frame.srcW / frame.w;
            const nx = drag.current.ox + (e.clientX - drag.current.x) * k;
            const ny = drag.current.oy + (e.clientY - drag.current.y) * k;
            setOffset(clampOffset(nx, ny));
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
        >
          {previewUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt=""
              draggable={false}
              className="pointer-events-none absolute top-1/2 left-1/2 max-w-none select-none"
              style={previewStyle}
            />
          )}
          <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_0_1px_rgba(255,255,255,.12)]" />
          <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-semibold tracking-wide text-white/80 uppercase">
            Drag to move
          </div>
        </div>
      </div>
    </EditorChrome>
  );
}

/* ─── Audio ─────────────────────────────────────────────────────────────── */

function AudioAttachEditor({ file, onClose, onApply }: { file: File; onClose: () => void; onApply: (f: File) => void }) {
  const [speed, setSpeed] = useState(1);
  const [bass, setBass] = useState(0);
  const [compress, setCompress] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const url = useMemo(() => URL.createObjectURL(file), [file]);

  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  useEffect(() => {
    const a = new Audio(url);
    audioRef.current = a;
    a.preload = "metadata";
    a.onloadedmetadata = () => setDuration(a.duration || 0);
    a.onended = () => setPlaying(false);
    return () => {
      a.pause();
      audioRef.current = null;
    };
  }, [url]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    a.playbackRate = speed;
  }, [speed]);

  // Live bass preview via Web Audio when playing
  const graph = useRef<{ ctx: AudioContext; shelf: BiquadFilterNode; src: MediaElementAudioSourceNode } | null>(null);
  useEffect(() => {
    return () => {
      if (graph.current) void graph.current.ctx.close().catch(() => {});
      graph.current = null;
    };
  }, []);

  function ensureGraph() {
    const a = audioRef.current;
    if (!a) return null;
    if (graph.current) return graph.current;
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const src = ctx.createMediaElementSource(a);
    const shelf = ctx.createBiquadFilter();
    shelf.type = "lowshelf";
    shelf.frequency.value = 180;
    shelf.gain.value = bass;
    src.connect(shelf);
    shelf.connect(ctx.destination);
    graph.current = { ctx, shelf, src };
    return graph.current;
  }

  useEffect(() => {
    if (graph.current) graph.current.shelf.gain.value = bass;
  }, [bass]);

  async function togglePlay() {
    const a = audioRef.current;
    if (!a) return;
    const g = ensureGraph();
    if (g && g.ctx.state === "suspended") await g.ctx.resume();
    if (playing) {
      a.pause();
      setPlaying(false);
    } else {
      try {
        await a.play();
        setPlaying(true);
      } catch {
        /* autoplay */
      }
    }
  }

  async function apply() {
    setBusy(true);
    setStatus("Working…");
    try {
      audioRef.current?.pause();
      setPlaying(false);
      const out = await processChatAudio(file, {
        speed,
        bass,
        compress,
        bitrate: 96_000,
        onProgress: (label) => setStatus(label),
      });
      haptic.success();
      onApply(out);
    } catch {
      haptic.medium();
      setStatus("Couldn't process that audio");
    } finally {
      setBusy(false);
    }
  }

  const outDur = duration / Math.max(0.5, speed);

  return (
    <EditorChrome
      title="Edit audio"
      subtitle={`${file.name} · ${formatBytes(file.size)}${duration ? ` · ${formatDuration(duration)}` : ""}`}
      onClose={onClose}
      onApply={() => void apply()}
      busy={busy}
      applyLabel="Attach"
    >
      <div className="mx-auto flex max-w-lg flex-col gap-5 px-4 py-6 sm:px-6">
        <div className="flex flex-col items-center gap-4 rounded-3xl bg-gradient-to-b from-white/[.08] to-white/[.03] px-5 py-8 ring-1 ring-white/10">
          <div className="grid size-20 place-items-center rounded-full bg-accent/20 text-accent">
            <Disc3 className={cn("size-10", playing && "animate-spin")} style={{ animationDuration: "3s" }} />
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold">{formatDuration(outDur)}</div>
            <div className="text-xs text-sub">after speed · was {formatDuration(duration)}</div>
          </div>
          <button onClick={() => void togglePlay()} className="rounded-full bg-accent px-6 py-2.5 text-sm font-bold text-white">
            {playing ? "Pause preview" : "Preview"}
          </button>
        </div>

        <label className="block text-sm font-semibold">
          <span className="mb-1 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-sub">
              <SlidersHorizontal className="size-3.5" /> Speed
            </span>
            <span className="tabular-nums text-accent">{speed.toFixed(2)}×</span>
          </span>
          <input type="range" min={0.5} max={2} step={0.05} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="w-full accent-[var(--accent)]" />
          <div className="mt-1 flex justify-between text-[10px] text-sub">
            <span>0.5×</span>
            <button type="button" className="font-semibold text-accent" onClick={() => setSpeed(1)}>
              Reset 1×
            </button>
            <span>2×</span>
          </div>
        </label>

        <label className="block text-sm font-semibold">
          <span className="mb-1 flex items-center justify-between">
            <span className="text-sub">Bass</span>
            <span className="tabular-nums text-accent">
              {bass > 0 ? "+" : ""}
              {bass.toFixed(0)} dB
            </span>
          </span>
          <input type="range" min={-12} max={12} step={1} value={bass} onChange={(e) => setBass(Number(e.target.value))} className="w-full accent-[var(--accent)]" />
          <div className="mt-1 flex justify-between text-[10px] text-sub">
            <span>−12</span>
            <button type="button" className="font-semibold text-accent" onClick={() => setBass(0)}>
              Flat
            </button>
            <span>+12</span>
          </div>
        </label>

        <label className="flex items-start gap-3 rounded-2xl bg-white/[.05] px-3 py-3 text-sm">
          <input type="checkbox" checked={compress} onChange={(e) => setCompress(e.target.checked)} className="mt-0.5 size-4 accent-[var(--accent)]" />
          <span className="flex-1">
            <span className="flex items-center gap-1.5 font-semibold">
              <Minimize2 className="size-4 text-accent" /> Send compressed
            </span>
            <span className="mt-0.5 block text-xs text-sub">Re-encode to AAC/Opus ~96 kbps so big WAV/MP3/AAC/M4A uploads stay small.</span>
          </span>
        </label>

        <p className="text-center text-xs text-sub">Supports WAV, MP3, AAC, and M4A. {status && <span className="text-accent">{status}</span>}</p>
      </div>
    </EditorChrome>
  );
}

export function shouldOpenAttachEditor(file: File) {
  return isImage(file) || isEditableAudio(file);
}
