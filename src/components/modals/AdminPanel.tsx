"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, Award, Ban, ChevronRight, Clock, Lock, MessageSquare, Mic, RotateCcw, Search, Shield, Trash2, Users } from "lucide-react";
import { ClaimsTab, VaultTab } from "@/components/admin/AdminExtras";
import { ModerationControls } from "@/components/admin/ModTools";
import { useApp } from "@/store/app";
import {
  adminStats,
  auditLog,
  createBadge,
  deleteBadge,
  grantBadge,
  isMuted,
  listUsers,
  resetProfile,
  revokeBadge,
  setRole,
} from "@/lib/admin";
import { loadProfiles } from "@/lib/data";
import { ROLE_INFO, roleRank, type SiteRole } from "@/lib/theme";
import { cn } from "@/lib/utils";
import Avatar from "@/components/ui/Avatar";
import NameTag from "@/components/ui/NameTag";
import type { AdminAction, AdminUserRow, Profile } from "@/lib/types";

type Tab = "overview" | "members" | "badges" | "claims" | "vault" | "audit";
const EMPTY: string[] = [];

export default function AdminPanel({ focusUser }: { focusUser: string | null }) {
  const me = useApp((s) => (s.userId ? s.profiles[s.userId] : undefined));
  const rank = roleRank(me?.site_role);
  const [tab, setTab] = useState<Tab>(focusUser ? "members" : "overview");

  if (rank < 2) return <p className="text-sub">Staff only.</p>;

  const tabs: { id: Tab; label: string; icon: React.ReactNode; min: number }[] = [
    { id: "overview", label: "Overview", icon: <Activity className="size-4" />, min: 2 },
    { id: "members", label: "Members", icon: <Users className="size-4" />, min: 2 },
    { id: "badges", label: "Badges", icon: <Award className="size-4" />, min: 3 },
    { id: "claims", label: "Artist claims", icon: <Mic className="size-4" />, min: 3 },
    { id: "vault", label: "File vault", icon: <Lock className="size-4" />, min: 3 },
    { id: "audit", label: "Audit Log", icon: <Clock className="size-4" />, min: 2 },
  ];

  return (
    <>
      <div className="mb-5 flex items-center gap-3">
        <div className="grid size-10 place-items-center rounded-xl bg-dnd/20">
          <Shield className="size-5 text-dnd" />
        </div>
        <div>
          <h2 className="text-xl font-bold">Admin Panel</h2>
          <p className="text-sm text-sub">
            You are <span style={{ color: ROLE_INFO[(me?.site_role ?? "member") as SiteRole].color }}>{ROLE_INFO[(me?.site_role ?? "member") as SiteRole].label}</span>
            {rank < 3 && " — moderators can time out, ban and delete messages."}
          </p>
        </div>
      </div>
      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-line">
        {tabs
          .filter((t) => rank >= t.min)
          .map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn("relative flex items-center gap-1.5 px-3 py-2 text-sm font-medium whitespace-nowrap", tab === t.id ? "text-txt" : "text-sub hover:text-txt")}
            >
              {t.icon}
              {t.label}
              {tab === t.id && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded bg-accent" />}
            </button>
          ))}
      </div>
      {tab === "overview" && <Overview />}
      {tab === "members" && <Members rank={rank} focusUser={focusUser} />}
      {tab === "badges" && rank >= 3 && <BadgesTab />}
      {tab === "claims" && rank >= 3 && <ClaimsTab />}
      {tab === "vault" && rank >= 3 && <VaultTab />}
      {tab === "audit" && <Audit />}
    </>
  );
}

function Overview() {
  const [stats, setStats] = useState<Record<string, number> | null>(null);
  const presence = useApp((s) => s.presence);
  useEffect(() => {
    void adminStats().then(setStats);
  }, []);
  const cards: [string, string | number, React.ReactNode][] = [
    ["Members", stats?.users ?? "…", <Users key="u" className="size-5" />],
    ["Online now", Object.keys(presence).length, <Activity key="a" className="size-5 text-ok" />],
    ["New this week", stats?.new_users_7d ?? "…", <Users key="n" className="size-5 text-accent" />],
    ["Messages", stats?.messages ?? "…", <MessageSquare key="m" className="size-5" />],
    ["Messages (24h)", stats?.messages_24h ?? "…", <MessageSquare key="m2" className="size-5 text-accent" />],
    ["Spaces", stats?.spaces ?? "…", <Shield key="s" className="size-5" />],
    ["Staff", stats?.staff ?? "…", <Shield key="st" className="size-5 text-ok" />],
    ["Suspended", stats?.banned ?? "…", <Ban key="b" className="size-5 text-dnd" />],
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cards.map(([label, value, icon]) => (
        <div key={label} className="rounded-xl bg-side p-4">
          <div className="flex items-center justify-between text-sub">
            <span className="text-xs font-bold tracking-wide uppercase">{label}</span>
            {icon}
          </div>
          <div className="mt-2 text-2xl font-bold tabular-nums">{typeof value === "number" ? value.toLocaleString() : value}</div>
        </div>
      ))}
    </div>
  );
}

function Members({ rank, focusUser }: { rank: number; focusUser: string | null }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(focusUser);

  const load = useCallback(async (search: string) => {
    setLoading(true);
    const r = await listUsers(search);
    setRows(r);
    setLoading(false);
    void loadProfiles(r.map((x) => x.id));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(q), 250);
    return () => clearTimeout(t);
  }, [q, load]);

  return (
    <>
      <div className="relative mb-3">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-sub" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or username" className="w-full rounded-lg bg-rail py-2.5 pr-3 pl-9 outline-none focus:ring-2 focus:ring-accent/60" />
      </div>
      {loading && rows.length === 0 && <p className="py-6 text-center text-sub">Loading…</p>}
      <div className="space-y-1">
        {rows.map((u) => (
          <div key={u.id} className="overflow-hidden rounded-lg bg-side">
            <button onClick={() => setOpen(open === u.id ? null : u.id)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-hover">
              <Avatar userId={u.id} size={36} plain />
              <div className="min-w-0 flex-1">
                <NameTag userId={u.id} className="font-semibold" />
                <div className="truncate text-xs text-sub">
                  {profilesUid(u.id)}@{u.username}
                  {u.email && ` · ${u.email}`} · {u.message_count} msgs · joined {new Date(u.created_at).toLocaleDateString()}
                </div>
              </div>
              <MutedChip userId={u.id} />
              {u.banned_until && (u.banned_until === "infinity" || new Date(u.banned_until) > new Date()) && (
                <span className="rounded bg-dnd/20 px-2 py-0.5 text-xs font-semibold text-dnd">{u.banned_until === "infinity" ? "Banned" : "Timed out"}</span>
              )}
              <ChevronRight className={cn("size-4 text-sub transition", open === u.id && "rotate-90")} />
            </button>
            {open === u.id && <MemberDetail userId={u.id} rank={rank} onChanged={() => void load(q)} />}
          </div>
        ))}
      </div>
    </>
  );
}


function MemberDetail({ userId, rank, onChanged }: { userId: string; rank: number; onChanged: () => void }) {
  const p = useApp((s) => s.profiles[userId]) as Profile | undefined;
  const me = useApp((s) => s.userId);
  const catalog = useApp((s) => s.badges);
  const owned = useApp((s) => s.userBadges[userId] ?? EMPTY);
  const [busy, setBusy] = useState(false);
  const badges = useMemo(() => Object.values(catalog).sort((a, b) => b.priority - a.priority), [catalog]);
  if (!p) return <div className="p-3 text-sm text-sub">Loading…</div>;

  const targetRank = roleRank(p.site_role);
  const self = userId === me;
  const canManage = !self && targetRank < rank;
  const roles = (["admin", "moderator", "vip", "member"] as SiteRole[]).filter((r) => ROLE_INFO[r].rank < rank);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    await fn();
    setBusy(false);
    onChanged();
  };

  return (
    <div className="space-y-5 border-t border-line/60 bg-panel/60 p-4">
      {!canManage && <p className="text-sm text-sub">{self ? "This is you — another higher-ranked member must change your role." : "This member is ranked equal to or above you."}</p>}

      {rank >= 3 && (
        <section>
          <div className="mb-2 text-xs font-bold tracking-wide text-sub uppercase">Site role</div>
          <div className="flex flex-wrap gap-2">
            {(["owner", ...roles] as SiteRole[]).map((r) => {
              const info = ROLE_INFO[r];
              const active = p.site_role === r;
              const allowed = canManage && r !== "owner";
              return (
                <button
                  key={r}
                  disabled={!allowed || active || busy}
                  onClick={() => void run(() => setRole(userId, r))}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition disabled:cursor-not-allowed",
                    active ? "border-accent bg-accent/15 text-txt" : "border-line text-sub hover:border-sub hover:text-txt disabled:opacity-40",
                  )}
                  style={active && info.color ? { borderColor: info.color, color: info.color } : undefined}
                >
                  {info.icon && <span>{info.icon}</span>}
                  {info.label}
                </button>
              );
            }).filter((_, i) => i > 0 || p.site_role === "owner")}
          </div>
        </section>
      )}

      {rank >= 3 && (
        <section>
          <div className="mb-2 text-xs font-bold tracking-wide text-sub uppercase">Badges (permanent until removed)</div>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {badges.map((b) => {
              const has = owned.includes(b.id);
              return (
                <button
                  key={b.id}
                  disabled={busy}
                  onClick={() => void run(() => (has ? revokeBadge(userId, b.id) : grantBadge(userId, b.id)))}
                  className={cn("flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm transition", has ? "bg-white/5" : "border-line opacity-60 hover:opacity-100")}
                  style={has ? { borderColor: b.color } : undefined}
                >
                  <span className="text-lg">{b.icon}</span>
                  <span className="min-w-0 flex-1 truncate" style={{ color: has ? b.color : undefined }}>
                    {b.name}
                  </span>
                  <span className={cn("grid size-4 shrink-0 place-items-center rounded border text-[10px]", has ? "border-transparent bg-ok text-white" : "border-sub")}>{has && "✓"}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {canManage && (
        <section>
          <div className="mb-2 text-xs font-bold tracking-wide text-sub uppercase">Moderation — suspend or block messaging until a date &amp; time</div>
          <div className="rounded-lg bg-side p-3">
            <ModerationControls userId={userId} />
          </div>
          <button
            disabled={busy}
            onClick={() => confirm("Remove this member's avatar, status, bio and decoration?") && void run(() => resetProfile(userId))}
            className="mt-3 flex items-center gap-1.5 text-sm text-sub hover:text-txt"
          >
            <RotateCcw className="size-4" /> Reset profile (avatar, status, bio)
          </button>
        </section>
      )}
    </div>
  );
}

function profilesUid(id: string) {
  const n = useApp.getState().profiles[id]?.member_no;
  return n != null ? `UID ${n} · ` : "";
}

function MutedChip({ userId }: { userId: string }) {
  const muted = useApp((s) => isMuted(s.profiles[userId]));
  return muted ? <span className="rounded bg-idle/20 px-2 py-0.5 text-xs font-semibold text-idle">Muted</span> : null;
}

function BadgesTab() {
  const catalog = useApp((s) => s.badges);
  const userBadges = useApp((s) => s.userBadges);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("⭐");
  const [color, setColor] = useState("#FAA61A");
  const [desc, setDesc] = useState("");
  const holders = useMemo(() => {
    const m: Record<string, number> = {};
    for (const ids of Object.values(userBadges)) for (const id of ids) m[id] = (m[id] ?? 0) + 1;
    return m;
  }, [userBadges]);
  const list = Object.values(catalog).sort((a, b) => b.priority - a.priority);

  return (
    <>
      <div className="mb-6 rounded-xl bg-side p-4">
        <div className="mb-3 font-semibold">Create a badge</div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="w-16">
            <span className="mb-1 block text-xs text-sub">Icon</span>
            <input value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={4} className="w-full rounded-md bg-rail px-2 py-2 text-center text-xl outline-none" />
          </label>
          <label className="min-w-40 flex-1">
            <span className="mb-1 block text-xs text-sub">Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={32} placeholder="Beatmaker" className="w-full rounded-md bg-rail px-3 py-2 outline-none" />
          </label>
          <label>
            <span className="mb-1 block text-xs text-sub">Color</span>
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-14 cursor-pointer rounded-md bg-rail" />
          </label>
          <label className="min-w-full flex-1 sm:min-w-56">
            <span className="mb-1 block text-xs text-sub">Description</span>
            <input value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={120} placeholder="Made a beat that slaps" className="w-full rounded-md bg-rail px-3 py-2 outline-none" />
          </label>
          <button
            disabled={!name.trim() || !icon.trim()}
            onClick={async () => {
              await createBadge(name, icon, color, desc);
              setName("");
              setDesc("");
            }}
            className="rounded-md bg-accent px-4 py-2 font-semibold text-white hover:bg-accent-2 disabled:opacity-40"
          >
            Create
          </button>
        </div>
        {name && (
          <div className="mt-3 flex items-center gap-2 text-sm text-sub">
            Preview:
            <span className="flex items-center gap-1 rounded-md px-2 py-0.5" style={{ background: `${color}26`, color }}>
              {icon} {name}
            </span>
          </div>
        )}
      </div>
      <div className="space-y-1.5">
        {list.map((b) => (
          <div key={b.id} className="flex items-center gap-3 rounded-lg bg-side px-3 py-2.5">
            <span className="grid size-9 place-items-center rounded-lg text-xl" style={{ background: `${b.color}26` }}>
              {b.icon}
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-semibold" style={{ color: b.color }}>
                {b.name}
              </div>
              <div className="truncate text-xs text-sub">{b.description || "—"}</div>
            </div>
            <span className="text-xs text-sub">{holders[b.id] ?? 0} members</span>
            <button
              onClick={() => confirm(`Delete the "${b.name}" badge from everyone?`) && void deleteBadge(b.id)}
              className="rounded p-1.5 text-sub hover:bg-dnd/15 hover:text-dnd"
              title="Delete badge"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </>
  );
}

const ACTION_TEXT: Record<string, (d: Record<string, unknown>) => string> = {
  set_role: (d) => `changed role ${String(d.from)} → ${String(d.to)} for`,
  grant_badge: (d) => `gave the ${String(d.badge)} badge to`,
  revoke_badge: (d) => `removed the ${String(d.badge)} badge from`,
  create_badge: (d) => `created the badge ${String(d.badge)}`,
  delete_badge: (d) => `deleted the badge ${String(d.badge)}`,
  ban: (d) => `banned${d.reason ? ` (${String(d.reason)})` : ""}`,
  timeout: (d) => `timed out for ${String(d.minutes)} min${d.reason ? ` (${String(d.reason)})` : ""}`,
  unban: () => "lifted the suspension of",
  reset_profile: () => "reset the profile of",
  delete_message: () => "deleted a message by",
  ban_until: (d) => `suspended until ${d.until ? new Date(String(d.until)).toLocaleString() : "?"}${d.reason ? ` (${String(d.reason)})` : ""}`,
  mute: (d) => `blocked messaging${d.until && d.until !== "infinity" ? ` until ${new Date(String(d.until)).toLocaleString()}` : ""}${d.reason ? ` (${String(d.reason)})` : ""} for`,
  unmute: () => "restored messaging for",
  approve_claim: (d) => `approved the ${String(d.artist)} artist claim by`,
  reject_claim: (d) => `rejected the ${String(d.artist)} artist claim by`,
  delete_post: () => "removed an artist post by",
};

function Audit() {
  const [rows, setRows] = useState<AdminAction[] | null>(null);
  const profiles = useApp((s) => s.profiles);
  useEffect(() => {
    void auditLog().then((r) => {
      setRows(r);
      void loadProfiles(r.flatMap((x) => [x.actor_id, x.target_id]));
    });
  }, []);
  if (!rows) return <p className="text-sub">Loading…</p>;
  if (rows.length === 0) return <p className="text-sub">No moderation activity yet.</p>;
  return (
    <div className="space-y-1">
      {rows.map((r) => (
        <div key={r.id} className="flex items-start gap-3 rounded-lg px-2 py-2 text-sm hover:bg-side">
          <Avatar userId={r.actor_id} size={28} plain />
          <div className="min-w-0 flex-1">
            <b>{profiles[r.actor_id ?? ""]?.display_name ?? "System"}</b> {(ACTION_TEXT[r.action] ?? (() => r.action))(r.detail)}{" "}
            {r.target_id && <b>{profiles[r.target_id]?.display_name ?? "someone"}</b>}
          </div>
          <span className="shrink-0 text-xs text-sub">{new Date(r.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
        </div>
      ))}
    </div>
  );
}
