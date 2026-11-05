"use client";

import { useState } from "react";
import { Binary, Check, Copy } from "lucide-react";
import AppFrame from "./AppFrame";

function toBase64(text: string) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

function fromBase64(text: string) {
  const binary = atob(text.replace(/\s+/g, ""));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export default function Base64Lab({ onBack, mobile }: { onBack: () => void; mobile?: boolean }) {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function encode() {
    try {
      setOutput(toBase64(input));
      setError(null);
    } catch (e) {
      setError((e as Error).message || "Could not encode.");
    }
  }

  function decode() {
    try {
      setOutput(fromBase64(input));
      setError(null);
    } catch {
      setError("That isn't valid Base64.");
    }
  }

  async function copyOut() {
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      /* ignore */
    }
  }

  return (
    <AppFrame
      title="Base64"
      Icon={Binary}
      iconClass="text-[#b5bac1]"
      mobile={mobile}
      onBack={onBack}
      actions={
        <button onClick={() => void copyOut()} disabled={!output} className="flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />} Copy
        </button>
      }
    >
      <p className="text-sm text-sub">Encode or decode UTF-8 text as Base64. Handy for tokens and small payloads.</p>
      <label className="block space-y-1.5">
        <span className="text-xs font-semibold text-sub">Input</span>
        <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={6} className="w-full resize-y rounded-xl border border-white/10 bg-input px-3 py-2.5 font-mono text-sm outline-none focus:border-accent" />
      </label>
      <div className="flex flex-wrap gap-2">
        <button onClick={encode} className="rounded-xl bg-accent px-3 py-2 text-sm font-semibold text-white">
          Encode
        </button>
        <button onClick={decode} className="rounded-xl bg-side px-3 py-2 text-sm font-semibold hover:bg-hover">
          Decode
        </button>
        <button
          onClick={() => {
            setInput(output);
            setOutput(input);
          }}
          className="rounded-xl bg-side px-3 py-2 text-sm font-semibold hover:bg-hover"
        >
          Swap
        </button>
      </div>
      {error && <p className="rounded-xl bg-dnd/15 px-3 py-2 text-sm text-[#ff8a8c]">{error}</p>}
      <label className="block space-y-1.5">
        <span className="text-xs font-semibold text-sub">Output</span>
        <textarea value={output} readOnly rows={6} className="w-full resize-y rounded-xl border border-white/10 bg-side px-3 py-2.5 font-mono text-sm outline-none" />
      </label>
    </AppFrame>
  );
}
