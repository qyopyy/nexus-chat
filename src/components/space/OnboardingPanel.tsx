"use client";

import { useEffect, useState } from "react";
import { Plus, Sparkles, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { listRoles } from "@/lib/spaceExtras";
import { useApp, toast } from "@/store/app";
import { cn } from "@/lib/utils";
import type { Conversation, SpaceRole } from "@/lib/types";

type Reward = { level: number; role_id: string };
type Cfg = { enabled: boolean; auto_roles: string[]; welcome_channel: string | null; welcome_text: string; level_rewards: Reward[] };
const DEF: Cfg = { enabled: true, auto_roles: [], welcome_channel: null, welcome_text: "Welcome {user} to {server}! 🎉 You're member #{count}.", level_rewards: [] };
const EMPTY_C: Conversation[] = [];

/** Server onboarding: roles new members get, a welcome post, and roles unlocked by level. Runs on the database. */
export default function OnboardingPanel({ spaceId }: { spaceId: string }) {
  const channels = useApp((s) => s.channels[spaceId] ?? EMPTY_C).filter((c) => c.kind === "text");
  const [roles, setRoles] = useState<SpaceRole[]>([]);
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [exists, setExists] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lvl, setLvl] = useState("5");
  const [lvlRole, setLvlRole] = useState("");

  useEffect(() => {
    void listRoles(spaceId).then(setRoles);
    void supabase
      .from("space_onboarding")
      .select("enabled,auto_roles,welcome_channel,welcome_text,level_rewards")
      .eq("space_id", spaceId)
      .maybeSingle()
      .then(({ data }) => {
        setExists(!!data);
        setCfg(data ? { ...DEF, ...(data as Partial<Cfg>), welcome_text: (data as Cfg).welcome_text ?? "" } : DEF);
      });
  }, [spaceId]);

  if (!cfg) return <div className="h-40 animate-pulse rounded-2xl bg-side" />;
  const save = async (next: Cfg) => {
    setCfg(next);
    setSaving(true);
    const row = { space_id: spaceId, ...next, updated_at: new Date().toISOString() };
    const { error } = exists ? await supabase.from("space_onboarding").update(row).eq("space_id", spaceId) : await supabase.from("space_onboarding").insert(row);
    setSaving(false);
    if (error) return toast(error.message, "error");
    setExists(true);
  };
  const roleName = (id: string) => roles.find((r) => r.id === id)?.name ?? "deleted role";
  const roleColor = (id: string) => roles.find((r) => r.id === id)?.color ?? "#99aab5";
  const preview = cfg.welcome_text.replace("{user}", "@newfriend").replace("{server}", useApp.getState().spaces.find((s) => s.id === spaceId)?.name ?? "this server").replace("{count}", "42");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-2xl bg-gradient-to-br from-[#5865f2]/35 to-[#eb459e]/20 p-4">
        <Sparkles className="size-7 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="font-black">New member onboarding</div>
          <div className="text-xs text-sub">Greet people, give starter roles, reward active members.{saving && " Saving…"}</div>
        </div>
        <button onClick={() => void save({ ...cfg, enabled: !cfg.enabled })} className={cn("rounded-full px-4 py-2 text-sm font-bold", cfg.enabled ? "bg-black/25" : "bg-ok text-white")}>
          {cfg.enabled ? "On" : "Off"}
        </button>
      </div>

      <div className={cn("space-y-4", !cfg.enabled && "pointer-events-none opacity-50")}>
        <div className="rounded-2xl bg-side p-3">
          <div className="font-semibold">Roles for new members</div>
          <div className="mb-2 text-xs text-sub">Given automatically when someone joins.</div>
          {roles.length === 0 ? (
            <p className="text-sm text-faint">Create roles in the Roles tab first.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {roles.map((r) => {
                const on = cfg.auto_roles.includes(r.id);
                return (
                  <button
                    key={r.id}
                    onClick={() => void save({ ...cfg, auto_roles: on ? cfg.auto_roles.filter((x) => x !== r.id) : [...cfg.auto_roles, r.id] })}
                    className={cn("flex items-center gap-1.5 rounded-full px-3 py-1 text-sm ring-1", on ? "bg-white/10 ring-white/40" : "ring-white/10 hover:bg-white/5")}
                  >
                    <span className="size-2.5 rounded-full" style={{ background: r.color }} /> {r.name} {on && "✓"}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-2xl bg-side p-3">
          <div className="font-semibold">Welcome message</div>
          <div className="mb-2 text-xs text-sub">
            Posted when someone joins. Use <code className="rounded bg-black/30 px-1">{"{user}"}</code> <code className="rounded bg-black/30 px-1">{"{server}"}</code> <code className="rounded bg-black/30 px-1">{"{count}"}</code>.
          </div>
          <select value={cfg.welcome_channel ?? ""} onChange={(e) => void save({ ...cfg, welcome_channel: e.target.value || null })} className="mb-2 w-full rounded-lg bg-rail px-3 py-2 text-sm">
            <option value="">Don&apos;t post a welcome message</option>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                #{c.name}
              </option>
            ))}
          </select>
          <textarea
            value={cfg.welcome_text}
            onChange={(e) => setCfg({ ...cfg, welcome_text: e.target.value.slice(0, 1000) })}
            onBlur={() => void save(cfg)}
            rows={2}
            className="w-full resize-none rounded-lg bg-rail px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/60"
          />
          {cfg.welcome_channel && cfg.welcome_text && (
            <div className="mt-2 rounded-lg bg-black/25 px-3 py-2 text-sm">
              <span className="mr-1 rounded bg-accent px-1 text-[10px] font-bold text-white">BOT</span>
              <b>Welcome</b> <span className="text-sub">·</span> {preview}
            </div>
          )}
        </div>

        <div className="rounded-2xl bg-side p-3">
          <div className="font-semibold">Level rewards</div>
          <div className="mb-2 text-xs text-sub">Members get a role when they reach a level by chatting.</div>
          <div className="mb-2 space-y-1">
            {cfg.level_rewards
              .slice()
              .sort((a, b) => a.level - b.level)
              .map((rw) => (
                <div key={`${rw.level}-${rw.role_id}`} className="flex items-center gap-2 rounded-lg bg-rail px-3 py-1.5 text-sm">
                  <b className="w-16">Level {rw.level}</b>
                  <span className="size-2.5 rounded-full" style={{ background: roleColor(rw.role_id) }} />
                  <span className="flex-1">{roleName(rw.role_id)}</span>
                  <button onClick={() => void save({ ...cfg, level_rewards: cfg.level_rewards.filter((x) => x !== rw) })} className="grid size-7 place-items-center rounded-md text-sub hover:bg-hover hover:text-dnd" aria-label="Remove reward">
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
          </div>
          {roles.length > 0 && (
            <div className="flex gap-2">
              <input value={lvl} onChange={(e) => setLvl(e.target.value.replace(/\D/g, "").slice(0, 3))} inputMode="numeric" className="w-20 rounded-lg bg-rail px-3 py-2 text-sm" aria-label="Level" />
              <select value={lvlRole} onChange={(e) => setLvlRole(e.target.value)} className="min-w-0 flex-1 rounded-lg bg-rail px-3 py-2 text-sm">
                <option value="">Pick a role…</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              <button
                disabled={!lvlRole || !Number(lvl)}
                onClick={() => {
                  void save({ ...cfg, level_rewards: [...cfg.level_rewards.filter((x) => !(x.level === Number(lvl) && x.role_id === lvlRole)), { level: Number(lvl), role_id: lvlRole }].slice(0, 25) });
                  setLvlRole("");
                }}
                className="flex items-center gap-1 rounded-lg bg-accent px-3 text-sm font-bold text-white disabled:opacity-40"
              >
                <Plus className="size-4" /> Add
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
