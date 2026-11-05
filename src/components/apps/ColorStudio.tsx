"use client";

import { useMemo, useState } from "react";
import { Check, Copy, Pipette } from "lucide-react";
import AppFrame from "./AppFrame";

function clamp(n: number, min = 0, max = 255) {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((n) => clamp(n).toString(16).padStart(2, "0")).join("")}`;
}

function rgbToHsl(r: number, g: number, b: number) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: Math.round(l * 100) };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return { h: Math.round(h * 60), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function luminance(r: number, g: number, b: number) {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }) {
  const la = luminance(a.r, a.g, a.b);
  const lb = luminance(b.r, b.g, b.b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

export default function ColorStudio({ onBack, mobile }: { onBack: () => void; mobile?: boolean }) {
  const [hex, setHex] = useState("#00a8fc");
  const [copied, setCopied] = useState<string | null>(null);
  const rgb = hexToRgb(hex) || { r: 0, g: 168, b: 252 };
  const hsl = useMemo(() => rgbToHsl(rgb.r, rgb.g, rgb.b), [rgb.r, rgb.g, rgb.b]);
  const vsWhite = contrast(rgb, { r: 255, g: 255, b: 255 });
  const vsBlack = contrast(rgb, { r: 0, g: 0, b: 0 });

  async function copy(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      window.setTimeout(() => setCopied(null), 1200);
    } catch {
      /* ignore */
    }
  }

  const rows = [
    { label: "HEX", value: rgbToHex(rgb.r, rgb.g, rgb.b).toUpperCase() },
    { label: "RGB", value: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})` },
    { label: "HSL", value: `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)` },
  ];

  return (
    <AppFrame title="Color studio" Icon={Pipette} iconClass="text-[#faa61a]" mobile={mobile} onBack={onBack}>
      <p className="text-sm text-sub">Pick a brand color, copy HEX / RGB / HSL, and check contrast against white and black.</p>
      <div className="overflow-hidden rounded-2xl bg-side">
        <div className="h-40 w-full" style={{ background: rgbToHex(rgb.r, rgb.g, rgb.b) }} />
        <div className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <input type="color" value={rgbToHex(rgb.r, rgb.g, rgb.b)} onChange={(e) => setHex(e.target.value)} className="h-12 w-16 rounded-xl border border-white/10 bg-input px-1" aria-label="Color picker" />
            <input
              value={hex}
              onChange={(e) => setHex(e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`)}
              className="min-w-0 flex-1 rounded-xl border border-white/10 bg-input px-3 py-2.5 font-mono outline-none focus:border-accent"
              aria-label="Hex color"
            />
          </div>
          <div className="grid gap-2">
            {rows.map((row) => (
              <button key={row.label} onClick={() => void copy(row.label, row.value)} className="flex items-center gap-3 rounded-xl bg-black/25 px-3 py-2.5 text-left hover:bg-black/35">
                <span className="w-10 text-xs font-semibold text-sub">{row.label}</span>
                <span className="min-w-0 flex-1 truncate font-mono text-sm">{row.value}</span>
                {copied === row.label ? <Check className="size-4 text-ok" /> : <Copy className="size-4 text-sub" />}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-xl bg-white px-3 py-3 text-black">
              <div className="text-xs font-semibold opacity-70">On white</div>
              <div className="mt-1 font-bold">{vsWhite.toFixed(2)}:1</div>
              <div className="text-xs">{vsWhite >= 4.5 ? "AA body ✓" : vsWhite >= 3 ? "AA large" : "Fail"}</div>
            </div>
            <div className="rounded-xl bg-black px-3 py-3 text-white">
              <div className="text-xs font-semibold opacity-70">On black</div>
              <div className="mt-1 font-bold">{vsBlack.toFixed(2)}:1</div>
              <div className="text-xs">{vsBlack >= 4.5 ? "AA body ✓" : vsBlack >= 3 ? "AA large" : "Fail"}</div>
            </div>
          </div>
        </div>
      </div>
    </AppFrame>
  );
}
