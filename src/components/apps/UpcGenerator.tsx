"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Barcode, Copy, Download, RefreshCw } from "lucide-react";
import { toast } from "@/store/app";
import { sanitizeDownloadName } from "@/lib/fileSafety";
import { completeCode, drawUpcBars, sequentialBody, validateCode, type UpcMode } from "@/lib/upc";
import AppFrame from "./AppFrame";

export default function UpcGenerator({ onBack, mobile }: { onBack: () => void; mobile?: boolean }) {
  const [mode, setMode] = useState<UpcMode>("upc-a");
  const [prefix, setPrefix] = useState("860");
  const [seq, setSeq] = useState(1);
  const [manual, setManual] = useState("");
  const [label, setLabel] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const generated = useMemo(() => {
    const body = sequentialBody(mode, prefix, seq);
    return body ? completeCode(mode, body) : null;
  }, [mode, prefix, seq]);

  const code = manual.trim() ? manual.trim() : generated ?? "";
  const check = code ? validateCode(code) : null;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !check?.ok) return;
    drawUpcBars(canvas, code);
  }, [code, check?.ok]);

  function copy() {
    if (!check?.ok) return;
    void navigator.clipboard.writeText(code).then(() => toast("UPC copied", "success"));
  }

  function download() {
    const canvas = canvasRef.current;
    if (!canvas || !check?.ok) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `${sanitizeDownloadName(label || code, "upc")}.png`;
    a.click();
  }

  return (
    <AppFrame
      title="UPC / EAN generator"
      Icon={Barcode}
      iconClass="text-[#1DB954]"
      mobile={mobile}
      onBack={onBack}
      actions={
        <div className="flex gap-1.5">
          <button type="button" onClick={copy} disabled={!check?.ok} className="flex items-center gap-1 rounded-full bg-hover px-3 py-1.5 text-sm font-semibold disabled:opacity-40">
            <Copy className="size-3.5" /> Copy
          </button>
          <button type="button" onClick={download} disabled={!check?.ok} className="flex items-center gap-1 rounded-full bg-accent px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40">
            <Download className="size-3.5" /> PNG
          </button>
        </div>
      }
    >
      <p className="text-sm text-sub">
        Generate GS1 UPC-A (12) or EAN-13 barcodes for releases — check digit included. Use your company prefix when you have one; otherwise treat codes as internal until a GS1 prefix is assigned.
      </p>

      <div className="flex flex-wrap gap-2">
        {(["upc-a", "ean-13"] as UpcMode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`rounded-full px-3 py-1.5 text-xs font-bold uppercase ${mode === m ? "bg-accent text-white" : "bg-hover text-sub"}`}
          >
            {m === "upc-a" ? "UPC-A" : "EAN-13"}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-1 text-sm sm:col-span-1">
          <span className="text-xs font-semibold text-sub">Company prefix</span>
          <input value={prefix} onChange={(e) => setPrefix(e.target.value)} className="w-full rounded-xl border border-line bg-input px-3 py-2 outline-none focus:border-accent" />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-xs font-semibold text-sub">Sequence</span>
          <div className="flex gap-1">
            <input type="number" min={0} value={seq} onChange={(e) => setSeq(Math.max(0, Number(e.target.value) || 0))} className="w-full rounded-xl border border-line bg-input px-3 py-2 outline-none focus:border-accent" />
            <button type="button" onClick={() => setSeq((s) => s + 1)} className="rounded-xl bg-hover px-3" title="Next">
              <RefreshCw className="size-4" />
            </button>
          </div>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-xs font-semibold text-sub">Label (optional)</span>
          <input value={label} onChange={(e) => setLabel(e.target.value.slice(0, 80))} placeholder="Release title" className="w-full rounded-xl border border-line bg-input px-3 py-2 outline-none focus:border-accent" />
        </label>
      </div>

      <label className="block space-y-1 text-sm">
        <span className="text-xs font-semibold text-sub">Or paste / validate a code</span>
        <input
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          placeholder={mode === "upc-a" ? "12 digits" : "13 digits"}
          className="w-full rounded-xl border border-line bg-input px-3 py-2 font-mono outline-none focus:border-accent"
        />
      </label>

      <div className="rounded-2xl border border-line bg-side/60 p-4 text-center">
        {check?.ok ? (
          <>
            <div className="mb-2 font-mono text-lg font-bold tracking-widest">{code}</div>
            {label && <div className="mb-3 text-sm text-sub">{label}</div>}
            <canvas ref={canvasRef} className="mx-auto max-w-full rounded-lg bg-white" />
            <p className="mt-2 text-xs text-ok">Valid {check.mode?.toUpperCase()} · GS1 check digit OK</p>
          </>
        ) : (
          <p className="text-sm text-sub">{manual.trim() ? check?.reason || "Invalid" : "Set a prefix + sequence, or paste a code to validate."}</p>
        )}
      </div>
    </AppFrame>
  );
}
