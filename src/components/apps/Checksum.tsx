"use client";

import { useRef, useState } from "react";
import { Check, Copy, FileDigit, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import AppFrame from "./AppFrame";

const MAX_BYTES = 200 * 1024 * 1024;
type Algo = "SHA-256" | "SHA-384" | "SHA-512";

function hex(buf: ArrayBuffer) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default function Checksum({ onBack, mobile }: { onBack: () => void; mobile?: boolean }) {
  const [algo, setAlgo] = useState<Algo>("SHA-256");
  const [name, setName] = useState<string | null>(null);
  const [size, setSize] = useState(0);
  const [hash, setHash] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [copied, setCopied] = useState(false);
  const pick = useRef<HTMLInputElement>(null);

  async function run(file: File) {
    if (file.size > MAX_BYTES) {
      setError("That file is over 200 MB.");
      return;
    }
    setBusy(true);
    setError(null);
    setHash(null);
    setName(file.name);
    setSize(file.size);
    try {
      const digest = await crypto.subtle.digest(algo, await file.arrayBuffer());
      setHash(hex(digest));
    } catch (e) {
      setError((e as Error).message || "Could not hash that file.");
    } finally {
      setBusy(false);
    }
  }

  async function copyHash() {
    if (!hash) return;
    try {
      await navigator.clipboard.writeText(hash);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      /* ignore */
    }
  }

  return (
    <AppFrame title="File checksum" Icon={FileDigit} iconClass="text-[#eb459e]" mobile={mobile} onBack={onBack}>
      <p className="text-sm text-sub">Hash a local file with Web Crypto. Useful for verifying downloads or release assets. Nothing is uploaded.</p>
      <div className="flex items-start gap-2 rounded-2xl bg-side/80 px-3 py-2 text-xs text-sub">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-ok" />
        <span>SHA digests run entirely in this browser tab. Max {Math.round(MAX_BYTES / 1024 / 1024)} MB.</span>
      </div>
      <label className="block space-y-1.5">
        <span className="text-xs font-semibold text-sub">Algorithm</span>
        <select value={algo} onChange={(e) => setAlgo(e.target.value as Algo)} className="w-full rounded-xl border border-white/10 bg-input px-3 py-2.5 outline-none focus:border-accent">
          <option value="SHA-256">SHA-256</option>
          <option value="SHA-384">SHA-384</option>
          <option value="SHA-512">SHA-512</option>
        </select>
      </label>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) void run(f);
        }}
        onClick={() => !busy && pick.current?.click()}
        className={cn(
          "grid min-h-40 cursor-pointer place-items-center rounded-2xl border border-dashed bg-side p-4 text-center",
          dragOver ? "border-accent bg-accent/10" : "border-white/15",
          busy && "opacity-60",
        )}
      >
        <input ref={pick} type="file" className="sr-only" aria-label="Choose a file" onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void run(f);
          e.target.value = "";
        }} />
        <span>
          <FileDigit className="mx-auto mb-3 size-10 text-sub" />
          <span className="block font-semibold">{busy ? "Hashing…" : "Drop a file, or click to choose one"}</span>
          <span className="mt-1 block text-sm text-sub">Any file type. Digest stays on this device.</span>
        </span>
      </div>
      {error && <p className="rounded-xl bg-dnd/15 px-3 py-2 text-sm text-[#ff8a8c]">{error}</p>}
      {hash && name && (
        <div className="space-y-2 rounded-2xl bg-side p-4">
          <div className="text-sm font-semibold">{name}</div>
          <div className="text-xs text-sub">
            {size > 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(1)} MB` : `${(size / 1024).toFixed(1)} KB`} · {algo}
          </div>
          <button onClick={() => void copyHash()} className="flex w-full items-start gap-2 rounded-xl bg-black/25 px-3 py-2.5 text-left hover:bg-black/35">
            <code className="min-w-0 flex-1 break-all font-mono text-xs">{hash}</code>
            {copied ? <Check className="mt-0.5 size-4 shrink-0 text-ok" /> : <Copy className="mt-0.5 size-4 shrink-0 text-sub" />}
          </button>
        </div>
      )}
    </AppFrame>
  );
}
