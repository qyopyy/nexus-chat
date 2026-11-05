"use client";

import { useMemo, useState } from "react";
import { CaseSensitive, Check, Copy } from "lucide-react";
import AppFrame from "./AppFrame";

function slugify(s: string) {
  return s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export default function TextLab({ onBack, mobile }: { onBack: () => void; mobile?: boolean }) {
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);
  const stats = useMemo(() => {
    const trimmed = text.trim();
    const words = trimmed ? trimmed.split(/\s+/).length : 0;
    const lines = text ? text.split(/\n/).length : 0;
    const chars = text.length;
    const noSpaces = text.replace(/\s/g, "").length;
    return { words, lines, chars, noSpaces };
  }, [text]);

  async function copyOut(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      /* ignore */
    }
  }

  const actions = [
    { label: "UPPERCASE", run: () => setText((t) => t.toUpperCase()) },
    { label: "lowercase", run: () => setText((t) => t.toLowerCase()) },
    { label: "Title Case", run: () => setText((t) => t.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())) },
    { label: "Trim spaces", run: () => setText((t) => t.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim()) },
    { label: "Slugify", run: () => setText((t) => slugify(t)) },
    { label: "Reverse", run: () => setText((t) => [...t].reverse().join("")) },
  ];

  return (
    <AppFrame
      title="Text lab"
      Icon={CaseSensitive}
      iconClass="text-[#5865f2]"
      mobile={mobile}
      onBack={onBack}
      actions={
        <button onClick={() => void copyOut(text)} disabled={!text} className="flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />} Copy
        </button>
      }
    >
      <p className="text-sm text-sub">Count words, tidy casing, and slugify titles without leaving Nexus.</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={10}
        placeholder="Paste lyrics, a bio, a release title…"
        className="w-full resize-y rounded-xl border border-white/10 bg-input px-3 py-2.5 outline-none focus:border-accent"
      />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["Words", stats.words],
          ["Characters", stats.chars],
          ["No spaces", stats.noSpaces],
          ["Lines", stats.lines],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-xl bg-side px-3 py-2.5">
            <div className="text-xs font-semibold text-sub">{label}</div>
            <div className="text-lg font-bold">{value}</div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <button key={a.label} onClick={a.run} className="rounded-xl bg-side px-3 py-2 text-sm font-semibold hover:bg-hover">
            {a.label}
          </button>
        ))}
        <button onClick={() => setText("")} className="rounded-xl bg-side px-3 py-2 text-sm font-semibold text-dnd hover:bg-hover">
          Clear
        </button>
      </div>
    </AppFrame>
  );
}
