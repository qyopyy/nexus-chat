"use client";

import { cn } from "@/lib/utils";

export const H = ({ children }: { children: React.ReactNode }) => <h2 className="mb-5 text-xl font-bold">{children}</h2>;
export const Label = ({ children }: { children: React.ReactNode }) => <div className="mb-2 text-xs font-bold tracking-wide text-sub uppercase">{children}</div>;

export function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full cursor-pointer rounded-md bg-rail px-3 py-2.5 outline-none focus:ring-2 focus:ring-accent/60">
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 border-b border-line/60 py-3">
      <span>
        <span className="block font-medium">{label}</span>
        {hint && <span className="block text-sm text-sub">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn("relative h-6 w-10 shrink-0 rounded-full transition", checked ? "bg-ok" : "bg-faint")}
      >
        <span className={cn("absolute top-0.5 size-5 rounded-full bg-white transition-all", checked ? "left-[18px]" : "left-0.5")} />
      </button>
    </label>
  );
}

export function Slider({ value, max, onChange, format }: { value: number; max: number; onChange: (v: number) => void; format: (v: number) => string }) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={0}
        max={max}
        step={max / 200}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="vol flex-1"
        style={{ ["--fill" as string]: `${(value / max) * 100}%` }}
      />
      <span className="w-12 text-right text-sm text-sub tabular-nums">{format(value)}</span>
    </div>
  );
}
