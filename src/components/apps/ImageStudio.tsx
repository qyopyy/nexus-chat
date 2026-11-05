"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Crop,
  Download,
  ImagePlus,
  ImageUpscale,
  Lock,
  RotateCw,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Unlock,
} from "lucide-react";
import {
  canvasToBlob,
  DEFAULT_FILTERS,
  downloadBlob,
  drawImage,
  extFor,
  filterCss,
  loadImageFromFile,
  type CropRect,
  type FilterAdjust,
  type ImageFormat,
  upscaleImage,
} from "@/lib/imageEdit";
import { sanitizeDownloadName, sniffImage } from "@/lib/fileSafety";
import { cn } from "@/lib/utils";
import AppFrame from "./AppFrame";

const MAX_EDGE = 8192;
const MAX_OUT = 8192;
const MAX_BYTES = 25 * 1024 * 1024;

const PRESETS = [
  { label: "Avatar 256", w: 256, h: 256 },
  { label: "Avatar 512", w: 512, h: 512 },
  { label: "Banner 1280×720", w: 1280, h: 720 },
  { label: "Square 1080", w: 1080, h: 1080 },
  { label: "Story 1080×1920", w: 1080, h: 1920 },
] as const;

const FILTER_PRESETS: { label: string; patch: Partial<FilterAdjust> }[] = [
  { label: "Reset", patch: { ...DEFAULT_FILTERS } },
  { label: "Vivid", patch: { saturate: 140, contrast: 110, brightness: 105 } },
  { label: "Soft", patch: { contrast: 90, brightness: 108, saturate: 90, blur: 0.4 } },
  { label: "Mono", patch: { grayscale: 100, contrast: 115 } },
  { label: "Film", patch: { sepia: 35, contrast: 105, saturate: 85 } },
  { label: "Cool", patch: { hue: 190, saturate: 110 } },
  { label: "Warm", patch: { hue: 25, saturate: 120, brightness: 105 } },
];

type Tab = "resize" | "crop" | "filters" | "upscale";

function clamp(n: number, max = MAX_EDGE) {
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(max, Math.round(n)));
}

export default function ImageStudio({ onBack, mobile }: { onBack: () => void; mobile?: boolean }) {
  const [tab, setTab] = useState<Tab>("resize");
  const [fileName, setFileName] = useState("image");
  const [source, setSource] = useState<{ img: HTMLImageElement; w: number; h: number; gif: boolean } | null>(null);
  const [width, setWidth] = useState(1);
  const [height, setHeight] = useState(1);
  const [lock, setLock] = useState(true);
  const [format, setFormat] = useState<ImageFormat>("image/png");
  const [quality, setQuality] = useState(0.92);
  const [rotation, setRotation] = useState(0);
  const [filters, setFilters] = useState<FilterAdjust>({ ...DEFAULT_FILTERS });
  const [crop, setCrop] = useState<CropRect | null>(null);
  const [scale, setScale] = useState(2);
  const [sharpen, setSharpen] = useState(0.55);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ratio = useRef(1);
  const dragCrop = useRef<{ x0: number; y0: number } | null>(null);

  const outSize = useMemo(() => {
    if (!source) return null;
    if (tab === "upscale") {
      return { w: clamp(source.w * scale, MAX_OUT), h: clamp(source.h * scale, MAX_OUT) };
    }
    if (tab === "crop" && crop) {
      return { w: clamp(crop.w), h: clamp(crop.h) };
    }
    const rot = ((rotation % 360) + 360) % 360;
    const swap = rot === 90 || rot === 270;
    return { w: swap ? height : width, h: swap ? width : height };
  }, [source, tab, scale, crop, rotation, width, height]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const img = source?.img;
    if (!canvas || !img || !source) return;
    try {
      if (tab === "upscale") {
        const tmp = document.createElement("canvas");
        drawImage(tmp, img, { width: source.w, height: source.h, jpegFill: format === "image/jpeg" });
        const previewScale = Math.min(scale, 2);
        const up = upscaleImage(tmp, previewScale, sharpen * 0.35);
        canvas.width = up.width;
        canvas.height = up.height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(up, 0, 0);
        return;
      }
      if (tab === "crop") {
        drawImage(canvas, img, { width: source.w, height: source.h, jpegFill: format === "image/jpeg" });
        if (crop) {
          const ctx = canvas.getContext("2d")!;
          ctx.fillStyle = "rgba(0,0,0,0.45)";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.clearRect(crop.x, crop.y, crop.w, crop.h);
          ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, crop.x, crop.y, crop.w, crop.h);
          ctx.strokeStyle = "#00a8fc";
          ctx.lineWidth = Math.max(2, Math.round(source.w / 400));
          ctx.strokeRect(crop.x + 0.5, crop.y + 0.5, crop.w - 1, crop.h - 1);
        }
        return;
      }
      drawImage(canvas, img, {
        width,
        height,
        rotation,
        filters: tab === "filters" || tab === "resize" ? filters : DEFAULT_FILTERS,
        jpegFill: format === "image/jpeg",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't draw preview.");
    }
  }, [source, width, height, format, rotation, filters, crop, tab, scale, sharpen]);

  function clearSession() {
    setSource(null);
    setFileName("image");
    setError(null);
    setRotation(0);
    setWidth(1);
    setHeight(1);
    setFilters({ ...DEFAULT_FILTERS });
    setCrop(null);
    setScale(2);
  }

  async function openFile(file: File) {
    setError(null);
    if (file.size > MAX_BYTES) {
      setError("That image is over 25 MB.");
      return;
    }
    try {
      const kind = await sniffImage(file);
      const img = await loadImageFromFile(file);
      if (!img.naturalWidth || !img.naturalHeight) throw new Error("That image has no pixels.");
      if (img.naturalWidth > MAX_EDGE || img.naturalHeight > MAX_EDGE) {
        throw new Error(`Image edges must be ${MAX_EDGE}px or smaller.`);
      }
      ratio.current = img.naturalWidth / img.naturalHeight;
      setFileName(sanitizeDownloadName(file.name.replace(/\.[^.]+$/, ""), "image"));
      setSource({ img, w: img.naturalWidth, h: img.naturalHeight, gif: kind === "image/gif" });
      setWidth(img.naturalWidth);
      setHeight(img.naturalHeight);
      setRotation(0);
      setCrop({ x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight });
      setFilters({ ...DEFAULT_FILTERS });
      setFormat(kind === "image/jpeg" ? "image/jpeg" : kind === "image/webp" ? "image/webp" : "image/png");
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
      const s = Math.min(w / source.w, h / source.h);
      setWidth(clamp(source.w * s));
      setHeight(clamp(source.h * s));
    } else {
      setWidth(clamp(w));
      setHeight(clamp(h));
    }
  }

  async function download() {
    if (!source) return;
    setBusy(true);
    setError(null);
    try {
      const canvas = document.createElement("canvas");
      if (tab === "upscale") {
        const base = document.createElement("canvas");
        drawImage(base, source.img, { width: source.w, height: source.h, filters, jpegFill: format === "image/jpeg" });
        const up = upscaleImage(base, scale, sharpen);
        canvas.width = up.width;
        canvas.height = up.height;
        canvas.getContext("2d")!.drawImage(up, 0, 0);
      } else {
        drawImage(canvas, source.img, {
          width: tab === "crop" && crop ? clamp(crop.w) : width,
          height: tab === "crop" && crop ? clamp(crop.h) : height,
          rotation: tab === "crop" ? 0 : rotation,
          crop: tab === "crop" ? crop : null,
          filters,
          jpegFill: format === "image/jpeg",
        });
      }
      if (canvas.width > MAX_OUT || canvas.height > MAX_OUT) {
        throw new Error(`Output edges must be ${MAX_OUT}px or smaller.`);
      }
      const blob = await canvasToBlob(canvas, format, quality);
      downloadBlob(blob, `${fileName}-${tab}-${canvas.width}x${canvas.height}.${extFor(format)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed.");
    } finally {
      setBusy(false);
    }
  }

  function onCropPointer(e: React.MouseEvent<HTMLCanvasElement>) {
    if (tab !== "crop" || !source || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const sx = (e.clientX - rect.left) / rect.width;
    const sy = (e.clientY - rect.top) / rect.height;
    const x = Math.round(sx * source.w);
    const y = Math.round(sy * source.h);
    if (e.type === "mousedown") {
      dragCrop.current = { x0: x, y0: y };
      setCrop({ x, y, w: 1, h: 1 });
      return;
    }
    if (e.type === "mousemove" && dragCrop.current && e.buttons === 1) {
      const x0 = dragCrop.current.x0;
      const y0 = dragCrop.current.y0;
      const left = Math.max(0, Math.min(x0, x));
      const top = Math.max(0, Math.min(y0, y));
      const right = Math.min(source.w, Math.max(x0, x));
      const bottom = Math.min(source.h, Math.max(y0, y));
      setCrop({ x: left, y: top, w: Math.max(1, right - left), h: Math.max(1, bottom - top) });
    }
    if (e.type === "mouseup") dragCrop.current = null;
  }

  const tabs: { id: Tab; label: string; Icon: typeof Crop }[] = [
    { id: "resize", label: "Resize", Icon: ImagePlus },
    { id: "crop", label: "Crop", Icon: Crop },
    { id: "filters", label: "Filters", Icon: SlidersHorizontal },
    { id: "upscale", label: "Upscale", Icon: ImageUpscale },
  ];

  return (
    <AppFrame
      title="Image studio"
      Icon={ImagePlus}
      iconClass="text-[#00a8fc]"
      mobile={mobile}
      onBack={onBack}
      wide
      actions={
        source ? (
          <>
            <button onClick={clearSession} className="grid size-9 place-items-center rounded-full hover:bg-hover" aria-label="Clear image from memory">
              <Trash2 className="size-4" />
            </button>
            <button onClick={() => void download()} disabled={busy} className="flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
              <Download className="size-4" /> {busy ? "…" : "Download"}
            </button>
          </>
        ) : undefined
      }
    >
      <div className="flex items-start gap-2 rounded-2xl bg-side/80 px-3 py-2 text-xs text-sub">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-ok" />
        <span>
          Resize, crop, filters, and a local upscaler (stepped high-quality scale + sharpen). Files stay in this tab — EXIF is stripped on export. Max {Math.round(MAX_BYTES / 1024 / 1024)} MB in · {MAX_OUT}px out.
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold", tab === t.id ? "bg-accent text-white" : "bg-side hover:bg-hover")}
          >
            <t.Icon className="size-3.5" /> {t.label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
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
            <div className={cn("relative grid place-items-center rounded-2xl border border-dashed bg-side p-4", dragOver ? "border-accent" : "border-white/15")}>
              <canvas
                ref={canvasRef}
                aria-label="Image preview"
                className={cn("max-h-[520px] max-w-full rounded-xl bg-[repeating-conic-gradient(#2b2d31_0%_25%,#232428_0%_50%)] bg-[length:24px_24px]", tab === "crop" && "cursor-crosshair")}
                onMouseDown={onCropPointer}
                onMouseMove={onCropPointer}
                onMouseUp={onCropPointer}
              />
              {tab === "crop" && crop && source && (
                <p className="mt-2 text-xs text-sub">
                  Crop {crop.w}×{crop.h} from ({crop.x}, {crop.y}) — drag on the preview to set.
                </p>
              )}
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
                <span className="mt-1 block text-sm text-sub">PNG, JPEG, WebP, or GIF. Editing stays on this device.</span>
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
            <h2 className="font-bold capitalize">{tab === "upscale" ? "Upscaler" : tab}</h2>
            <p className="mt-1 text-xs text-sub">
              {source ? `Original ${source.w} × ${source.h}` : "Pick an image to begin."}
              {outSize ? ` · Out ${outSize.w} × ${outSize.h}` : ""}
            </p>
          </div>

          {tab === "resize" && (
            <>
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
                <button type="button" disabled={!source} onClick={() => setLock((v) => !v)} className="mb-1 grid size-10 place-items-center rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-50" aria-pressed={lock}>
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
            </>
          )}

          {tab === "crop" && (
            <>
              <p className="text-xs text-sub">Drag on the preview to select a crop region from the original pixels.</p>
              <div className="grid grid-cols-2 gap-2">
                {(["x", "y", "w", "h"] as const).map((k) => (
                  <label key={k} className="block">
                    <span className="mb-1 block text-xs font-bold tracking-wide text-sub uppercase">{k}</span>
                    <input
                      type="number"
                      disabled={!source || !crop}
                      value={crop?.[k] ?? ""}
                      onChange={(e) => {
                        if (!crop || !source) return;
                        const n = Math.max(0, Number(e.target.value) || 0);
                        const next = { ...crop, [k]: n };
                        if (k === "w") next.w = clamp(Math.min(n, source.w - crop.x));
                        if (k === "h") next.h = clamp(Math.min(n, source.h - crop.y));
                        if (k === "x") next.x = Math.min(n, source.w - 1);
                        if (k === "y") next.y = Math.min(n, source.h - 1);
                        setCrop(next);
                      }}
                      className="w-full rounded-xl border border-white/10 bg-input px-3 py-2.5 outline-none focus:border-accent disabled:opacity-50"
                    />
                  </label>
                ))}
              </div>
              <button
                type="button"
                disabled={!source}
                onClick={() => source && setCrop({ x: 0, y: 0, w: source.w, h: source.h })}
                className="w-full rounded-xl bg-white/5 py-2 text-sm font-semibold hover:bg-white/10 disabled:opacity-50"
              >
                Reset crop
              </button>
            </>
          )}

          {tab === "filters" && (
            <>
              <div className="flex flex-wrap gap-1.5">
                {FILTER_PRESETS.map((p) => (
                  <button key={p.label} type="button" disabled={!source} onClick={() => setFilters({ ...DEFAULT_FILTERS, ...p.patch })} className="rounded-full bg-white/5 px-2.5 py-1 text-[11px] font-semibold hover:bg-white/10 disabled:opacity-40">
                    {p.label}
                  </button>
                ))}
              </div>
              {(
                [
                  ["brightness", 40, 180],
                  ["contrast", 40, 180],
                  ["saturate", 0, 200],
                  ["blur", 0, 8],
                  ["grayscale", 0, 100],
                  ["sepia", 0, 100],
                  ["hue", 0, 360],
                  ["invert", 0, 100],
                ] as const
              ).map(([key, min, max]) => (
                <label key={key} className="block">
                  <span className="mb-1 flex justify-between text-xs font-bold tracking-wide text-sub uppercase">
                    {key} <span>{filters[key]}{key === "hue" ? "°" : key === "blur" ? "px" : "%"}</span>
                  </span>
                  <input
                    type="range"
                    min={min}
                    max={max}
                    step={key === "blur" ? 0.1 : 1}
                    disabled={!source}
                    value={filters[key]}
                    onChange={(e) => setFilters((f) => ({ ...f, [key]: Number(e.target.value) }))}
                    className="w-full accent-accent disabled:opacity-50"
                  />
                </label>
              ))}
              <p className="truncate text-[11px] text-sub" style={{ filter: filterCss(filters) }}>
                Live CSS filter stack preview · Aa
              </p>
            </>
          )}

          {tab === "upscale" && (
            <>
              <p className="text-xs text-sub">Local enhance: multi-step high-quality scale plus unsharp mask. Not generative AI — best for sharpening soft photos and art.</p>
              <label className="block">
                <span className="mb-1 flex justify-between text-xs font-bold tracking-wide text-sub uppercase">
                  Scale <span>{scale.toFixed(1)}×</span>
                </span>
                <input type="range" min={1.25} max={4} step={0.25} disabled={!source} value={scale} onChange={(e) => setScale(Number(e.target.value))} className="w-full accent-accent disabled:opacity-50" />
              </label>
              <div className="flex flex-wrap gap-1.5">
                {[1.5, 2, 3, 4].map((s) => (
                  <button key={s} type="button" disabled={!source} onClick={() => setScale(s)} className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold", scale === s ? "bg-accent text-white" : "bg-white/5 hover:bg-white/10 disabled:opacity-40")}>
                    {s}×
                  </button>
                ))}
              </div>
              <label className="block">
                <span className="mb-1 flex justify-between text-xs font-bold tracking-wide text-sub uppercase">
                  Sharpen <span>{Math.round(sharpen * 100)}%</span>
                </span>
                <input type="range" min={0} max={1.2} step={0.05} disabled={!source} value={sharpen} onChange={(e) => setSharpen(Number(e.target.value))} className="w-full accent-accent disabled:opacity-50" />
              </label>
              {source && outSize && (outSize.w > MAX_OUT || outSize.h > MAX_OUT) && (
                <p className="text-xs text-dnd">That scale would exceed {MAX_OUT}px — lower the factor.</p>
              )}
            </>
          )}

          <label className="block">
            <span className="mb-1 block text-xs font-bold tracking-wide text-sub uppercase">Format</span>
            <select value={format} aria-label="Format" onChange={(e) => setFormat(e.target.value as ImageFormat)} className="w-full rounded-xl border border-white/10 bg-input px-3 py-2.5 outline-none focus:border-accent">
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
              <input type="range" min={0.4} max={1} step={0.01} value={quality} onChange={(e) => setQuality(Number(e.target.value))} className="w-full accent-accent" />
            </label>
          )}
          <button onClick={() => void download()} disabled={!source || busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3 font-semibold text-white disabled:opacity-50">
            <Download className="size-4" /> {busy ? "Working…" : `Download ${tab === "upscale" ? "upscaled" : "edited"} image`}
          </button>
        </aside>
      </div>
    </AppFrame>
  );
}
