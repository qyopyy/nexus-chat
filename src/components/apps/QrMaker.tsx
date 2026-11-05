"use client";

import { useEffect, useRef, useState } from "react";
import { Download, QrCode } from "lucide-react";
import QRCode from "qrcode";
import { sanitizeDownloadName } from "@/lib/fileSafety";
import AppFrame from "./AppFrame";

const SIZES = [256, 384, 512, 768] as const;

export default function QrMaker({ onBack, mobile }: { onBack: () => void; mobile?: boolean }) {
  const [text, setText] = useState("https://");
  const [size, setSize] = useState<(typeof SIZES)[number]>(384);
  const [fg, setFg] = useState("#111827");
  const [bg, setBg] = useState("#ffffff");
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const value = text.trim();
    if (!value) {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      canvas.width = size;
      canvas.height = size;
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, size, size);
      setError(null);
      return;
    }
    void QRCode.toCanvas(canvas, value, {
      width: size,
      margin: 2,
      color: { dark: fg, light: bg },
      errorCorrectionLevel: "M",
    })
      .then(() => setError(null))
      .catch(() => setError("Could not encode that text into a QR code."));
  }, [text, size, fg, bg]);

  function download() {
    const canvas = canvasRef.current;
    if (!canvas || !text.trim()) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `${sanitizeDownloadName(text.slice(0, 40), "qr")}.png`;
    a.click();
  }

  return (
    <AppFrame
      title="QR maker"
      Icon={QrCode}
      iconClass="text-[#23a559]"
      mobile={mobile}
      onBack={onBack}
      actions={
        <button onClick={download} disabled={!text.trim()} className="flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
          <Download className="size-4" /> Download
        </button>
      }
    >
      <p className="text-sm text-sub">Turn a link, release code, or short note into a QR image. Encoding stays in this tab.</p>
      <label className="block space-y-1.5">
        <span className="text-xs font-semibold text-sub">Content</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder="https://…"
          className="w-full resize-y rounded-xl border border-white/10 bg-input px-3 py-2.5 outline-none focus:border-accent"
        />
      </label>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="space-y-1.5">
          <span className="text-xs font-semibold text-sub">Size</span>
          <select value={size} onChange={(e) => setSize(Number(e.target.value) as (typeof SIZES)[number])} className="w-full rounded-xl border border-white/10 bg-input px-3 py-2.5 outline-none focus:border-accent">
            {SIZES.map((s) => (
              <option key={s} value={s}>
                {s}px
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-semibold text-sub">Dots</span>
          <input type="color" value={fg} onChange={(e) => setFg(e.target.value)} className="h-[46px] w-full rounded-xl border border-white/10 bg-input px-2" aria-label="Foreground color" />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-semibold text-sub">Background</span>
          <input type="color" value={bg} onChange={(e) => setBg(e.target.value)} className="h-[46px] w-full rounded-xl border border-white/10 bg-input px-2" aria-label="Background color" />
        </label>
      </div>
      {error && <p className="rounded-xl bg-dnd/15 px-3 py-2 text-sm text-[#ff8a8c]">{error}</p>}
      <div className="grid place-items-center rounded-2xl bg-side p-6">
        <canvas ref={canvasRef} className="max-w-full rounded-xl bg-white shadow-lg" aria-label="QR preview" />
      </div>
    </AppFrame>
  );
}
