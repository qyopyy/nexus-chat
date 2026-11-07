"use client";

import { useEffect, useRef, useState } from "react";
import { Eraser, PenLine, Type, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type Signature = { url: string; w: number; h: number };
const SAVED = "nexus.pdf.signature";

export function loadSavedSignature(): Signature | null {
  try {
    const s = JSON.parse(localStorage.getItem(SAVED) || "null");
    return s && typeof s.url === "string" && s.url.startsWith("data:image/") ? s : null;
  } catch {
    return null;
  }
}
export function forgetSavedSignature() {
  try {
    localStorage.removeItem(SAVED);
  } catch {
    /* storage blocked */
  }
}

/** handwriting fonts for the typed signature generator (Google Fonts) */
const STYLES = [
  { family: "Great Vibes", size: 1 },
  { family: "Dancing Script", size: 0.9 },
  { family: "Allura", size: 1.05 },
  { family: "Sacramento", size: 1.05 },
  { family: "Homemade Apple", size: 0.72 },
  { family: "Caveat", size: 0.95 },
] as const;
let fontsLinked = false;
function linkFonts() {
  if (fontsLinked || typeof document === "undefined") return;
  fontsLinked = true;
  const l = document.createElement("link");
  l.rel = "stylesheet";
  l.href = `https://fonts.googleapis.com/css2?${STYLES.map((s) => `family=${s.family.replace(/ /g, "+")}`).join("&")}&display=swap`;
  document.head.appendChild(l);
}

/** crop to the ink and return a transparent PNG */
function trim(canvas: HTMLCanvasElement): Signature | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const { width, height } = canvas;
  const d = ctx.getImageData(0, 0, width, height).data;
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (d[(y * width + x) * 4 + 3] > 12) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) return null;
  const pad = 8;
  x0 = Math.max(0, x0 - pad);
  y0 = Math.max(0, y0 - pad);
  x1 = Math.min(width - 1, x1 + pad);
  y1 = Math.min(height - 1, y1 + pad);
  const out = document.createElement("canvas");
  out.width = x1 - x0 + 1;
  out.height = y1 - y0 + 1;
  out.getContext("2d")!.drawImage(canvas, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return { url: out.toDataURL("image/png"), w: out.width, h: out.height };
}

const INKS = ["#111827", "#1d4ed8", "#0f766e"];

/** Draw, type (signature generator) or upload a signature */
export default function SignaturePad({ onDone, onClose }: { onDone: (s: Signature) => void; onClose: () => void }) {
  const [tab, setTab] = useState<"draw" | "type" | "upload">("draw");
  const [ink, setInk] = useState(INKS[0]);
  const [name, setName] = useState("");
  const [style, setStyle] = useState(0);
  const [save, setSave] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [drawn, setDrawn] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const upload = useRef<Signature | null>(null);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);

  useEffect(() => {
    linkFonts();
  }, []);

  // drawing pad (pointer events → smooth quadratic strokes, pressure-aware)
  useEffect(() => {
    if (tab !== "draw") return;
    const c = canvas.current;
    if (!c) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const rect = c.getBoundingClientRect();
    c.width = Math.round(rect.width * dpr);
    c.height = Math.round(rect.height * dpr);
    const ctx = c.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    let pts: { x: number; y: number }[] = [];
    let down = false;
    const pos = (e: PointerEvent) => {
      const r = c.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const onDown = (e: PointerEvent) => {
      down = true;
      c.setPointerCapture(e.pointerId);
      pts = [pos(e)];
    };
    const onMove = (e: PointerEvent) => {
      if (!down) return;
      const p = pos(e);
      pts.push(p);
      if (pts.length < 3) return;
      const [a, b] = [pts[pts.length - 3], pts[pts.length - 2]];
      const mid1 = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const mid2 = { x: (b.x + p.x) / 2, y: (b.y + p.y) / 2 };
      const speed = Math.hypot(p.x - b.x, p.y - b.y);
      ctx.strokeStyle = ink;
      ctx.lineWidth = e.pressure && e.pointerType === "pen" ? 1 + e.pressure * 3.5 : Math.max(1.4, 3.2 - speed * 0.06);
      ctx.beginPath();
      ctx.moveTo(mid1.x, mid1.y);
      ctx.quadraticCurveTo(b.x, b.y, mid2.x, mid2.y);
      ctx.stroke();
      setDrawn(true);
    };
    const onUp = () => {
      if (down && pts.length < 3 && pts[0]) {
        ctx.fillStyle = ink;
        ctx.beginPath();
        ctx.arc(pts[0].x, pts[0].y, 1.6, 0, Math.PI * 2);
        ctx.fill();
        setDrawn(true);
      }
      down = false;
    };
    c.addEventListener("pointerdown", onDown);
    c.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      c.removeEventListener("pointerdown", onDown);
      c.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [tab, ink]);

  const clear = () => {
    const c = canvas.current;
    if (!c) return;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setDrawn(false);
  };

  const renderTyped = async (): Promise<Signature | null> => {
    const text = name.trim();
    if (!text) return null;
    const st = STYLES[style];
    const px = Math.round(110 * st.size);
    try {
      await document.fonts.load(`${px}px "${st.family}"`, text);
    } catch {
      /* falls back to cursive */
    }
    const c = document.createElement("canvas");
    const ctx = c.getContext("2d")!;
    ctx.font = `${px}px "${st.family}", cursive`;
    const w = Math.ceil(ctx.measureText(text).width) + 80;
    c.width = Math.min(2400, w);
    c.height = Math.round(px * 1.8);
    ctx.font = `${px}px "${st.family}", cursive`;
    ctx.fillStyle = ink;
    ctx.textBaseline = "middle";
    ctx.fillText(text, 40, c.height / 2);
    return trim(c);
  };

  const onUpload = (f: File) => {
    setErr(null);
    if (!/^image\//.test(f.type)) return setErr("Pick a photo or PNG of your signature");
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1600 / img.width);
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img, 0, 0, c.width, c.height);
      // paper → transparent: drop near-white pixels so only the ink stays
      const data = ctx.getImageData(0, 0, c.width, c.height);
      const d = data.data;
      for (let i = 0; i < d.length; i += 4) {
        const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        if (lum > 200) d[i + 3] = 0;
        else if (lum > 150) d[i + 3] = Math.round(d[i + 3] * ((200 - lum) / 50));
      }
      ctx.putImageData(data, 0, 0);
      const t = trim(c);
      upload.current = t;
      setUploadPreview(t?.url ?? null);
      if (!t) setErr("Couldn't find a signature in that image");
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(f);
  };

  const done = async () => {
    setErr(null);
    let sig: Signature | null = null;
    if (tab === "draw") sig = canvas.current ? trim(canvas.current) : null;
    else if (tab === "type") sig = await renderTyped();
    else sig = upload.current;
    if (!sig) return setErr(tab === "draw" ? "Draw your signature first" : tab === "type" ? "Type your name first" : "Upload an image first");
    if (save)
      try {
        localStorage.setItem(SAVED, JSON.stringify(sig));
      } catch {
        /* storage full / blocked */
      }
    onDone(sig);
  };

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/60 p-3" onClick={onClose}>
      <div className="w-full max-w-lg animate-pop rounded-2xl bg-menu p-4 text-txt shadow-2xl ring-1 ring-white/10" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center gap-2">
          <PenLine className="size-5 text-accent" />
          <h2 className="flex-1 text-lg font-bold">Create your signature</h2>
          <button onClick={onClose} className="grid size-8 place-items-center rounded-full hover:bg-hover" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>
        <div className="mb-3 grid grid-cols-3 gap-1 rounded-xl bg-black/25 p-1">
          {(
            [
              ["draw", "Draw", PenLine],
              ["type", "Type", Type],
              ["upload", "Upload", Upload],
            ] as const
          ).map(([id, label, Icon]) => (
            <button key={id} onClick={() => setTab(id)} className={cn("flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold", tab === id ? "bg-accent text-white" : "text-sub")}>
              <Icon className="size-4" /> {label}
            </button>
          ))}
        </div>

        {tab === "draw" && (
          <div>
            <div className="relative overflow-hidden rounded-xl bg-white">
              <canvas ref={canvas} className="block h-48 w-full touch-none" style={{ cursor: "crosshair" }} />
              <div className="pointer-events-none absolute inset-x-6 bottom-10 border-b border-dashed border-slate-300" />
              {!drawn && <div className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-slate-400">Sign here with your finger, mouse or pen</div>}
            </div>
            <button onClick={clear} className="mt-2 flex items-center gap-1.5 text-sm text-sub hover:text-txt">
              <Eraser className="size-4" /> Clear
            </button>
          </div>
        )}

        {tab === "type" && (
          <div className="space-y-2">
            <input value={name} onChange={(e) => setName(e.target.value.slice(0, 40))} placeholder="Type your full name" className="w-full rounded-xl bg-black/25 px-3 py-2.5 outline-none focus:ring-2 focus:ring-accent/60" autoFocus />
            <div className="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto">
              {STYLES.map((st, i) => (
                <button key={st.family} onClick={() => setStyle(i)} className={cn("h-20 truncate rounded-xl bg-white px-3 text-left", style === i && "ring-4 ring-accent")} style={{ fontFamily: `"${st.family}", cursive`, fontSize: `${30 * st.size}px`, color: ink }}>
                  {name || "Your Name"}
                </button>
              ))}
            </div>
          </div>
        )}

        {tab === "upload" && (
          <label className="grid h-48 cursor-pointer place-items-center rounded-xl border border-dashed border-white/20 bg-white text-center text-sm text-slate-500">
            {uploadPreview ? <img src={uploadPreview} alt="Your signature" className="max-h-40 max-w-[90%]" /> : "Tap to choose a photo of your signature on white paper"}
            <input type="file" accept="image/*" className="sr-only" onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])} />
          </label>
        )}

        {tab !== "upload" && (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs font-semibold text-sub">Ink</span>
            {INKS.map((c) => (
              <button key={c} onClick={() => setInk(c)} className={cn("size-7 rounded-full ring-2 ring-offset-2 ring-offset-menu", ink === c ? "ring-accent" : "ring-transparent")} style={{ background: c }} aria-label={`Ink ${c}`} />
            ))}
          </div>
        )}
        <label className="mt-3 flex items-center gap-2 text-sm text-sub">
          <input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} className="accent-accent" /> Remember on this device
        </label>
        {err && <p className="mt-2 text-sm text-dnd">{err}</p>}
        <div className="mt-4 flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-xl bg-white/10 py-2.5 font-semibold">
            Cancel
          </button>
          <button onClick={() => void done()} className="flex-1 rounded-xl bg-accent py-2.5 font-bold text-white">
            Use signature
          </button>
        </div>
      </div>
    </div>
  );
}
