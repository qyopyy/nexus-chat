"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

export type P = { onBack: () => void; mobile?: boolean };
export const box = "rounded-2xl bg-side p-4 sm:p-5";
export const field = "w-full rounded-xl bg-black/25 px-3 py-2.5 text-base outline-none focus:ring-2 focus:ring-accent/60";
export const btn = "rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white active:opacity-80 disabled:opacity-40";
export const btnGhost = "rounded-xl bg-black/25 px-3.5 py-2 text-sm font-semibold text-sub hover:text-white active:opacity-80";
export const label = "mb-1 block text-xs font-semibold uppercase tracking-wide text-sub";

function readStore<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** useState that persists to localStorage (per-device, best effort). */
export function useStored<T>(key: string, initial: T) {
  const [v, setV] = useState<T>(initial);
  const ready = useRef(false);
  useEffect(() => {
    setV(readStore(`nexus.pro.${key}`, initial));
    ready.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => {
    if (!ready.current) return;
    try {
      localStorage.setItem(`nexus.pro.${key}`, JSON.stringify(v));
    } catch {
      /* storage unavailable */
    }
  }, [key, v]);
  return [v, setV] as const;
}

export function uid() {
  return Math.random().toString(36).slice(2, 9);
}

export function CopyBtn({ text, className, children }: { text: string; className?: string; children?: ReactNode }) {
  const [done, setDone] = useState(false);
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        /* ignore */
      }
      ta.remove();
    }
    setDone(true);
    setTimeout(() => setDone(false), 1400);
  }, [text]);
  return (
    <button onClick={copy} className={cn(btnGhost, "inline-flex items-center gap-1.5", className)}>
      {done ? <Check size={14} /> : <Copy size={14} />}
      {done ? "Copied" : children ?? "Copy"}
    </button>
  );
}

export function Field({ title, children }: { title: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className={label}>{title}</span>
      {children}
    </label>
  );
}

export function Num({ value, onChange, ...rest }: { value: number; onChange: (n: number) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return <input {...rest} type="number" inputMode="decimal" value={Number.isFinite(value) ? value : ""} onChange={(e) => onChange(e.target.value === "" ? NaN : Number(e.target.value))} className={cn(field, rest.className)} />;
}

export function Stat({ k, v, tone }: { k: string; v: ReactNode; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-xl bg-black/25 px-3 py-2.5">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-sub">{k}</div>
      <div className={cn("mt-0.5 text-lg font-bold tabular-nums", tone === "good" && "text-emerald-400", tone === "bad" && "text-red-400")}>{v}</div>
    </div>
  );
}

export function Pills<T extends string>({ items, value, onChange }: { items: readonly T[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((k) => (
        <button key={k} onClick={() => onChange(k)} className={cn("rounded-full px-3.5 py-2 text-sm font-semibold", value === k ? "bg-accent text-white" : "bg-side text-sub")}>
          {k}
        </button>
      ))}
    </div>
  );
}

export function Hint({ children }: { children: ReactNode }) {
  return <p className="text-xs leading-relaxed text-sub">{children}</p>;
}

export const NOTE_PCS = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];

/** Download a text file client-side. */
export function downloadText(name: string, text: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
