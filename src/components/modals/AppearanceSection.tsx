"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ImagePlus, RotateCcw, Trash2 } from "lucide-react";
import { useApp, toast } from "@/store/app";
import { useAppearance, setAppearance, resetAppearance } from "@/store/appearance";
import { FONTS, THEMES } from "@/lib/theme";
import { supabase, errorText } from "@/lib/supabase";
import { cn } from "@/lib/utils";

const ACCENTS = ["#2aabee", "#5865f2", "#eb459e", "#ed4245", "#faa61a", "#3ba55d", "#1abc9c", "#9b59b6", "#ff8a5b", "#ffffff"];

const H = ({ children }: { children: React.ReactNode }) => <h2 className="mb-5 text-xl font-bold">{children}</h2>;
const Label = ({ children, hint }: { children: React.ReactNode; hint?: string }) => (
  <div className="mb-2">
    <div className="text-xs font-bold tracking-wide text-sub uppercase">{children}</div>
    {hint && <div className="mt-0.5 text-xs text-faint">{hint}</div>}
  </div>
);

function Range({ value, min, max, step, onChange, fmt }: { value: number; min: number; max: number; step: number; onChange: (v: number) => void; fmt: (v: number) => string }) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="vol flex-1"
        style={{ ["--fill" as string]: `${((value - min) / (max - min)) * 100}%` }}
      />
      <span className="w-14 text-right text-sm text-sub tabular-nums">{fmt(value)}</span>
    </div>
  );
}

function Switch({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 border-b border-line/60 py-3">
      <span>
        <span className="block font-medium">{label}</span>
        {hint && <span className="block text-sm text-sub">{hint}</span>}
      </span>
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={cn("relative h-6 w-10 shrink-0 rounded-full transition", checked ? "bg-ok" : "bg-faint")}>
        <span className={cn("absolute top-0.5 size-5 rounded-full bg-white transition-all", checked ? "left-[18px]" : "left-0.5")} />
      </button>
    </label>
  );
}

export default function AppearanceSection() {
  const a = useAppearance((s) => s);
  const me = useApp((s) => s.userId);
  const [bgUrl, setBgUrl] = useState(a.bgImage ?? "");
  const [css, setCss] = useState(a.customCss);
  const [uploading, setUploading] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  // preview every font in its own face
  useEffect(() => {
    for (const [k, f] of Object.entries(FONTS)) {
      if (!f.url || document.getElementById(`font-preview-${k}`)) continue;
      const l = document.createElement("link");
      l.id = `font-preview-${k}`;
      l.rel = "stylesheet";
      l.href = f.url;
      document.head.appendChild(l);
    }
  }, []);

  // debounce QuickCSS
  useEffect(() => {
    const t = setTimeout(() => css !== useAppearance.getState().customCss && setAppearance({ customCss: css }), 400);
    return () => clearTimeout(t);
  }, [css]);

  async function uploadBg(f: File) {
    if (!me) return;
    if (f.size > 10 * 1024 * 1024) return toast("Max 10 MB", "error");
    setUploading(true);
    const path = `${me}/background-${Date.now()}.${f.name.split(".").pop() || "jpg"}`;
    const { error } = await supabase.storage.from("avatars").upload(path, f, { contentType: f.type, upsert: true });
    setUploading(false);
    if (error) return toast(errorText(error), "error");
    const url = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
    setBgUrl(url);
    setAppearance({ bgImage: url });
  }

  return (
    <>
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-xl font-bold">Appearance</h2>
        <button onClick={() => (resetAppearance(), setBgUrl(""), setCss(""))} className="flex items-center gap-1.5 text-sm text-sub hover:text-txt">
          <RotateCcw className="size-4" /> Reset all
        </button>
      </div>

      {/* live preview */}
      <div className="chat-wallpaper mb-8 overflow-hidden rounded-xl border border-line p-4">
        <div className="flex items-end gap-2">
          <div className="size-8 rounded-full bg-accent" />
          <div className="bubble-tail relative rounded-2xl rounded-bl-md bg-bubble px-3 py-1.5">
            <div className="text-sm font-semibold text-accent">Anna</div>
            <span className="msg-text">yo, the new theme looks clean 🔥</span>
          </div>
        </div>
        <div className="mt-2 flex justify-end">
          <div className="bubble-tail-me relative rounded-2xl rounded-br-md bg-bubble-me px-3 py-1.5 text-white">
            <span className="msg-text">thanks! made it myself ✨</span>
          </div>
        </div>
      </div>

      <Label>Theme</Label>
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {Object.entries(THEMES).map(([id, t]) => (
          <button
            key={id}
            onClick={() => setAppearance({ theme: id })}
            className={cn("group overflow-hidden rounded-xl border-2 text-left transition", a.theme === id ? "border-accent" : "border-transparent hover:border-line")}
          >
            <div className="flex h-16" style={{ background: t.colors.chat }}>
              <div className="w-4" style={{ background: t.colors.rail }} />
              <div className="w-10" style={{ background: t.colors.side }} />
              <div className="flex flex-1 flex-col justify-center gap-1 px-2">
                <div className="h-2.5 w-3/4 rounded-full" style={{ background: t.colors.bubble }} />
                <div className="ml-auto h-2.5 w-1/2 rounded-full" style={{ background: t.colors.bubbleMe }} />
                <div className="h-1.5 w-8 rounded-full" style={{ background: t.colors.accent }} />
              </div>
            </div>
            <div className="flex items-center justify-between bg-side px-2.5 py-1.5 text-sm">
              {t.name}
              {a.theme === id && <Check className="size-4 text-accent" />}
            </div>
          </button>
        ))}
      </div>

      <Label hint="Overrides the theme's accent (buttons, links, highlights).">Accent color</Label>
      <div className="mb-8 flex flex-wrap items-center gap-2">
        {ACCENTS.map((c) => (
          <button
            key={c}
            onClick={() => setAppearance({ accent: c })}
            className={cn("size-8 rounded-full transition hover:scale-110", a.accent === c && "ring-2 ring-white ring-offset-2 ring-offset-chat")}
            style={{ background: c }}
            aria-label={c}
          />
        ))}
        <label className="relative size-8 cursor-pointer overflow-hidden rounded-full border-2 border-dashed border-sub" title="Custom color">
          <input type="color" value={a.accent ?? "#2aabee"} onChange={(e) => setAppearance({ accent: e.target.value })} className="absolute inset-0 size-full cursor-pointer opacity-0" />
          <span className="grid size-full place-items-center text-xs text-sub">+</span>
        </label>
        {a.accent && (
          <button onClick={() => setAppearance({ accent: null })} className="ml-1 text-sm text-sub hover:text-txt">
            Use theme default
          </button>
        )}
      </div>

      <Label hint="Any image URL or upload — panels turn see-through like a modded client.">Background image</Label>
      <div className="mb-3 flex gap-2">
        <input
          value={bgUrl}
          onChange={(e) => setBgUrl(e.target.value)}
          onBlur={() => setAppearance({ bgImage: bgUrl.trim() || null })}
          onKeyDown={(e) => e.key === "Enter" && setAppearance({ bgImage: bgUrl.trim() || null })}
          placeholder="https://…/wallpaper.jpg"
          className="min-w-0 flex-1 rounded-md bg-rail px-3 py-2 outline-none focus:ring-2 focus:ring-accent/60"
        />
        <input ref={file} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && void uploadBg(e.target.files[0])} />
        <button onClick={() => file.current?.click()} disabled={uploading} className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white hover:bg-accent-2 disabled:opacity-50">
          <ImagePlus className="size-4" /> {uploading ? "Uploading…" : "Upload"}
        </button>
        {a.bgImage && (
          <button onClick={() => (setBgUrl(""), setAppearance({ bgImage: null }))} className="rounded-md bg-hover px-3 text-sub hover:text-dnd" title="Remove background">
            <Trash2 className="size-4" />
          </button>
        )}
      </div>
      {a.bgImage && (
        <div className="mb-8 grid gap-4 rounded-xl bg-side p-4 sm:grid-cols-3">
          <div>
            <Label>Blur</Label>
            <Range value={a.bgBlur} min={0} max={24} step={1} onChange={(v) => setAppearance({ bgBlur: v })} fmt={(v) => `${v}px`} />
          </div>
          <div>
            <Label>Brightness</Label>
            <Range value={a.bgDim} min={0.2} max={1} step={0.05} onChange={(v) => setAppearance({ bgDim: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
          </div>
          <div>
            <Label>Panel opacity</Label>
            <Range value={a.panelOpacity} min={0.3} max={1} step={0.02} onChange={(v) => setAppearance({ panelOpacity: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
          </div>
        </div>
      )}
      {!a.bgImage && <div className="mb-8" />}

      <H>Text</H>
      <Label>Font</Label>
      <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {Object.entries(FONTS).map(([id, f]) => (
          <button
            key={id}
            onClick={() => setAppearance({ font: id })}
            className={cn("rounded-lg border-2 px-3 py-2.5 text-left transition", a.font === id ? "border-accent bg-accent/10" : "border-line hover:border-sub")}
            style={{ fontFamily: f.stack }}
          >
            <div className="truncate text-[15px]">{f.name}</div>
            <div className="truncate text-xs text-sub">The quick brown fox 0123</div>
          </button>
        ))}
      </div>
      <div className="mb-6 grid gap-6 sm:grid-cols-2">
        <div>
          <Label hint="Scales the whole interface.">UI zoom</Label>
          <Range value={a.uiScale} min={13} max={19} step={1} onChange={(v) => setAppearance({ uiScale: v })} fmt={(v) => `${Math.round((v / 16) * 100)}%`} />
        </div>
        <div>
          <Label hint="Chat message text only.">Message text size</Label>
          <Range value={a.messageSize} min={12} max={22} step={1} onChange={(v) => setAppearance({ messageSize: v })} fmt={(v) => `${v}px`} />
        </div>
      </div>
      <Switch label="Compact mode" hint="Tighter spacing between message groups." checked={a.compact} onChange={(v) => setAppearance({ compact: v })} />
      <Switch label="Reduce motion" hint="Stops animated name colors, avatar decorations and transitions." checked={a.reduceMotion} onChange={(v) => setAppearance({ reduceMotion: v })} />

      <div className="mt-8">
        <Label hint="Like Vencord QuickCSS. Paste a theme or @import a BetterDiscord-style theme URL. Applies to this device only.">Custom CSS</Label>
        <textarea
          value={css}
          onChange={(e) => setCss(e.target.value)}
          spellCheck={false}
          rows={8}
          placeholder={`@import url("https://example.com/my-theme.css"); /* imports must come first */\n\n:root { --color-accent: #ff73fa !important; }\n.bg-side { backdrop-filter: blur(12px); }`}
          className="w-full rounded-lg bg-rail p-3 font-mono text-sm outline-none focus:ring-2 focus:ring-accent/60"
        />
      </div>
    </>
  );
}
