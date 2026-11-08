"use client";

import { useRef, useState } from "react";
import { ExternalLink, ImagePlus, Plus, Trash2 } from "lucide-react";
import { useApp, toast } from "@/store/app";
import { updateMyProfile, uploadBanner } from "@/lib/data";
import { PLATFORMS, linkLabel, normalizeLink, platformById } from "@/lib/links";
import type { ProfileLink } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Same links as the Nexus profile (profiles.links) — edit once, shows everywhere. */
const QUICK = ["instagram", "tiktok", "snapchat", "x", "youtube", "spotify", "soundcloud", "telegram", "discord", "twitch", "github"];

function Chip({ l }: { l: ProfileLink }) {
  const p = platformById(l.type);
  return (
    <a href={l.url} target="_blank" rel="noreferrer noopener" className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-white/5 py-1 pr-2.5 pl-1 text-[11px] font-semibold ring-1 ring-white/10 transition hover:bg-white/10">
      <span className="grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-black text-white" style={{ background: p.color }}>
        {p.glyph}
      </span>
      <span className="truncate">{linkLabel(l)}</span>
      <ExternalLink className="size-2.5 shrink-0 opacity-50" />
    </a>
  );
}

/** Social links on a Wump profile. */
export function WumpSocialLinks({ userId, className }: { userId: string; className?: string }) {
  const links = useApp((s) => s.profiles[userId]?.links ?? []);
  const shown = links.filter((l) => l?.url && /^https:\/\//.test(l.url)).slice(0, 12);
  if (!shown.length) return null;
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {shown.map((l, i) => (
        <Chip key={`${l.url}${i}`} l={l} />
      ))}
    </div>
  );
}

/** Editor: add Instagram username / TikTok / … — saved to your Nexus profile links. */
export function WumpSocialEditor() {
  const me = useApp((s) => (s.userId ? s.profiles[s.userId] : null));
  const [plat, setPlat] = useState("instagram");
  const [val, setVal] = useState("");
  const [busy, setBusy] = useState(false);
  const bannerRef = useRef<HTMLInputElement>(null);
  if (!me) return null;
  const links = me.links ?? [];
  const p = platformById(plat);

  async function add() {
    const l = normalizeLink(val, plat);
    if (!l) return toast(p.fromHandle ? `Type your ${p.label} username or paste a link` : `Paste your ${p.label} link`, "error");
    if (links.length >= 20) return toast("Up to 20 links", "error");
    if (links.some((x) => x.url.toLowerCase() === l.url.toLowerCase())) return toast("Already added", "info");
    setBusy(true);
    await updateMyProfile({ links: [...links, l] });
    setBusy(false);
    setVal("");
  }

  return (
    <section className="space-y-3 rounded-2xl bg-side p-4 ring-1 ring-white/5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-xs font-bold tracking-wide text-sub uppercase">Social media</div>
          <p className="text-[11px] text-sub">Shared with your Nexus profile — edit once, shows in both.</p>
        </div>
        <button type="button" onClick={() => bannerRef.current?.click()} className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold">
          <ImagePlus className="size-3" /> Banner
        </button>
        <input
          ref={bannerRef}
          type="file"
          accept="image/*,video/mp4,video/webm"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void uploadBanner(f);
          }}
        />
      </div>

      <div className="flex gap-1 overflow-x-auto pb-0.5 [scrollbar-width:none]">
        {QUICK.map((id) => {
          const q = platformById(id);
          return (
            <button key={id} type="button" onClick={() => setPlat(id)} className={cn("flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold", plat === id ? "bg-accent text-white" : "bg-white/5 text-sub")}>
              <span className="grid size-4 place-items-center rounded-full text-[9px] text-white" style={{ background: q.color }}>
                {q.glyph}
              </span>
              {q.label}
            </button>
          );
        })}
        <select value={QUICK.includes(plat) ? "" : plat} onChange={(e) => e.target.value && setPlat(e.target.value)} className="shrink-0 rounded-full bg-white/5 px-2 py-1 text-[11px] text-sub outline-none">
          <option value="">More…</option>
          {PLATFORMS.filter((x) => !QUICK.includes(x.id)).map((x) => (
            <option key={x.id} value={x.id} className="bg-side">
              {x.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex gap-2">
        <input
          value={val}
          onChange={(e) => setVal(e.target.value.slice(0, 300))}
          onKeyDown={(e) => e.key === "Enter" && void add()}
          placeholder={p.fromHandle ? `${p.label} username (e.g. @yourname)` : `${p.label} link`}
          autoCapitalize="none"
          autoCorrect="off"
          className="min-w-0 flex-1 rounded-xl bg-black/30 px-3 py-2.5 text-sm outline-none ring-1 ring-transparent focus:ring-accent"
        />
        <button type="button" disabled={!val.trim() || busy} onClick={() => void add()} className="grid size-11 place-items-center rounded-xl bg-accent text-white disabled:opacity-40" aria-label="Add link">
          <Plus className="size-4" />
        </button>
      </div>
      {links.length > 0 && (
        <ul className="space-y-1">
          {links.map((l, i) => (
            <li key={`${l.url}${i}`} className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <Chip l={l} />
              </div>
              <button type="button" onClick={() => void updateMyProfile({ links: links.filter((_, j) => j !== i) })} className="grid size-8 place-items-center rounded-full text-sub hover:bg-white/10 hover:text-dnd" aria-label="Remove link">
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
