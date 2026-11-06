"use client";

import { useEffect, useState } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  Construction,
  Crown,
  Gavel,
  Gift,
  Megaphone,
  Shield,
  Sparkles,
  Users,
} from "lucide-react";
import { create } from "zustand";
import { useApp, openModal, toast } from "@/store/app";
import { myRank, listUsers, setRole, auditLog } from "@/lib/admin";
import { ROLE_PERKS, can, fetchSiteNotice, perksForRank, setSiteNotice, type SiteNotice } from "@/lib/privileges";
import { ROLE_INFO, type SiteRole } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { openGram } from "@/lib/gram";
import { openPulse } from "@/lib/pulse";
import Avatar from "@/components/ui/Avatar";
import DevelopmentModePanel from "@/components/admin/DevelopmentModePanel";
import GiftLinksPanel from "@/components/admin/GiftLinksPanel";
import type { AdminAction, AdminUserRow } from "@/lib/types";

type Tab = "lounge" | "tools" | "announce" | "gifts" | "dev" | "members" | "audit";

export const useStaffDesk = create<{ tab: Tab }>(() => ({ tab: "lounge" }));

export default function StaffDesk({ mobile }: { mobile?: boolean }) {
  const me = useApp((s) => (s.userId ? s.profiles[s.userId] : undefined));
  const rank = myRank();
  const tab = useStaffDesk((s) => s.tab);
  const role = ROLE_INFO[(me?.site_role ?? "member") as SiteRole];

  useEffect(() => {
    if (rank < 1) useApp.setState({ hub: null });
  }, [rank]);

  if (rank < 1) {
    return (
      <div className="grid h-full place-items-center p-8 text-center text-sm text-sub">
        VIP and staff only — ask an admin for access.
      </div>
    );
  }

  const tabs: { id: Tab; label: string; min: number; icon: React.ReactNode }[] = [
    { id: "lounge", label: "Your perks", min: 1, icon: <Sparkles className="size-4" /> },
    { id: "tools", label: "Quick tools", min: 2, icon: <Gavel className="size-4" /> },
    { id: "gifts", label: "Gift links", min: 2, icon: <Gift className="size-4" /> },
    { id: "members", label: "Promote", min: 3, icon: <Users className="size-4" /> },
    { id: "announce", label: "Announce", min: 3, icon: <Megaphone className="size-4" /> },
    { id: "dev", label: "Dev mode", min: 3, icon: <Construction className="size-4" /> },
    { id: "audit", label: "Audit", min: 2, icon: <Shield className="size-4" /> },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#0c0d12] text-white">
      <header className={cn("flex shrink-0 items-center gap-2 border-b border-white/10 px-3", mobile ? "pt-safe-3 pb-2" : "h-14")}>
        <button
          onClick={() => useApp.setState(mobile ? { hub: null, mobileTab: "me" } : { hub: null })}
          className="grid size-9 place-items-center rounded-full hover:bg-white/5"
          aria-label="Back"
        >
          <ArrowLeft className="size-5" />
        </button>
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-semibold tracking-tight">
            <Crown className="size-4" style={{ color: role.color }} />
            Staff Desk
          </div>
          <div className="truncate text-[11px] text-white/45">
            {role.icon} {role.label}
            {rank >= 4 ? " · full control" : rank >= 3 ? " · admin tools" : rank >= 2 ? " · moderation" : " · VIP lounge"}
          </div>
        </div>
        {rank >= 2 && (
          <button
            onClick={() => openModal("settings", "admin")}
            className="ml-auto rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/15"
          >
            Full Admin Panel
          </button>
        )}
      </header>

      <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-white/10 px-2 py-2">
        {tabs
          .filter((t) => rank >= t.min)
          .map((t) => (
            <button
              key={t.id}
              onClick={() => useStaffDesk.setState({ tab: t.id })}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold",
                tab === t.id ? "bg-white text-black" : "bg-white/5 text-white/60 hover:bg-white/10",
              )}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-4 py-5 pb-16">
          {tab === "lounge" && <Lounge rank={rank} />}
          {tab === "tools" && rank >= 2 && <Tools />}
          {tab === "gifts" && rank >= 2 && <GiftLinksPanel />}
          {tab === "members" && rank >= 3 && <Promote rank={rank} />}
          {tab === "announce" && rank >= 3 && <Announce />}
          {tab === "dev" && rank >= 3 && <DevelopmentModePanel variant="staff" />}
          {tab === "audit" && rank >= 2 && <Audit />}
        </div>
      </div>
    </div>
  );
}

function Lounge({ rank }: { rank: number }) {
  const mine = perksForRank(rank);
  const locked = ROLE_PERKS.filter((p) => p.minRank > rank);
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#eb459e]/20 via-transparent to-[#f0b232]/10 p-5">
        <h2 className="text-xl font-bold tracking-tight">Your privileges</h2>
        <p className="mt-1 text-sm text-white/55">
          Unlocks stack — VIP keeps everything when promoted to mod, admin, or owner.
        </p>
      </div>
      <section>
        <h3 className="mb-2 text-xs font-bold tracking-wide text-white/40 uppercase">Unlocked</h3>
        <ul className="space-y-2">
          {mine.map((p) => (
            <li key={p.id} className="flex gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3">
              <BadgeCheck className="mt-0.5 size-4 shrink-0 text-emerald-400" />
              <div>
                <div className="text-sm font-semibold">{p.title}</div>
                <div className="text-xs text-white/45">{p.blurb}</div>
              </div>
            </li>
          ))}
        </ul>
      </section>
      {locked.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-bold tracking-wide text-white/40 uppercase">Higher ranks</h3>
          <ul className="space-y-2 opacity-70">
            {locked.map((p) => (
              <li key={p.id} className="flex gap-3 rounded-xl border border-dashed border-white/10 px-3.5 py-3">
                <Shield className="mt-0.5 size-4 shrink-0 text-white/35" />
                <div>
                  <div className="text-sm font-semibold">
                    {p.title}{" "}
                    <span className="text-[10px] font-bold tracking-wide text-white/35 uppercase">
                      {ROLE_INFO[Object.entries(ROLE_INFO).find(([, v]) => v.rank === p.minRank)?.[0] as SiteRole]?.label}
                    </span>
                  </div>
                  <div className="text-xs text-white/40">{p.blurb}</div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Tools() {
  return (
    <div className="space-y-3">
      {can.setRoles() && <YoutubeCidToggle />}
      <PushHealthCard />
      <div className="grid gap-3 sm:grid-cols-2">
        <ToolCard
          title="NexusGram Admin"
          blurb="Reports, remove posts, stats"
          onClick={() => openGram({ view: "admin" })}
        />
        <ToolCard title="Pulse feed" blurb="Moderate Twitter-style posts" onClick={() => openPulse()} />
        <ToolCard title="Admin Panel" blurb="Members, bans, badges, vault, push" onClick={() => openModal("settings", "admin")} />
        <ToolCard
          title="Games hub"
          blurb="Jump to arcade / AAA titles"
          onClick={() => useApp.setState({ hub: "games" })}
        />
        <ToolCard
          title="Live streams"
          blurb="Open Nexus Live moderation"
          onClick={() => void import("@/lib/live").then(({ openLiveHub }) => openLiveHub())}
        />
        <ToolCard
          title="Premium gifts"
          blurb="Studio gift links & grants"
          onClick={() => {
            useApp.setState({ hub: "studio" });
            void import("@/store/studio").then(({ useStudio }) => useStudio.setState({ section: "orders" }));
          }}
        />
        {can.announce() && (
          <ToolCard title="Site announcement" blurb="Banner for everyone" onClick={() => useStaffDesk.setState({ tab: "announce" })} />
        )}
        {can.setRoles() && (
          <ToolCard title="Promote members" blurb="Grant VIP or Moderator" onClick={() => useStaffDesk.setState({ tab: "members" })} />
        )}
        <ToolCard title="Audit log" blurb="Recent staff actions" onClick={() => useStaffDesk.setState({ tab: "audit" })} />
        <ToolCard
          title="Message inbox store"
          blurb="Realtime notification_inbox + FCM"
          onClick={() => toast("Inbox rows are written on every message · FCM delivers when the app is closed", "info")}
        />
      </div>
    </div>
  );
}

function PushHealthCard() {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    void import("@/lib/supabase").then(({ supabase }) =>
      supabase.from("push_subscriptions").select("id", { count: "exact", head: true }).then(({ count: c }) => setCount(c ?? 0)),
    );
  }, []);
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="font-semibold">Push / Firebase health</div>
      <div className="mt-1 text-xs text-white/45">
        {count === null ? "Checking device tokens…" : `${count} registered device endpoint${count === 1 ? "" : "s"} (Web Push + FCM)`}
      </div>
      <p className="mt-2 text-[11px] text-white/35">
        Message notifications are stored in <code className="text-white/55">notification_inbox</code> and delivered via Firebase Cloud Messaging when configured in Settings → Notifications.
      </p>
    </div>
  );
}

function YoutubeCidToggle() {
  const [on, setOn] = useState<boolean | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void import("@/lib/audio").then(({ checkStatus }) =>
      checkStatus().then((s) => {
        setOn(!!s.youtubeCidBlock);
        setReady(!!s.configured && !!s.staff);
      }),
    );
    const t = setInterval(
      () =>
        void import("@/lib/audio").then(({ checkStatus }) => checkStatus().then((s) => setOn(!!s.youtubeCidBlock))),
      8_000,
    );
    return () => clearInterval(t);
  }, []);
  if (on === null) return null;
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-semibold">Global YouTube Content ID</div>
          <div className="mt-0.5 text-xs text-white/45">
            {on ? "Live · blocking commercial / YouTube catalog audio on upload" : "Off — Shield Content ID still protects your own songs"}
          </div>
        </div>
        <button
          type="button"
          disabled={busy || !ready}
          onClick={async () => {
            setBusy(true);
            try {
              const { setYoutubeCidBlock } = await import("@/lib/audio");
              const next = !on;
              await setYoutubeCidBlock(next);
              setOn(next);
              toast(next ? "YouTube Content ID block ON — live" : "YouTube Content ID block OFF", "success");
            } catch (e) {
              toast((e as Error).message, "error");
            }
            setBusy(false);
          }}
          className={cn("rounded-full px-4 py-2 text-xs font-semibold disabled:opacity-40", on ? "bg-[#ed4245] text-white" : "bg-white text-black")}
        >
          {busy ? "…" : on ? "Turn off" : "Turn on"}
        </button>
      </div>
    </div>
  );
}

function ToolCard({ title, blurb, onClick }: { title: string; blurb: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left hover:bg-white/[0.06]">
      <div className="font-semibold">{title}</div>
      <div className="mt-1 text-xs text-white/45">{blurb}</div>
    </button>
  );
}

function Promote({ rank }: { rank: number }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<AdminUserRow[] | null>(null);
  useEffect(() => {
    const t = setTimeout(() => void listUsers(q).then(setRows), 200);
    return () => clearTimeout(t);
  }, [q]);

  const assignable = (Object.keys(ROLE_INFO) as SiteRole[]).filter((r) => ROLE_INFO[r].rank > 0 && ROLE_INFO[r].rank < rank);

  return (
    <div className="space-y-4">
      <p className="text-sm text-white/55">Search members and assign a role below yours. Owners can appoint admins.</p>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search username or display name"
        className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm outline-none focus:border-white/25"
      />
      <div className="divide-y divide-white/10 rounded-2xl border border-white/10">
        {(rows ?? []).slice(0, 40).map((u) => (
          <div key={u.id} className="flex items-center gap-3 px-3 py-2.5">
            <Avatar userId={u.id} size={36} plain />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">@{u.username}</div>
              <div className="truncate text-xs text-white/40">
                {u.display_name} · {u.site_role}
              </div>
            </div>
            <select
              defaultValue=""
              className="rounded-lg bg-white/10 px-2 py-1.5 text-xs outline-none"
              onChange={async (e) => {
                const role = e.target.value as SiteRole;
                if (!role) return;
                if (await setRole(u.id, role)) toast(`Set @${u.username} to ${role}`, "success");
                e.target.value = "";
                void listUsers(q).then(setRows);
              }}
            >
              <option value="" disabled>
                Set role…
              </option>
              {assignable.map((r) => (
                <option key={r} value={r}>
                  {ROLE_INFO[r].label}
                </option>
              ))}
              <option value="member">Member (remove)</option>
            </select>
          </div>
        ))}
        {rows && !rows.length && <p className="px-4 py-8 text-center text-sm text-white/40">No matches</p>}
        {!rows && <p className="px-4 py-8 text-center text-sm text-white/40">Loading…</p>}
      </div>
    </div>
  );
}

function Announce() {
  const [notice, setNotice] = useState<SiteNotice | null>(null);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void fetchSiteNotice().then((n) => {
      setNotice(n);
      setBody(n?.body ?? "");
    });
  }, []);
  return (
    <div className="space-y-4">
      <p className="text-sm text-white/55">Show a short banner at the top of Nexus for every signed-in member.</p>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value.slice(0, 280))}
        rows={4}
        placeholder="What’s the announcement?"
        className="w-full resize-none rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm outline-none focus:border-white/25"
      />
      <div className="flex items-center justify-between text-xs text-white/40">
        <span>{body.length}/280</span>
        <span>{notice?.active ? "Currently live" : "Currently off"}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          disabled={busy || !body.trim()}
          onClick={async () => {
            setBusy(true);
            if (await setSiteNotice(body, true)) {
              setNotice((n) => (n ? { ...n, body, active: true } : n));
              window.dispatchEvent(new Event("nexus:notice"));
            }
            setBusy(false);
          }}
          className="rounded-full bg-[#1d9bf0] px-4 py-2 text-sm font-bold disabled:opacity-40"
        >
          Publish
        </button>
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            if (await setSiteNotice(body || notice?.body || "", false)) {
              setNotice((n) => (n ? { ...n, active: false } : n));
              window.dispatchEvent(new Event("nexus:notice"));
            }
            setBusy(false);
          }}
          className="rounded-full bg-white/10 px-4 py-2 text-sm font-semibold"
        >
          Turn off
        </button>
      </div>
    </div>
  );
}

function Audit() {
  const [rows, setRows] = useState<AdminAction[] | null>(null);
  const profiles = useApp((s) => s.profiles);
  useEffect(() => {
    void auditLog().then(setRows);
  }, []);
  if (!rows) return <p className="text-sm text-white/40">Loading audit log…</p>;
  if (!rows.length) return <p className="text-sm text-white/40">No recent staff actions.</p>;
  return (
    <ul className="space-y-2">
      {rows.slice(0, 40).map((a) => (
        <li key={a.id} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm">
          <div className="font-semibold">{a.action}</div>
          <div className="text-xs text-white/40">
            by @{a.actor_id ? profiles[a.actor_id]?.username ?? a.actor_id.slice(0, 8) : "system"} · {new Date(a.created_at).toLocaleString()}
          </div>
        </li>
      ))}
    </ul>
  );
}
