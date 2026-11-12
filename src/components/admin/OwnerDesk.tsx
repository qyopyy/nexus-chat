"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase, errorText } from "@/lib/supabase";
import { useApp, toast } from "@/store/app";
import { fmtBytes } from "@/lib/acetateAudio";
import { banUser, setRole, unbanUser } from "@/lib/admin";
import type { SiteRole } from "@/lib/theme";

type Overview = {
  users: number;
  signups_7d: number;
  signups_30d: number;
  active_7d: number;
  active_1d: number;
  banned: number;
  open_reports: number;
  open_content_reports: number;
  storage_bytes: number;
  vault_bytes: number;
  signups: { day: string; n: number }[];
  uploads: { day: string; n: number }[];
  flags: { phone_link: boolean; locator: boolean; live_stage: boolean; vault_uploads: boolean; format_convert?: boolean; soundcloud_import?: boolean; link_import?: boolean };
  policy: { shelf_free_bytes: number; vault_quota_bytes: number | null; file_bytes: number };
};

type Person = { id: string; username: string; display_name: string; site_role: string };
type Detail = {
  id: string;
  username: string;
  display_name: string;
  site_role: string;
  email: string | null;
  created_at: string;
  banned_until: string | null;
  ban_reason: string | null;
  premium_tier: string | null;
  premium_until: string | null;
  storage: { bytes?: number; limit?: number | null; premium?: boolean; vault_bytes?: number; vault_limit?: number | null; lifetime?: boolean };
  devices: { label: string; platform: string | null; kind: string; last_seen: string; control_enabled: boolean }[];
  sessions: { created_at: string; updated_at: string; user_agent: string | null; ip: string | null }[];
  reports: number;
};
type Queue = {
  reports: { id: number; reason: string; excerpt: string | null; target_user: string | null; message_id: string | null; created_at: string }[];
  content: { id: number; kind: string; target_id: string; reason: string; created_at: string }[];
  shares: { id: string; username: string; kind: string; listing: string; revoked: boolean; created_at: string }[];
  statuses: { id: string; username: string; body: string | null; kind: string; created_at: string }[];
};
type FileRow = { path: string; bytes: number; library: string; owner_id: string; username: string };
type Audit = { id: number; action: string; created_at: string; actor_id: string | null; target_id: string | null; detail: unknown };

const TABS = ["Overview", "People", "Moderation", "Storage", "Flags", "Audit"] as const;

export default function OwnerDesk({ userId }: { userId?: string }) {
  const [rank, setRank] = useState<number | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]>(userId ? "People" : "Overview");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [q, setQ] = useState("");
  const [people, setPeople] = useState<Person[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [queue, setQueue] = useState<Queue | null>(null);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [audit, setAudit] = useState<Audit[]>([]);
  const [notice, setNotice] = useState("");
  const [noticeOn, setNoticeOn] = useState(false);
  const [shelfGb, setShelfGb] = useState("5");
  const [vaultUnlimited, setVaultUnlimited] = useState(true);
  const [vaultGb, setVaultGb] = useState("100");
  const [fileGb, setFileGb] = useState("5");

  useEffect(() => {
    void supabase.auth.getSession().then(async ({ data }) => {
      const id = data.session?.user.id;
      if (!id) {
        setRank(0);
        return;
      }
      useApp.setState({ userId: id });
      const { data: profile } = await supabase.from("profiles").select("*").eq("id", id).single();
      if (profile) useApp.setState((s) => ({ profiles: { ...s.profiles, [id]: profile } }));
      const { data: r } = await supabase.rpc("my_rank");
      setRank(Number(r) || 0);
    });
  }, []);

  useEffect(() => {
    if (rank == null || rank < 3) return;
    void supabase.rpc("admin_desk_overview").then(({ data, error }) => {
      if (error) toast(errorText(error), "error");
      else {
        const next = data as Overview;
        setOverview(next);
        setShelfGb(String(Math.round(next.policy.shelf_free_bytes / 1024 ** 3)));
        setVaultUnlimited(next.policy.vault_quota_bytes == null);
        if (next.policy.vault_quota_bytes) setVaultGb(String(Math.round(next.policy.vault_quota_bytes / 1024 ** 3)));
        setFileGb(String(Math.round(next.policy.file_bytes / 1024 ** 3)));
      }
    });
    void supabase.from("site_notices").select("body, active").eq("id", "global").maybeSingle().then(({ data }) => {
      if (data) {
        setNotice((data as { body: string }).body || "");
        setNoticeOn(!!(data as { active: boolean }).active);
      }
    });
  }, [rank]);

  useEffect(() => {
    if (!userId || rank == null || rank < 3) return;
    void openUser(userId);
  }, [userId, rank]);

  async function openUser(id: string) {
    const { data, error } = await supabase.rpc("admin_user_detail", { p_user: id });
    if (error) toast(errorText(error), "error");
    else setDetail(data as Detail);
  }

  async function search(event: React.FormEvent) {
    event.preventDefault();
    const { data, error } = await supabase.rpc("admin_list_users", { p_search: q, p_limit: 30 });
    if (error) toast(errorText(error), "error");
    else setPeople((data ?? []) as Person[]);
  }

  if (rank == null) return <main className="grid min-h-dvh place-items-center bg-chat text-sub">Checking your role…</main>;
  if (rank < 3) {
    return (
      <main className="grid min-h-dvh place-items-center bg-chat px-6 text-center text-txt">
        <div>
          <h1 className="text-2xl font-bold">Admins only</h1>
          <p className="mt-2 text-sub">This desk uses your Nexus site role. Moderators keep the staff tools in Settings.</p>
          <Link href="/" className="mt-4 inline-block text-accent">Back to Nexus</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-chat text-txt">
      <div className="mx-auto max-w-5xl px-4 py-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold tracking-[0.18em] text-accent uppercase">Nexus</p>
            <h1 className="text-3xl font-black">Admin desk</h1>
          </div>
          <Link href="/" className="text-sm text-sub">Close</Link>
        </div>
        <nav className="mt-4 flex flex-wrap gap-2">
          {TABS.map((item) => (
            <button key={item} type="button" onClick={() => { setTab(item); if (item === "Moderation") void supabase.rpc("admin_moderation_queue").then(({ data }) => setQueue(data as Queue)); if (item === "Storage") void supabase.rpc("admin_storage_top", { p_limit: 20 }).then(({ data }) => setFiles((data ?? []) as FileRow[])); if (item === "Audit") void supabase.from("admin_actions").select("*").order("id", { ascending: false }).limit(40).then(({ data }) => setAudit((data ?? []) as Audit[])); }} className={`rounded-full px-3 py-1.5 text-sm font-semibold ${tab === item ? "bg-accent text-white" : "bg-side text-sub"}`}>{item}</button>
          ))}
        </nav>

        {tab === "Overview" && overview && (
          <section className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="People" value={String(overview.users)} />
              <Stat label="Signups 7d" value={String(overview.signups_7d)} />
              <Stat label="Active 7d" value={String(overview.active_7d)} />
              <Stat label="Devices today" value={String(overview.active_1d)} />
              <Stat label="Open reports" value={String(overview.open_reports + overview.open_content_reports)} />
              <Stat label="Banned" value={String(overview.banned)} />
              <Stat label="Acetate stored" value={fmtBytes(Number(overview.storage_bytes))} />
              <Stat label="Vault stored" value={fmtBytes(Number(overview.vault_bytes))} />
            </div>
            <Panel title="Signups">
              <Bars rows={overview.signups} />
            </Panel>
            <Panel title="Acetate uploads">
              <Bars rows={overview.uploads} />
            </Panel>
            <Panel title="Announcement">
              <textarea value={notice} onChange={(e) => setNotice(e.target.value)} maxLength={280} className="min-h-20 w-full rounded-xl bg-chat px-3 py-2 text-sm outline-none" />
              <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={noticeOn} onChange={(e) => setNoticeOn(e.target.checked)} /> Show to everyone</label>
              <button type="button" className="mt-2 rounded-full bg-accent px-3 py-1.5 text-sm font-semibold text-white" onClick={() => void supabase.rpc("admin_set_notice", { p_body: notice, p_active: noticeOn }).then(({ error }) => toast(error ? errorText(error) : "Announcement saved", error ? "error" : "success"))}>Save banner</button>
            </Panel>
          </section>
        )}

        {tab === "People" && (
          <section className="mt-4 grid gap-4 lg:grid-cols-[280px_1fr]">
            <form onSubmit={(e) => void search(e)} className="space-y-2">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Username or name" className="w-full rounded-xl bg-side px-3 py-2 text-sm outline-none" />
              <button className="rounded-full bg-accent px-3 py-1.5 text-sm font-semibold text-white">Search</button>
              <ul className="space-y-1 text-sm">
                {people.map((person) => (
                  <li key={person.id}>
                    <Link href={`/admin/user/${person.id}`} className="block rounded-xl bg-side px-3 py-2">{person.display_name} <span className="text-sub">@{person.username}</span> <span className="text-xs text-accent">{person.site_role}</span></Link>
                  </li>
                ))}
              </ul>
            </form>
            {detail && <UserCard detail={detail} onChanged={() => void openUser(detail.id)} />}
          </section>
        )}

        {tab === "Moderation" && queue && (
          <section className="mt-4 space-y-4">
            <Panel title="Reported messages">
              {queue.reports.map((row) => (
                <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-2 text-sm">
                  <span>{row.reason}: {row.excerpt || "attachment"}</span>
                  <span className="flex gap-2">
                    {row.message_id && <button type="button" className="text-dnd" onClick={() => confirm("Remove this message?") && void supabase.rpc("mod_delete_message", { p_id: row.message_id }).then(() => supabase.rpc("admin_resolve_report", { p_id: row.id, p_status: "resolved", p_resolution: "removed" }))}>Remove</button>}
                    <button type="button" onClick={() => void supabase.rpc("admin_resolve_report", { p_id: row.id, p_status: "dismissed", p_resolution: "dismissed" })}>Dismiss</button>
                  </span>
                </div>
              ))}
              {queue.reports.length === 0 && <Empty />}
            </Panel>
            <Panel title="Tracks, statuses, shares">
              {queue.content.map((row) => (
                <div key={row.id} className="flex items-center justify-between gap-2 border-b border-line py-2 text-sm">
                  <span>{row.kind}: {row.reason}</span>
                  <span className="flex gap-2">
                    <button type="button" className="text-dnd" onClick={() => confirm("Remove this and mark the report removed?") && void supabase.rpc("admin_resolve_content", { p_id: row.id, p_status: "removed" })}>Remove</button>
                    <button type="button" onClick={() => void supabase.rpc("admin_resolve_content", { p_id: row.id, p_status: "dismissed" })}>Dismiss</button>
                  </span>
                </div>
              ))}
              {queue.statuses.map((row) => (
                <div key={row.id} className="flex items-center justify-between gap-2 border-b border-line py-2 text-sm">
                  <span>Status @{row.username}: {row.body || row.kind}</span>
                  <button type="button" className="text-dnd" onClick={() => confirm("Remove this status?") && void supabase.rpc("admin_remove_status", { p_id: row.id })}>Remove</button>
                </div>
              ))}
              {queue.shares.map((row) => (
                <div key={row.id} className="flex items-center justify-between gap-2 border-b border-line py-2 text-sm">
                  <span>{row.revoked ? "Revoked" : row.listing} {row.kind} @{row.username}</span>
                  {!row.revoked && <button type="button" className="text-dnd" onClick={() => confirm("Revoke this share link?") && void supabase.rpc("admin_revoke_share", { p_id: row.id })}>Revoke</button>}
                </div>
              ))}
            </Panel>
          </section>
        )}

        {tab === "Storage" && (
          <section className="mt-4">
            <Panel title="Largest Acetate files">
              {files.map((file) => (
                <div key={file.path} className="flex justify-between gap-3 border-b border-line py-2 text-sm">
                  <span className="min-w-0 truncate">@{file.username} · {file.library}</span>
                  <span>{fmtBytes(Number(file.bytes))}</span>
                </div>
              ))}
              {files.length === 0 && <Empty />}
            </Panel>
          </section>
        )}

        {tab === "Flags" && overview && (
          <section className="mt-4 space-y-4">
            <Panel title="Kill switches">
              <FlagRow label="Phone Link" on={overview.flags.phone_link} set={(v) => setOverview({ ...overview, flags: { ...overview.flags, phone_link: v } })} />
              <FlagRow label="Locator" on={overview.flags.locator} set={(v) => setOverview({ ...overview, flags: { ...overview.flags, locator: v } })} />
              <FlagRow label="Live Stage" on={overview.flags.live_stage} set={(v) => setOverview({ ...overview, flags: { ...overview.flags, live_stage: v } })} />
              <FlagRow label="Vault uploads" on={overview.flags.vault_uploads} set={(v) => setOverview({ ...overview, flags: { ...overview.flags, vault_uploads: v } })} />
              <FlagRow label="Format converter" on={overview.flags.format_convert !== false} set={(v) => setOverview({ ...overview, flags: { ...overview.flags, format_convert: v } })} />
              <FlagRow label="SoundCloud import" on={overview.flags.soundcloud_import !== false} set={(v) => setOverview({ ...overview, flags: { ...overview.flags, soundcloud_import: v } })} />
              <FlagRow label="Link import" on={overview.flags.link_import !== false} set={(v) => setOverview({ ...overview, flags: { ...overview.flags, link_import: v } })} />
              <button type="button" className="mt-3 rounded-full bg-accent px-3 py-1.5 text-sm font-semibold text-white" onClick={() => {
                if (!confirm("Save these switches for everyone?")) return;
                void supabase.rpc("admin_set_flags", {
                  p_phone: overview.flags.phone_link,
                  p_locator: overview.flags.locator,
                  p_stage: overview.flags.live_stage,
                  p_vault: overview.flags.vault_uploads,
                  p_format: overview.flags.format_convert !== false,
                  p_soundcloud: overview.flags.soundcloud_import !== false,
                  p_links: overview.flags.link_import !== false,
                }).then(({ error }) => toast(error ? errorText(error) : "Switches saved", error ? "error" : "success"));
              }}>Save switches</button>
            </Panel>
            <Panel title="Vault storage rule">
              <p className="text-xs text-sub">One row: acetate_storage_policy. Null vault quota means unlimited. Premium still bypasses the library quota. Supabase storage cost grows with Vault usage.</p>
              <label className="mt-2 block text-sm">Free library quota (GB)<input value={shelfGb} onChange={(e) => setShelfGb(e.target.value)} className="mt-1 w-full rounded-xl bg-chat px-3 py-2" /></label>
              <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={vaultUnlimited} onChange={(e) => setVaultUnlimited(e.target.checked)} /> Vault unlimited</label>
              {!vaultUnlimited && <label className="mt-2 block text-sm">Vault cap for free accounts (GB)<input value={vaultGb} onChange={(e) => setVaultGb(e.target.value)} className="mt-1 w-full rounded-xl bg-chat px-3 py-2" /></label>}
              <label className="mt-2 block text-sm">Per-file cap (GB, max 5)<input value={fileGb} onChange={(e) => setFileGb(e.target.value)} className="mt-1 w-full rounded-xl bg-chat px-3 py-2" /></label>
              <button type="button" className="mt-3 rounded-full bg-accent px-3 py-1.5 text-sm font-semibold text-white" onClick={() => {
                if (!confirm("Change the storage rule?")) return;
                const gb = (value: string) => Math.round(Number(value) * 1024 ** 3);
                void supabase.rpc("admin_set_storage_policy", {
                  p_shelf_bytes: gb(shelfGb),
                  p_vault_bytes: vaultUnlimited ? null : gb(vaultGb),
                  p_file_bytes: gb(fileGb),
                }).then(({ error }) => toast(error ? errorText(error) : "Storage rule saved", error ? "error" : "success"));
              }}>Save storage rule</button>
            </Panel>
          </section>
        )}

        {tab === "Audit" && (
          <section className="mt-4">
            <Panel title="Recent admin actions">
              {audit.map((row) => (
                <p key={row.id} className="border-b border-line py-2 text-sm">{new Date(row.created_at).toLocaleString()} · {row.action}</p>
              ))}
              {audit.length === 0 && <Empty />}
            </Panel>
          </section>
        )}
      </div>
    </main>
  );
}

function UserCard({ detail, onChanged }: { detail: Detail; onChanged: () => void }) {
  const owner = detail.username === "qyopy";
  return (
    <div className="rounded-3xl bg-side p-4">
      <h2 className="text-xl font-bold">{detail.display_name}</h2>
      <p className="text-sm text-sub">@{detail.username} · {detail.site_role}{detail.email ? ` · ${detail.email}` : ""}</p>
      <p className="mt-2 text-sm">Joined {new Date(detail.created_at).toLocaleDateString()} · Nexus plan {detail.premium_tier || "free"}{detail.premium_until ? ` until ${new Date(detail.premium_until).toLocaleDateString()}` : ""}</p>
      <p className="text-sm">Acetate {detail.storage.premium ? (detail.storage.lifetime ? "lifetime" : "premium") : "free"} · library {fmtBytes(Number(detail.storage.bytes ?? 0))} · vault {fmtBytes(Number(detail.storage.vault_bytes ?? 0))}{detail.storage.vault_limit == null ? " unlimited" : ""}</p>
      <p className="text-sm">Open reports against them: {detail.reports}</p>
      {owner && <p className="mt-2 text-sm text-accent">This is the site owner. Other members cannot demote, ban, reset, or sign out this account.</p>}
      <div className="mt-3 flex flex-wrap gap-2 text-sm">
        {!owner && (
          <>
            <button type="button" className="rounded-full bg-chat px-3 py-1" onClick={() => confirm("Grant lifetime Acetate premium?") && void supabase.rpc("acetate_admin_set_premium", { p_user: detail.id, p_on: true }).then(onChanged)}>Acetate lifetime</button>
            <button type="button" className="rounded-full bg-chat px-3 py-1" onClick={() => confirm("Revoke Acetate premium?") && void supabase.rpc("acetate_admin_set_premium", { p_user: detail.id, p_on: false }).then(onChanged)}>Revoke Acetate</button>
            <button type="button" className="rounded-full bg-chat px-3 py-1" onClick={() => void supabase.rpc("admin_set_premium", { p_user: detail.id, p_tier: "lighting", p_days: 365 }).then(onChanged)}>Nexus Lighting 365d</button>
            <button type="button" className="rounded-full bg-chat px-3 py-1" onClick={() => confirm("Remove Nexus premium?") && void supabase.rpc("admin_set_premium", { p_user: detail.id, p_tier: null, p_days: null }).then(onChanged)}>Remove Nexus plan</button>
            {(["moderator", "vip", "member"] as SiteRole[]).map((role) => (
              <button key={role} type="button" className="rounded-full bg-chat px-3 py-1" onClick={() => confirm(`Set role to ${role}?`) && void setRole(detail.id, role).then(onChanged)}>{role}</button>
            ))}
            <button type="button" className="rounded-full bg-chat px-3 py-1 text-dnd" onClick={() => { const reason = window.prompt("Ban reason") || ""; if (confirm("Ban this account?")) void banUser(detail.id, null, reason).then(onChanged); }}>Ban</button>
            <button type="button" className="rounded-full bg-chat px-3 py-1" onClick={() => void unbanUser(detail.id).then(onChanged)}>Unban</button>
            <button type="button" className="rounded-full bg-chat px-3 py-1" onClick={() => confirm("Sign this account out everywhere?") && void supabase.rpc("admin_revoke_sessions", { p_user: detail.id }).then(({ error }) => toast(error ? errorText(error) : "Sessions revoked", error ? "error" : "success"))}>Sign out everywhere</button>
          </>
        )}
      </div>
      <h3 className="mt-4 font-semibold">Devices</h3>
      <ul className="text-sm text-sub">
        {detail.devices.map((device) => <li key={device.label + device.last_seen}>{device.label} · {device.platform || device.kind} · {new Date(device.last_seen).toLocaleString()}</li>)}
        {detail.devices.length === 0 && <li>No handsets.</li>}
      </ul>
      <h3 className="mt-3 font-semibold">Sessions</h3>
      <ul className="text-sm text-sub">
        {detail.sessions.map((session, index) => <li key={index}>{new Date(session.updated_at).toLocaleString()} · {session.ip || "ip hidden"} · {session.user_agent || "unknown client"}</li>)}
        {detail.sessions.length === 0 && <li>No sessions.</li>}
      </ul>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-side p-3"><div className="text-2xl font-black">{value}</div><div className="text-xs text-sub">{label}</div></div>;
}
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-3xl bg-side p-4"><h2 className="font-bold">{title}</h2><div className="mt-2">{children}</div></section>;
}
function Empty() {
  return <p className="text-sm text-sub">Nothing here.</p>;
}
function Bars({ rows }: { rows: { day: string; n: number }[] }) {
  const max = Math.max(1, ...rows.map((row) => Number(row.n)));
  if (!rows.length) return <p className="text-sm text-sub">No rows in this window.</p>;
  return (
    <div className="flex items-end gap-1">
      {rows.map((row) => (
        <div key={row.day} className="flex-1" title={`${row.day}: ${row.n}`}>
          <div className="rounded-t bg-accent" style={{ height: `${Math.max(4, (Number(row.n) / max) * 72)}px` }} />
          <div className="truncate text-[9px] text-sub">{row.day.slice(5)}</div>
        </div>
      ))}
    </div>
  );
}
function FlagRow({ label, on, set }: { label: string; on: boolean; set: (v: boolean) => void }) {
  return <label className="mt-2 flex items-center justify-between text-sm"><span>{label}</span><input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} /></label>;
}
