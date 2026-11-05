"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Download, ImagePlus, Lock, RotateCw, ShieldCheck, Trash2, Unlock } from "lucide-react";
import { sanitizeDownloadName, sniffImage } from "@/lib/fileSafety";
import { cn } from "@/lib/utils";

const MAX_EDGE = 8192;
const MAX_BYTES = 25 * 1024 * 1024;
const PRESETS = [
  { label: "Avatar 256", w: 256, h: 256 },
  { label: "Avatar 512", w: 512, h: 512 },
  { label: "Banner 1280×720", w: 1280, h: 720 },
  { label: "Square 1080", w: 1080, h: 1080 },
] as const;

type Format = "image/png" | "image/jpeg" | "image/webp";

function clamp(n: number) {
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(MAX_EDGE, Math.round(n)));
}

function extFor(format: Format) {
  if (format === "image/jpeg") return "jpg";
  if (format === "image/webp") return "webp";
  return "png";
}

export default function ImageResizer({ onBack, mobile }: { onBack: () => void; mobile?: boolean }) {
  const [fileName, setFileName] = useState("image");
  const [source, setSource] = useState<{ img: HTMLImageElement; w: number; h: number; gif: boolean } | null>(null);
  const [width, setWidth] = useState(1);
  const [height, setHeight] = useState(1);
  const [lock, setLock] = useState(true);
  const [format, setFormat] = useState<Format>("image/png");
  const [quality, setQuality] = useState(0.92);
  const [rotation, setRotation] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ratio = useRef(1);

  useEffect(() => {
    const canvas = canvasRef.current;
    const img = source?.img;
    if (!canvas || !img) return;
    const rot = ((rotation % 360) + 360) % 360;
    const swap = rot === 90 || rot === 270;
    const outW = swap ? height : width;
    const outH = swap ? width : height;
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (format === "image/jpeg") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, outW, outH);
    } else {
      ctx.clearRect(0, 0, outW, outH);
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.save();
    ctx.translate(outW / 2, outH / 2);
    ctx.rotate((rot * Math.PI) / 180);
    ctx.drawImage(img, -width / 2, -height / 2, width, height);
    ctx.restore();
  }, [source, width, height, format, rotation]);

  function clearSession() {
    setSource(null);
    setFileName("image");
    setError(null);
    setRotation(0);
    setWidth(1);
    setHeight(1);
  }

  async function openFile(file: File) {
    setError(null);
    if (file.size > MAX_BYTES) {
      setError("That image is over 25 MB.");
      return;
    }
    try {
      const kind = await sniffImage(file);
      const url = URL.createObjectURL(file);
      try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const el = new Image();
          el.onload = () => resolve(el);
          el.onerror = () => reject(new Error("Could not read that image."));
          el.src = url;
        });
        if (!img.naturalWidth || !img.naturalHeight) throw new Error("That image has no pixels to resize.");
        if (img.naturalWidth > MAX_EDGE || img.naturalHeight > MAX_EDGE) {
          throw new Error(`Image edges must be ${MAX_EDGE}px or smaller.`);
        }
        ratio.current = img.naturalWidth / img.naturalHeight;
        setFileName(sanitizeDownloadName(file.name.replace(/\.[^.]+$/, ""), "image"));
        setSource({ img, w: img.naturalWidth, h: img.naturalHeight, gif: kind === "image/gif" });
        setWidth(img.naturalWidth);
        setHeight(img.naturalHeight);
        setRotation(0);
        setFormat(kind === "image/jpeg" ? "image/jpeg" : kind === "image/webp" ? "image/webp" : "image/png");
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that image.");
    }
  }

  function setEdge(which: "w" | "h", raw: string) {
    const n = clamp(Number(raw));
    if (which === "w") {
      setWidth(n);
      if (lock) setHeight(clamp(n / ratio.current));
    } else {
      setHeight(n);
      if (lock) setWidth(clamp(n * ratio.current));
    }
  }

  function applyPreset(w: number, h: number) {
    if (!source) return;
    if (lock) {
      const scale = Math.min(w / source.w, h / source.h);
      setWidth(clamp(source.w * scale));
      setHeight(clamp(source.h * scale));
    } else {
      setWidth(clamp(w));
      setHeight(clamp(h));
    }
  }

  function download() {
    const canvas = canvasRef.current;
    if (!canvas || !source) return;
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setError("This browser couldn't encode that format. Try PNG.");
          return;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${fileName}-${canvas.width}x${canvas.height}.${extFor(format)}`;
        a.click();
        URL.revokeObjectURL(url);
      },
      format,
      format === "image/png" ? undefined : quality,
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-chat">
      <header className={cn("flex shrink-0 items-center gap-2 border-b border-black/20 px-3", mobile ? "pt-safe-3 pb-2" : "h-12")}>
        <button onClick={onBack} className="grid size-9 place-items-center rounded-full hover:bg-hover" aria-label="Back to apps">
          <ArrowLeft className="size-5" />
        </button>
        <ImagePlus className="size-5 text-[#00a8fc]" />
        <span className="min-w-0 flex-1 truncate font-bold">Image resizer</span>
        {source && (
          <>
            <button onClick={clearSession} className="grid size-9 place-items-center rounded-full hover:bg-hover" aria-label="Clear image from memory">
              <Trash2 className="size-4" />
            </button>
            <button onClick={download} className="flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-sm font-semibold text-white">
              <Download className="size-4" /> Download
            </button>
          </>
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mx-auto mb-4 flex max-w-5xl items-start gap-2 rounded-2xl bg-side/80 px-3 py-2 text-xs text-sub">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-ok" />
          <span>Files stay in this browser tab. Redrawing to canvas strips EXIF/location metadata. SVG is blocked. Max {Math.round(MAX_BYTES / 1024 / 1024)} MB.</span>
        </div>
        <div className="mx-auto grid max-w-5xl gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div
            className="min-w-0"
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const file = e.dataTransfer.files?.[0];
              if (file) void openFile(file);
            }}
          >
            {source ? (
              <div className={cn("grid place-items-center rounded-2xl border border-dashed bg-side p-4", dragOver ? "border-accent" : "border-white/15")}>
                <canvas ref={canvasRef} aria-label="Resized preview" className="max-h-[520px] max-w-full rounded-xl bg-[repeating-conic-gradient(#2b2d31_0%_25%,#232428_0%_50%)] bg-[length:24px_24px]" />
              </div>
            ) : (
              <label className={cn("grid min-h-64 cursor-pointer place-items-center rounded-2xl border border-dashed bg-side p-4 text-center", dragOver ? "border-accent bg-accent/10" : "border-white/15")}>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif"
                  className="sr-only"
                  aria-label="Choose an image"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void openFile(file);
                    e.target.value = "";
                  }}
                />
                <span>
                  <ImagePlus className="mx-auto mb-3 size-10 text-sub" />
                  <span className="block font-semibold">Drop an image, or click to choose one</span>
                  <span className="mt-1 block text-sm text-sub">PNG, JPEG, WebP, or GIF. Resizing stays on this device.</span>
                </span>
              </label>
            )}
            {source && (
              <label className="mt-3 inline-flex cursor-pointer text-sm font-semibold text-accent">
                Choose a different image
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif"
                  className="sr-only"
                  aria-label="Choose a different image"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void openFile(file);
                    e.target.value = "";
                  }}
                />
              </label>
            )}
            {source?.gif && <p className="mt-2 text-xs text-sub">Animated GIFs are flattened to the first frame.</p>}
            {error && <p className="mt-3 text-sm text-dnd">{error}</p>}
          </div>

          <aside className="h-fit space-y-4 rounded-2xl bg-side p-4">
            <div>
              <h2 className="font-bold">Size</h2>
              <p className="mt-1 text-xs text-sub">{source ? `Original ${source.w} × ${source.h}` : "Pick an image to set the dimensions."}</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button key={p.label} type="button" disabled={!source} onClick={() => applyPreset(p.w, p.h)} className="rounded-full bg-white/5 px-2.5 py-1 text-[11px] font-semibold hover:bg-white/10 disabled:opacity-40">
                  {p.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
              <label className="block">
                <span className="mb-1 block text-xs font-bold tracking-wide text-sub uppercase">Width</span>
                <input type="number" min={1} max={MAX_EDGE} disabled={!source} value={source ? width : ""} aria-label="Width" onChange={(e) => setEdge("w", e.target.value)} className="w-full rounded-xl border border-white/10 bg-input px-3 py-2.5 outline-none focus:border-accent disabled:opacity-50" />
              </label>
              <button type="button" disabled={!source} onClick={() => setLock((v) => !v)} className="mb-1 grid size-10 place-items-center rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-50" aria-pressed={lock} aria-label={lock ? "Aspect ratio locked" : "Aspect ratio unlocked"}>
                {lock ? <Lock className="size-4 text-accent" /> : <Unlock className="size-4 text-sub" />}
              </button>
              <label className="block">
                <span className="mb-1 block text-xs font-bold tracking-wide text-sub uppercase">Height</span>
                <input type="number" min={1} max={MAX_EDGE} disabled={!source} value={source ? height : ""} aria-label="Height" onChange={(e) => setEdge("h", e.target.value)} className="w-full rounded-xl border border-white/10 bg-input px-3 py-2.5 outline-none focus:border-accent disabled:opacity-50" />
              </label>
            </div>
            <button type="button" disabled={!source} onClick={() => setRotation((r) => (r + 90) % 360)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/5 py-2.5 text-sm font-semibold hover:bg-white/10 disabled:opacity-50">
              <RotateCw className="size-4" /> Rotate 90°
            </button>
            <p className="text-xs text-sub">{lock ? "Aspect ratio stays locked." : "Width and height change independently."} Max edge is {MAX_EDGE}px.</p>
            <label className="block">
              <span className="mb-1 block text-xs font-bold tracking-wide text-sub uppercase">Format</span>
              <select value={format} aria-label="Format" onChange={(e) => setFormat(e.target.value as Format)} className="w-full rounded-xl border border-white/10 bg-input px-3 py-2.5 outline-none focus:border-accent">
                <option value="image/png">PNG</option>
                <option value="image/jpeg">JPEG</option>
                <option value="image/webp">WebP</option>
              </select>
            </label>
            {format !== "image/png" && (
              <label className="block">
                <span className="mb-1 flex justify-between text-xs font-bold tracking-wide text-sub uppercase">
                  Quality <span>{Math.round(quality * 100)}%</span>
                </span>
                <input type="range" min={0.4} max={1} step={0.01} value={quality} aria-label="Quality" onChange={(e) => setQuality(Number(e.target.value))} className="w-full accent-accent" />
              </label>
            )}
            <button onClick={download} disabled={!source} className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3 font-semibold text-white disabled:opacity-50">
              <Download className="size-4" /> Download resized image
            </button>
          </aside>
        </div>
      </div>
    </div>
  );
}
