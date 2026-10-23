"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Clock, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/lib/useMobile";
import { haptic } from "@/lib/haptics";
import type { EmojiGroup, EmojiItem } from "@/lib/emojiData";
import Sheet from "./Sheet";

const TONES = ["", "\u{1F3FB}", "\u{1F3FC}", "\u{1F3FD}", "\u{1F3FE}", "\u{1F3FF}"];
const TONE_SWATCH = ["#FFCC4D", "#F7DECE", "#F3D2A2", "#D5AB88", "#AF7E57", "#7C533E"];
const RECENT_KEY = "nexus:emoji-recent";
const TONE_KEY = "nexus:emoji-tone";

let cached: EmojiGroup[] | null = null;
function useEmojiData() {
  const [groups, setGroups] = useState<EmojiGroup[] | null>(cached);
  useEffect(() => {
    if (cached) return;
    void import("@/lib/emojiData").then((m) => {
      cached = m.EMOJI_GROUPS;
      setGroups(cached);
    });
  }, []);
  return groups;
}

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* storage unavailable */
  }
}

/** Apply a skin tone to a tone-capable emoji (modifier goes right after the first code point). */
export function withTone(e: string, tone: number) {
  if (!tone) return e;
  const chars = Array.from(e.replace(/️/g, ""));
  return chars[0] + TONES[tone] + chars.slice(1).join("");
}

export default function EmojiPicker({
  onPick,
  onClose,
  className,
  keepOpen,
}: {
  onPick: (emoji: string) => void;
  onClose: () => void;
  className?: string;
  /** don't close after picking (composer) */
  keepOpen?: boolean;
}) {
  const mobile = useIsMobile();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (mobile) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const t = setTimeout(() => window.addEventListener("mousedown", close), 0);
    window.addEventListener("keydown", esc);
    return () => {
      clearTimeout(t);
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [onClose, mobile]);

  const pick = (e: string) => {
    haptic.select();
    onPick(e);
    if (!keepOpen && mobile) onClose();
  };

  if (mobile) {
    return (
      <Sheet open onClose={onClose} className="bg-menu">
        <Body onPick={pick} tall />
      </Sheet>
    );
  }
  return (
    <div ref={ref} className={cn("z-40 w-[352px] max-w-[calc(100vw-16px)] animate-pop overflow-hidden rounded-xl border border-black/30 bg-panel shadow-2xl", className)}>
      <Body onPick={pick} />
    </div>
  );
}

function Body({ onPick, tall }: { onPick: (e: string) => void; tall?: boolean }) {
  const groups = useEmojiData();
  const [q, setQ] = useState("");
  const [tone, setTone] = useState(0);
  const [toneOpen, setToneOpen] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [active, setActive] = useState("recent");
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setRecent(load<string[]>(RECENT_KEY, []));
    setTone(load<number>(TONE_KEY, 0));
  }, []);

  const choose = (e: string) => {
    const next = [e, ...recent.filter((x) => x !== e)].slice(0, 32);
    setRecent(next);
    save(RECENT_KEY, next);
    onPick(e);
  };

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s || !groups) return null;
    const words = s.split(/\s+/);
    const out: EmojiItem[] = [];
    for (const g of groups) for (const it of g.items) if (words.every((w) => it[1].includes(w))) out.push(it);
    return out.slice(0, 240);
  }, [q, groups]);

  const jump = (id: string) => {
    setActive(id);
    const el = scroller.current?.querySelector<HTMLElement>(`[data-group="${id}"]`);
    if (el && scroller.current) scroller.current.scrollTo({ top: el.offsetTop - 4, behavior: "smooth" });
  };

  const onScroll = () => {
    const box = scroller.current;
    if (!box) return;
    const heads = Array.from(box.querySelectorAll<HTMLElement>("[data-group]"));
    let cur = heads[0]?.dataset.group ?? "recent";
    for (const h of heads) if (h.offsetTop - box.scrollTop <= 24) cur = h.dataset.group!;
    setActive(cur);
  };

  const cell = (it: EmojiItem, key: string) => {
    const e = it[2] ? withTone(it[0], tone) : it[0];
    return (
      <button
        key={key}
        title={`:${it[1].replace(/\s+/g, "_")}:`}
        onClick={() => choose(e)}
        className="grid aspect-square place-items-center rounded-lg text-[26px] leading-none transition hover:scale-110 hover:bg-hover active:scale-95 md:text-[22px]"
      >
        {e}
      </button>
    );
  };

  const cols = tall ? "grid-cols-8" : "grid-cols-9";

  return (
    <div className="flex flex-col">
      {/* search + tone */}
      <div className="flex items-center gap-2 p-2">
        <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg bg-black/25 px-2.5">
          <Search className="size-4 shrink-0 text-sub" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search emoji"
            className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-sub"
          />
          {q && (
            <button onClick={() => setQ("")} aria-label="Clear">
              <X className="size-4 text-sub" />
            </button>
          )}
        </label>
        <div className="relative">
          <button onClick={() => setToneOpen((v) => !v)} className="grid size-9 place-items-center rounded-lg bg-black/25 text-xl" title="Skin tone">
            {withTone("✋", tone)}
          </button>
          {toneOpen && (
            <div className="absolute top-10 right-0 z-10 flex gap-1 rounded-xl bg-menu p-1.5 shadow-xl ring-1 ring-white/10">
              {TONE_SWATCH.map((c, i) => (
                <button
                  key={c}
                  onClick={() => {
                    setTone(i);
                    save(TONE_KEY, i);
                    setToneOpen(false);
                  }}
                  className={cn("size-7 rounded-full ring-2", tone === i ? "ring-white" : "ring-transparent")}
                  style={{ background: c }}
                  aria-label={`Tone ${i}`}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* category tabs */}
      {!results && (
        <div className="no-scrollbar flex gap-0.5 overflow-x-auto border-b border-white/5 px-2 pb-1.5">
          <Tab on={active === "recent"} onClick={() => jump("recent")}>
            <Clock className="size-[18px]" />
          </Tab>
          {(groups ?? []).map((g) => (
            <Tab key={g.id} on={active === g.id} onClick={() => jump(g.id)} title={g.label}>
              <span className="text-lg leading-none">{g.icon}</span>
            </Tab>
          ))}
        </div>
      )}

      <div ref={scroller} onScroll={onScroll} className={cn("relative overflow-y-auto overscroll-contain px-2 pb-2", tall ? "h-[46dvh]" : "h-[300px]")}>
        {!groups ? (
          <div className="grid h-full place-items-center text-sm text-sub">Loading emoji…</div>
        ) : results ? (
          results.length ? (
            <div className={cn("grid gap-0.5 pt-1", cols)}>{results.map((it, i) => cell(it, `r${i}`))}</div>
          ) : (
            <div className="grid h-full place-items-center text-sm text-sub">No emoji found</div>
          )
        ) : (
          <>
            <Section id="recent" label="Recently used">
              {recent.length ? (
                <div className={cn("grid gap-0.5", cols)}>
                  {recent.map((e) => (
                    <button key={e} onClick={() => choose(e)} className="grid aspect-square place-items-center rounded-lg text-[26px] leading-none hover:bg-hover active:scale-95 md:text-[22px]">
                      {e}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="px-1 pb-1 text-xs text-sub">Emoji you use show up here.</div>
              )}
            </Section>
            {groups.map((g) => (
              <Section key={g.id} id={g.id} label={g.label}>
                <div className={cn("grid gap-0.5", cols)}>{g.items.map((it, i) => cell(it, `${g.id}${i}`))}</div>
              </Section>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function Tab({ on, onClick, children, title }: { on: boolean; onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button onClick={onClick} title={title} className={cn("grid size-9 shrink-0 place-items-center rounded-lg transition", on ? "bg-white/10 text-txt" : "text-sub opacity-70 hover:opacity-100")}>
      {children}
    </button>
  );
}

function Section({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div data-group={id} className="pt-2">
      <div className="sticky top-0 z-[1] -mx-2 bg-inherit px-3 py-1 text-[11px] font-bold tracking-wide text-sub uppercase backdrop-blur">{label}</div>
      {children}
    </div>
  );
}
