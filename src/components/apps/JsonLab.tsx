"use client";

import { useState } from "react";
import { Braces, Check, Copy } from "lucide-react";
import AppFrame from "./AppFrame";

export default function JsonLab({ onBack, mobile }: { onBack: () => void; mobile?: boolean }) {
  const [text, setText] = useState('{\n  "ok": true\n}');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function parse() {
    try {
      return JSON.parse(text) as unknown;
    } catch (e) {
      setError((e as Error).message);
      return null;
    }
  }

  function pretty() {
    const value = parse();
    if (value === null && text.trim()) return;
    setError(null);
    setText(JSON.stringify(value, null, 2));
  }

  function minify() {
    const value = parse();
    if (value === null && text.trim()) return;
    setError(null);
    setText(JSON.stringify(value));
  }

  function validate() {
    if (!text.trim()) {
      setError("Nothing to validate.");
      return;
    }
    if (parse() !== null || text.trim() === "null") setError(null);
  }

  async function copyOut() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      /* ignore */
    }
  }

  return (
    <AppFrame
      title="JSON lab"
      Icon={Braces}
      iconClass="text-[#fee75c]"
      mobile={mobile}
      onBack={onBack}
      actions={
        <button onClick={() => void copyOut()} className="flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-sm font-semibold text-white">
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />} Copy
        </button>
      }
    >
      <p className="text-sm text-sub">Pretty-print, minify, or validate JSON payloads for webhooks and API work.</p>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setError(null);
        }}
        rows={14}
        spellCheck={false}
        className="w-full resize-y rounded-xl border border-white/10 bg-input px-3 py-2.5 font-mono text-sm outline-none focus:border-accent"
      />
      {error ? (
        <p className="rounded-xl bg-dnd/15 px-3 py-2 text-sm text-[#ff8a8c]">{error}</p>
      ) : (
        <p className="rounded-xl bg-ok/15 px-3 py-2 text-sm text-ok">JSON looks valid when you format or check it.</p>
      )}
      <div className="flex flex-wrap gap-2">
        <button onClick={pretty} className="rounded-xl bg-accent px-3 py-2 text-sm font-semibold text-white">
          Pretty
        </button>
        <button onClick={minify} className="rounded-xl bg-side px-3 py-2 text-sm font-semibold hover:bg-hover">
          Minify
        </button>
        <button onClick={validate} className="rounded-xl bg-side px-3 py-2 text-sm font-semibold hover:bg-hover">
          Validate
        </button>
        <button onClick={() => setText("")} className="rounded-xl bg-side px-3 py-2 text-sm font-semibold text-dnd hover:bg-hover">
          Clear
        </button>
      </div>
    </AppFrame>
  );
}
