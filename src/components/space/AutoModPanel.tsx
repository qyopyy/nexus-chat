"use client";

import { useCallback, useEffect, useState } from "react";
import { ShieldAlert, Trash2, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "@/store/app";
import { cn } from "@/lib/utils";
import Avatar from "@/components/ui/Avatar";
import NameTag from "@/components/ui/NameTag";

type Cfg = {
  enabled: boolean;
  mode: "block" | "flag";
  words: string[];
  block_links: boolean;
  allow_domains: string[];
  block_invites: boolean;
  max_mentions: number;
  max_caps_pct: number;
};
type Hit = { id: number; user_id: string | null; rule: string; excerpt: string | null; created_at: string };

const DEF: Cfg = { enabled: true, mode: "block", words: [], block_links: false, allow_domains: ["youtube.com", "spotify.com", "nexusproject.cc"], block_invites: true, max_mentions: 5, max_caps_pct: 0 };

/** Server AutoMod — rules are enforced by the database, so a modified app can't skip them. Staff are exempt. */
export default function AutoModPanel({ spaceId }: { spaceId: string }) {
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [exists, setExists] = useState(false);
  const [saving, setSaving] = useState(false);
  const [word, setWord] = useState("");
  const [domain, setDomain] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);

  const load = useCallback(async () => {
    const [{ data }, h] = await Promise.all([
      supabase.from("space_automod").select("enabled,mode,words,block_links,allow_domains,block_invites,max_mentions,max_caps_pct").eq("space_id", spaceId).maybeSingle(),
      supabase.from("automod_hits").select("id,user_id,rule,excerpt,created_at").eq("space_id", spaceId).order("created_at", { ascending: false }).limit(30),
    ]);
    setExists(!!data);
    setCfg({ ...DEF, ...((data as Partial<Cfg>) ?? {}), ...(data ? {} : { enabled: false }) });
    setHits((h.data as Hit[]) ?? []);
  }, [spaceId]);
  useEffect(() => void load(), [load]);

  const save = async (next: Cfg) => {
    setCfg(next);
    setSaving(true);
    const row = { space_id: spaceId, ...next, updated_at: new Date().toISOString() };
    const { error } = exists ? await supabase.from("space_automod").update(row).eq("space_id", spaceId) : await supabase.from("space_automod").insert(row);
    setSaving(false);
    if (error) return toast(error.message, "error");
    setExists(true);
  };

  if (!cfg) return <div className="h-40 animate-pulse rounded-2xl bg-side" />;
  const set = (p: Partial<Cfg>) => void save({ ...cfg, ...p });
  const Toggle = ({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) => (
    <button onClick={() => onChange(!on)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-hover">
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{label}</span>
        {hint && <span className="block text-xs text-sub">{hint}</span>}
      </span>
      <span className={cn("relative h-6 w-11 shrink-0 rounded-full transition", on ? "bg-ok" : "bg-rail")}>
        <span className={cn("absolute top-0.5 size-5 rounded-full bg-white transition-all", on ? "left-[22px]" : "left-0.5")} />
      </span>
    </button>
  );
  const addWord = () => {
    const ws = word
      .split(/[,\n]/)
      .map((w) => w.trim().toLowerCase())
      .filter((w) => w && !cfg.words.includes(w))
      .slice(0, 200 - cfg.words.length);
    if (ws.length) set({ words: [...cfg.words, ...ws] });
    setWord("");
  };
  const addDomain = () => {
    const d = domain
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\/.*$/, "");
    if (d && /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d) && !cfg.allow_domains.includes(d)) set({ allow_domains: [...cfg.allow_domains, d] });
    setDomain("");
  };

  return (
    <div className="space-y-4">
      <div className={cn("flex items-center gap-3 rounded-2xl p-4", cfg.enabled ? "bg-ok/15" : "bg-side")}>
        <ShieldAlert className={cn("size-8 shrink-0", cfg.enabled ? "text-ok" : "text-sub")} />
        <div className="min-w-0 flex-1">
          <div className="font-black">AutoMod {cfg.enabled ? "is on" : "is off"}</div>
          <div className="text-xs text-sub">Checks every message before it&apos;s posted. Owner and admins are never blocked.{saving && " Saving…"}</div>
        </div>
        <button onClick={() => set({ enabled: !cfg.enabled })} className={cn("rounded-full px-4 py-2 text-sm font-bold", cfg.enabled ? "bg-black/25" : "bg-ok text-white")}>
          {cfg.enabled ? "Turn off" : "Turn on"}
        </button>
      </div>

      <div className={cn("space-y-4", !cfg.enabled && "pointer-events-none opacity-50")}>
        <div className="flex gap-2 rounded-xl bg-side p-1">
          {(["block", "flag"] as const).map((m) => (
            <button key={m} onClick={() => set({ mode: m })} className={cn("flex-1 rounded-lg py-2 text-sm font-bold", cfg.mode === m ? "bg-accent text-white" : "text-sub")}>
              {m === "block" ? "Block the message" : "Allow, but log for staff"}
            </button>
          ))}
        </div>

        <div className="rounded-2xl bg-side p-3">
          <div className="mb-1 font-semibold">Blocked words</div>
          <div className="mb-2 text-xs text-sub">Whole words, any capitalisation. Separate several with commas.</div>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {cfg.words.length === 0 && <span className="text-sm text-faint">No words yet</span>}
            {cfg.words.map((w) => (
              <span key={w} className="flex items-center gap-1 rounded-full bg-dnd/15 py-0.5 pr-1 pl-2.5 text-sm text-dnd">
                {w}
                <button onClick={() => set({ words: cfg.words.filter((x) => x !== w) })} className="grid size-5 place-items-center rounded-full hover:bg-dnd/25" aria-label={`Remove ${w}`}>
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              addWord();
            }}
            className="flex gap-2"
          >
            <input value={word} onChange={(e) => setWord(e.target.value)} placeholder="add a word…" maxLength={400} className="min-w-0 flex-1 rounded-lg bg-rail px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/60" />
            <button className="rounded-lg bg-accent px-4 text-sm font-bold text-white">Add</button>
          </form>
        </div>

        <div className="rounded-2xl bg-side p-1">
          <Toggle on={cfg.block_invites} onChange={(v) => set({ block_invites: v })} label="Block invite links" hint="Other servers' invites (Nexus, Discord, Telegram, WhatsApp groups)" />
          <Toggle on={cfg.block_links} onChange={(v) => set({ block_links: v })} label="Block links" hint="Except the sites you allow below" />
          {cfg.block_links && (
            <div className="px-3 pb-3">
              <div className="mb-2 flex flex-wrap gap-1.5">
                {cfg.allow_domains.map((d) => (
                  <span key={d} className="flex items-center gap-1 rounded-full bg-ok/15 py-0.5 pr-1 pl-2.5 text-sm text-ok">
                    {d}
                    <button onClick={() => set({ allow_domains: cfg.allow_domains.filter((x) => x !== d) })} className="grid size-5 place-items-center rounded-full hover:bg-ok/25" aria-label={`Remove ${d}`}>
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  addDomain();
                }}
                className="flex gap-2"
              >
                <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="allow a site, e.g. soundcloud.com" className="min-w-0 flex-1 rounded-lg bg-rail px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/60" />
                <button className="rounded-lg bg-hover px-4 text-sm font-bold">Allow</button>
              </form>
            </div>
          )}
          <div className="flex items-center gap-3 px-3 py-2.5">
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">Mention spam</span>
              <span className="block text-xs text-sub">Max @mentions in one message (0 = off)</span>
            </span>
            <input type="number" min={0} max={50} value={cfg.max_mentions} onChange={(e) => set({ max_mentions: Math.max(0, Math.min(50, Number(e.target.value) || 0)) })} className="w-16 rounded-lg bg-rail px-2 py-1.5 text-center font-bold outline-none" />
          </div>
          <div className="flex items-center gap-3 px-3 py-2.5">
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">ALL CAPS filter</span>
              <span className="block text-xs text-sub">Block messages that are mostly capitals (0 = off)</span>
            </span>
            <select value={cfg.max_caps_pct} onChange={(e) => set({ max_caps_pct: Number(e.target.value) })} className="rounded-lg bg-rail px-2 py-1.5 text-sm font-bold">
              {[0, 60, 70, 80, 90].map((v) => (
                <option key={v} value={v}>
                  {v ? `> ${v}%` : "Off"}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {cfg.mode === "flag" && (
        <div className="rounded-2xl bg-side p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-semibold">Flagged messages</span>
            {hits.length > 0 && (
              <button
                onClick={async () => {
                  const { error } = await supabase.from("automod_hits").delete().eq("space_id", spaceId);
                  if (error) toast(error.message, "error");
                  else setHits([]);
                }}
                className="flex items-center gap-1 text-xs text-sub hover:text-dnd"
              >
                <Trash2 className="size-3.5" /> Clear
              </button>
            )}
          </div>
          {hits.length === 0 ? (
            <div className="text-sm text-faint">Nothing flagged yet.</div>
          ) : (
            hits.map((h) => (
              <div key={h.id} className="flex items-start gap-2 border-t border-line/40 py-2 first:border-0">
                {h.user_id && <Avatar userId={h.user_id} size={24} plain />}
                <div className="min-w-0 flex-1 text-sm">
                  <div className="flex items-center gap-2">
                    {h.user_id && <NameTag userId={h.user_id} badges={false} />}
                    <span className="rounded bg-idle/20 px-1.5 text-[10px] font-bold text-idle uppercase">{h.rule}</span>
                    <span className="ml-auto text-[11px] text-faint">{new Date(h.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                  {h.excerpt && <div className="truncate text-sub">{h.excerpt}</div>}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
