"use client";

import { useState } from "react";
import { Check, Copy, KeyRound } from "lucide-react";
import AppFrame from "./AppFrame";

const ALPHA = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const SYMBOLS = "!@#$%^&*_-+=?";

function randomBytes(n: number) {
  const buf = new Uint8Array(n);
  crypto.getRandomValues(buf);
  return buf;
}

function password(length: number, symbols: boolean) {
  const alphabet = symbols ? ALPHA + SYMBOLS : ALPHA;
  const bytes = randomBytes(length);
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
}

function uuid() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = randomBytes(16);
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export default function TokenGen({ onBack, mobile }: { onBack: () => void; mobile?: boolean }) {
  const [length, setLength] = useState(24);
  const [symbols, setSymbols] = useState(true);
  const [value, setValue] = useState(() => password(24, true));
  const [mode, setMode] = useState<"password" | "uuid">("password");
  const [copied, setCopied] = useState(false);

  function regenerate() {
    setValue(mode === "uuid" ? uuid() : password(length, symbols));
  }

  async function copyOut() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      /* ignore */
    }
  }

  return (
    <AppFrame
      title="Token gen"
      Icon={KeyRound}
      iconClass="text-[#00a8fc]"
      mobile={mobile}
      onBack={onBack}
      actions={
        <button onClick={() => void copyOut()} className="flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-sm font-semibold text-white">
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />} Copy
        </button>
      }
    >
      <p className="text-sm text-sub">Generate passwords or UUIDs with Web Crypto. Values never leave this tab.</p>
      <div className="flex gap-2">
        {(
          [
            ["password", "Password"],
            ["uuid", "UUID"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => {
              setMode(id);
              setValue(id === "uuid" ? uuid() : password(length, symbols));
            }}
            className={`rounded-xl px-3 py-2 text-sm font-semibold ${mode === id ? "bg-accent text-white" : "bg-side hover:bg-hover"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="rounded-2xl bg-side p-4">
        <code className="block break-all font-mono text-sm">{value}</code>
      </div>
      {mode === "password" && (
        <div className="space-y-3 rounded-2xl bg-side p-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-sub">Length · {length}</span>
            <input type="range" min={8} max={64} value={length} onChange={(e) => setLength(Number(e.target.value))} className="w-full" />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={symbols} onChange={(e) => setSymbols(e.target.checked)} />
            Include symbols
          </label>
        </div>
      )}
      <button onClick={regenerate} className="w-full rounded-xl bg-accent py-3 text-sm font-bold text-white">
        Generate another
      </button>
    </AppFrame>
  );
}
