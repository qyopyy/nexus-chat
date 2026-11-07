"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Crown, ExternalLink, Flag, KeyRound, LogOut, Search, Trash2, X } from "lucide-react";
import { useApp, closeModal } from "@/store/app";
import { loadProfiles, openConversation } from "@/lib/data";
import { supabase, errorText } from "@/lib/supabase";
import { toast } from "@/store/app";
import { PLANS } from "@/lib/premium";
import {
  activity,
  getSiteSettings,
  listReports,
  renameUser,
  resolveReport,
  revokeSessions,
  saveSiteSettings,
  searchMessages,
  setPremium,
  REPORT_REASONS,
  type ActivityDay,
  type FoundMessage,
  type Report,
  type SiteSettings,
} from "@/lib/adminTools";
import { Toggle } from "@/components/modals/settingsUi";
import { cn } from "@/lib/utils";
import Avatar from "@/components/ui/Avatar";

const when = (iso: string) => new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
const reasonLabel = (r: string) => REPORT_REASONS.find((x) => x.id === r)?.label ?? r;

async function jumpTo(conversationId: string | null) {
  if (!conversationId) return;
  const { data } = await supabase.from("conversations").select("space_id").eq("id", conversationId).maybeSingle();
  closeModal();
  openConversation(conversationId, (data as { space_id: string | null } | null)?.space_id ?? null);
}

async function modDelete(messageId: string) {
  const { error } = await supabase.rpc("mod_delete_message", { p_id: messageId });
  if (error) toast(errorText(error), "error");
  else toast("Message deleted", "success");
  return !error;
}

/* ───────────────────────── activity chart (Overview) ───────────────────────── */
export function ActivityChart() {
  const [rows, setRows] = useState<ActivityDay[] | null>(null);
  const [days, setDays] = useState(14);
  const [metric, setMetric] = useState<"messages" | "active_users" | "signups">("messages");
  useEffect(() => {
    setRows(null);
    void activity(days).then(setRows);
  }, [days]);
  const max = Math.max(1, ...(rows ?? []).map((r) => r[metric]));
  const total = (rows ?? []).reduce((a, r) => a + r[metric], 0);
  const label = { messages: "Messages", active_users: "Active people", signups: "New members" }[metric];
  return (
    <div className="mt-4 rounded-xl bg-side p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="mr-auto">
          <div className="text-xs font-bold tracking-wide text-sub uppercase">{label} · last {days} days</div>
          <div className="text-2xl font-bold tabular-nums">{rows ? total.toLocaleString() : "…"}</div>
        </div>
        <div className="flex rounded-lg bg-rail p-0.5 text-xs font-semibold">
          {(["messages", "active_users", "signups"] as const).map((m) => (
            <button key={m} onClick={() => setMetric(m)} className={cn("rounded-md px-2.5 py-1", metric === m ? "bg-accent text-white" : "text-sub hover:text-txt")}>
              {{ messages: "Messages", active_users: "Active", signups: "Sign-ups" }[m]}
            </button>
          ))}
        </div>
        <div className="flex rounded-lg bg-rail p-0.5 text-xs font-semibold">
          {[7, 14, 30, 90].map((d) => (
            <button key={d} onClick={() => setDays(d)} className={cn("rounded-md px-2 py-1", days === d ? "bg-hover text-txt" : "text-sub hover:text-txt")}>
              {d}d
            </button>
          ))}
        </div>
      </div>
      <div className="flex h-32 items-end gap-[3px]" role="img" aria-label={`${label} per day`}>
        {(rows ?? Array.from({ length: days }, () => null)).map((r, i) => (
          <div key={r?.day ?? i} className="group relative flex h-full min-w-0 flex-1 items-end">
            <div className={cn("w-full rounded-t-[3px] transition-[height]", r ? "bg-accent/80 group-hover:bg-accent" : "animate-pulse bg-white/5")} style={{ height: r ? `${Math.max(2, (r[metric] / max) * 100)}%` : "30%" }} />
            {r && (
              <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 rounded-md bg-menu px-2 py-1 text-[11px] whitespace-nowrap shadow-xl ring-1 ring-white/10 group-hover:block">
                <b className="tabular-nums">{r[metric].toLocaleString()}</b> · {new Date(r.day + "T00:00:00").toLocaleDateString([], { month: "short", day: "numeric" })}
              </div>
            )}
          </div>
        ))}
      </div>
      {rows && rows.length > 0 && (
        <div className="mt-1 flex justify-between text-[10px] text-faint">
          <span>{new Date(rows[0].day + "T00:00:00").toLocaleDateString([], { month: "short", day: "numeric" })}</span>
          <span>Today</span>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── reports queue ───────────────────────── */
export function ReportsTab({ onModerate }: { onModerate?: (userId: string, username?: string) => void }) {
  const [status, setStatus] = useState<Report["status"] | "all">("open");
  const [rows, setRows] = useState<Report[] | null>(null);
  const profiles = useApp((s) => s.profiles);
  const load = useCallback(async () => {
    setRows(null);
    const r = await listReports(status);
    setRows(r);
    void loadProfiles(r.flatMap((x) => [x.reporter_id, x.target_user ?? "", x.resolved_by ?? ""]).filter(Boolean));
  }, [status]);
  useEffect(() => {
    void load();
  }, [load]);

  const act = async (r: Report, next: Report["status"], note?: string, del?: boolean) => {
    if (del && r.message_id && !(await modDelete(r.message_id))) return;
    if (await resolveReport(r.id, next, note)) setRows((rs) => (rs ?? []).filter((x) => status === "all" || x.id !== r.id).map((x) => (x.id === r.id ? { ...x, status: next } : x)));
  };

  // group repeat reports about the same message so the busiest show first
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of rows ?? []) if (r.message_id) m[r.message_id] = (m[r.message_id] ?? 0) + 1;
    return m;
  }, [rows]);

  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <div className="flex rounded-lg bg-side p-0.5 text-sm font-semibold">
          {(["open", "resolved", "dismissed", "all"] as const).map((s) => (
            <button key={s} onClick={() => setStatus(s)} className={cn("rounded-md px-3 py-1 capitalize", status === s ? "bg-accent text-white" : "text-sub hover:text-txt")}>
              {s}
            </button>
          ))}
        </div>
        <button onClick={() => void load()} className="ml-auto text-sm text-sub hover:text-txt">
          Refresh
        </button>
      </div>
      {!rows ? (
        <p className="py-6 text-center text-sub">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-xl bg-side py-10 text-center text-sub">
          <Flag className="mx-auto mb-2 size-6 opacity-60" />
          {status === "open" ? "No open reports — all clear." : "Nothing here."}
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const target = r.target_user ? profiles[r.target_user] : undefined;
            return (
              <div key={r.id} className="rounded-xl bg-side p-3">
                <div className="flex items-start gap-3">
                  {r.target_user ? <Avatar userId={r.target_user} size={36} plain /> : <span className="grid size-9 place-items-center rounded-full bg-rail">?</span>}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 text-sm">
                      <b>{target?.display_name ?? "Unknown"}</b>
                      {target && <span className="text-sub">@{target.username}</span>}
                      <span className="rounded bg-dnd/15 px-1.5 py-0.5 text-[11px] font-bold text-dnd">{reasonLabel(r.reason)}</span>
                      {r.message_id && (counts[r.message_id] ?? 0) > 1 && <span className="rounded bg-idle/20 px-1.5 py-0.5 text-[11px] font-bold text-idle">{counts[r.message_id]} reports</span>}
                      {r.status !== "open" && <span className="rounded bg-white/10 px-1.5 py-0.5 text-[11px] font-semibold capitalize text-sub">{r.status}</span>}
                    </div>
                    {r.excerpt && <blockquote className="mt-1.5 line-clamp-4 rounded-lg border-l-2 border-dnd/60 bg-black/20 px-2.5 py-1.5 text-sm break-words whitespace-pre-wrap">{r.excerpt}</blockquote>}
                    {r.details && <p className="mt-1.5 text-sm text-sub">“{r.details}”</p>}
                    <div className="mt-1 text-xs text-faint">
                      Reported by {profiles[r.reporter_id]?.display_name ?? "someone"} · {when(r.created_at)}
                      {r.resolution && ` · ${r.resolution}`}
                    </div>
                  </div>
                </div>
                {r.status === "open" ? (
                  <div className="mt-2.5 flex flex-wrap gap-1.5 pl-12">
                    {r.message_id && (
                      <button onClick={() => void act(r, "resolved", "Message deleted", true)} className="flex items-center gap-1 rounded-full bg-dnd px-3 py-1 text-xs font-bold text-white hover:bg-dnd/85">
                        <Trash2 className="size-3.5" /> Delete message
                      </button>
                    )}
                    {r.target_user && (
                      <button
                        onClick={() => {
                          void act(r, "resolved", "Handled on profile");
                          onModerate?.(r.target_user!, target?.username);
                        }}
                        className="rounded-full bg-hover px-3 py-1 text-xs font-semibold hover:bg-white/15"
                      >
                        Moderate member
                      </button>
                    )}
                    {r.conversation_id && (
                      <button onClick={() => void jumpTo(r.conversation_id)} className="flex items-center gap-1 rounded-full bg-hover px-3 py-1 text-xs font-semibold hover:bg-white/15">
                        <ExternalLink className="size-3.5" /> Open chat
                      </button>
                    )}
                    <button onClick={() => void act(r, "resolved", "Reviewed")} className="flex items-center gap-1 rounded-full bg-ok/20 px-3 py-1 text-xs font-bold text-ok hover:bg-ok/30">
                      <Check className="size-3.5" /> Resolve
                    </button>
                    <button onClick={() => void act(r, "dismissed", "No action needed")} className="flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold text-sub hover:bg-hover hover:text-txt">
                      <X className="size-3.5" /> Dismiss
                    </button>
                  </div>
                ) : (
                  <div className="mt-2 pl-12">
                    <button onClick={() => void act(r, "open")} className="text-xs text-sub hover:text-txt">
                      Reopen
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

/* ───────────────────────── site-wide message search ───────────────────────── */
export function MessageSearchTab() {
  const [q, setQ] = useState("");
  const [who, setWho] = useState("");
  const [serversOnly, setServersOnly] = useState(true);
  const [rows, setRows] = useState<FoundMessage[] | null>(null);
  const [busy, setBusy] = useState(false);
  const profiles = useApp((s) => s.profiles);

  const run = async () => {
    setBusy(true);
    let userId: string | null = null;
    const uname = who.trim().replace(/^@/, "").toLowerCase();
    if (uname) {
      const { data } = await supabase.from("profiles").select("id").eq("username", uname).maybeSingle();
      userId = (data as { id: string } | null)?.id ?? null;
      if (!userId) {
        setBusy(false);
        return toast(`No member @${uname}`, "error");
      }
    }
    const r = await searchMessages(q, userId, serversOnly);
    setRows(r);
    void loadProfiles(r.map((x) => x.author_id));
    setBusy(false);
  };

  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
        className="mb-2 flex flex-wrap gap-2"
      >
        <div className="relative min-w-48 flex-[2]">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-sub" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Words in the message" className="w-full rounded-lg bg-rail py-2.5 pr-3 pl-9 outline-none focus:ring-2 focus:ring-accent/60" />
        </div>
        <input value={who} onChange={(e) => setWho(e.target.value)} placeholder="@username (optional)" className="min-w-36 flex-1 rounded-lg bg-rail px-3 py-2.5 outline-none focus:ring-2 focus:ring-accent/60" />
        <button disabled={busy || (q.trim().length < 2 && !who.trim())} className="rounded-lg bg-accent px-4 font-semibold text-white disabled:opacity-40">
          {busy ? "Searching…" : "Search"}
        </button>
      </form>
      <label className="mb-1 flex items-center gap-2 text-sm text-sub">
        <input type="checkbox" checked={!serversOnly} onChange={(e) => setServersOnly(!e.target.checked)} className="accent-accent" />
        Include private DMs and group chats
      </label>
      <p className="mb-4 text-xs text-faint">Every search is written to the Audit Log. Use it for reports and safety issues only.</p>
      {rows && rows.length === 0 && <p className="py-6 text-center text-sub">No messages found.</p>}
      <div className="space-y-1.5">
        {(rows ?? []).map((m) => (
          <div key={m.id} className={cn("flex items-start gap-3 rounded-lg bg-side p-2.5", m.deleted_at && "opacity-50")}>
            <Avatar userId={m.author_id} size={32} plain />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 text-xs text-sub">
                <b className="text-sm text-txt">{profiles[m.author_id]?.display_name ?? "…"}</b>
                <span>{m.space_name ? `${m.space_name} · #${m.conv_name ?? "channel"}` : m.conv_kind === "dm" ? "Direct message" : (m.conv_name ?? "Group chat")}</span>
                <span>{when(m.created_at)}</span>
                {m.deleted_at && <span className="font-semibold text-dnd">deleted</span>}
              </div>
              <div className="mt-0.5 line-clamp-3 text-sm break-words whitespace-pre-wrap">{m.content || (m.attachment_name ? `📎 ${m.attachment_name}` : "—")}</div>
            </div>
            <div className="flex shrink-0 gap-1">
              <button onClick={() => void jumpTo(m.conversation_id)} className="grid size-8 place-items-center rounded-md text-sub hover:bg-hover hover:text-txt" title="Open chat" aria-label="Open chat">
                <ExternalLink className="size-4" />
              </button>
              {!m.deleted_at && (
                <button
                  onClick={() => confirm("Delete this message for everyone?") && void modDelete(m.id).then((ok) => ok && setRows((rs) => (rs ?? []).map((x) => (x.id === m.id ? { ...x, deleted_at: new Date().toISOString() } : x))))}
                  className="grid size-8 place-items-center rounded-md text-sub hover:bg-dnd/15 hover:text-dnd"
                  title="Delete message"
                  aria-label="Delete message"
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/* ───────────────────────── site settings ───────────────────────── */
const WAITS = [0, 5, 10, 30, 60, 360, 1440];
export function SiteSettingsTab() {
  const [s, setS] = useState<SiteSettings | null>(null);
  const [words, setWords] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    void getSiteSettings().then((r) => {
      setS(r);
      setWords((r?.blocked_words ?? []).join(", "));
    });
  }, []);
  if (!s) return <p className="text-sub">Loading…</p>;
  const save = async (patch: Partial<SiteSettings>) => {
    const next = { ...s, ...patch };
    setS(next);
    setSaving(true);
    const out = await saveSiteSettings({
      signups_open: next.signups_open,
      read_only: next.read_only,
      new_account_minutes: next.new_account_minutes,
      blocked_words: words.split(/[,\n]/).map((w) => w.trim()).filter(Boolean),
    });
    setSaving(false);
    if (out) {
      setS(out);
      setWords(out.blocked_words.join(", "));
    }
  };
  return (
    <div className="space-y-6">
      {(!s.signups_open || s.read_only) && (
        <div className="rounded-xl bg-idle/15 p-3 text-sm text-idle ring-1 ring-idle/30">
          {!s.signups_open && "Sign-ups are closed. "}
          {s.read_only && "Read-only mode is on — only staff can post."}
        </div>
      )}
      <section>
        <div className="mb-1 text-xs font-bold tracking-wide text-sub uppercase">Access</div>
        <Toggle label="Allow new sign-ups" hint="Off blocks every new account — email, phone, Google and Apple sign-in. Existing members are not affected." checked={s.signups_open} onChange={(v) => void save({ signups_open: v })} />
        <Toggle label="Read-only mode" hint="Only staff can send messages. Use during raids, spam waves or maintenance." checked={s.read_only} onChange={(v) => (!v || confirm("Turn on read-only mode for everyone?")) && void save({ read_only: v })} />
      </section>
      <section>
        <div className="mb-1 text-xs font-bold tracking-wide text-sub uppercase">Anti-spam</div>
        <div className="flex items-center justify-between gap-4 border-b border-line/60 py-3">
          <span>
            <span className="block font-medium">New-account wait</span>
            <span className="block text-sm text-sub">Brand-new accounts must wait before their first message. Stops throwaway spam bots.</span>
          </span>
          <select value={s.new_account_minutes} onChange={(e) => void save({ new_account_minutes: Number(e.target.value) })} className="shrink-0 rounded-md bg-rail px-2 py-2 text-sm outline-none">
            {WAITS.map((m) => (
              <option key={m} value={m}>
                {m === 0 ? "Off" : m < 60 ? `${m} minutes` : m < 1440 ? `${m / 60} hour${m > 60 ? "s" : ""}` : "1 day"}
              </option>
            ))}
          </select>
        </div>
        <div className="py-3">
          <div className="font-medium">Blocked words</div>
          <p className="mb-2 text-sm text-sub">Messages with these whole words are refused everywhere on Nexus (staff are exempt). Separate with commas. Servers can add their own in AutoMod.</p>
          <textarea value={words} onChange={(e) => setWords(e.target.value)} rows={3} placeholder="word, another word" className="w-full rounded-lg bg-rail p-2.5 text-sm outline-none focus:ring-2 focus:ring-accent/60" />
          <button disabled={saving} onClick={() => void save({})} className="mt-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {saving ? "Saving…" : "Save words"}
          </button>
        </div>
      </section>
      <p className="text-xs text-faint">Last changed {when(s.updated_at)}. Changes are logged in the Audit Log.</p>
    </div>
  );
}

/* ───────────────────────── extra member tools (inside Members → member) ───────────────────────── */
export function MemberAdminExtras({ userId, canManage, onChanged }: { userId: string; canManage: boolean; onChanged: () => void }) {
  const p = useApp((s) => s.profiles[userId]);
  const [tier, setTier] = useState("lighting");
  const [days, setDays] = useState(30);
  const [uname, setUname] = useState(p?.username ?? "");
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState<FoundMessage[] | null>(null);
  const premiumUntil = (p as { premium_until?: string | null } | undefined)?.premium_until;
  const premiumTier = (p as { premium_tier?: string | null } | undefined)?.premium_tier;
  const active = !!premiumTier && !!premiumUntil && new Date(premiumUntil) > new Date();

  const refresh = async () => {
    const { data } = await supabase.from("profiles").select("*").eq("id", userId).single();
    if (data) useApp.setState((s) => ({ profiles: { ...s.profiles, [userId]: data } }));
    onChanged();
  };
  const run = async (fn: () => Promise<boolean>) => {
    setBusy(true);
    if (await fn()) await refresh();
    setBusy(false);
  };

  return (
    <>
      <section>
        <div className="mb-2 flex items-center gap-1.5 text-xs font-bold tracking-wide text-sub uppercase">
          <Crown className="size-3.5" /> Premium
        </div>
        <div className="rounded-lg bg-side p-3">
          <p className="mb-2 text-sm">
            {active ? (
              <>
                On <b>{PLANS.find((x) => x.id === premiumTier)?.name ?? premiumTier}</b> until {new Date(premiumUntil!).toLocaleDateString()}
              </>
            ) : (
              <span className="text-sub">No active plan</span>
            )}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <select value={tier} onChange={(e) => setTier(e.target.value)} className="rounded-md bg-rail px-2 py-1.5 text-sm outline-none">
              {PLANS.map((pl) => (
                <option key={pl.id} value={pl.id}>
                  {pl.name}
                </option>
              ))}
            </select>
            <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="rounded-md bg-rail px-2 py-1.5 text-sm outline-none">
              {[7, 30, 90, 365, 3650].map((d) => (
                <option key={d} value={d}>
                  {d === 3650 ? "Lifetime (10 yrs)" : d === 365 ? "1 year" : `${d} days`}
                </option>
              ))}
            </select>
            <button disabled={busy} onClick={() => void run(() => setPremium(userId, tier, days))} className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
              {active ? "Extend" : "Give"}
            </button>
            {active && (
              <button disabled={busy} onClick={() => confirm("Remove this member's premium plan?") && void run(() => setPremium(userId, null, 0))} className="rounded-md px-3 py-1.5 text-sm font-semibold text-dnd hover:bg-dnd/10">
                Remove
              </button>
            )}
          </div>
        </div>
      </section>

      {canManage && (
        <section>
          <div className="mb-2 flex items-center gap-1.5 text-xs font-bold tracking-wide text-sub uppercase">
            <KeyRound className="size-3.5" /> Account
          </div>
          <div className="space-y-2 rounded-lg bg-side p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-sub">@</span>
              <input value={uname} onChange={(e) => setUname(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, "").slice(0, 24))} className="w-44 rounded-md bg-rail px-2 py-1.5 font-mono text-sm outline-none" aria-label="Username" />
              <button
                disabled={busy || !uname || uname === p?.username}
                onClick={() => confirm(`Change @${p?.username} to @${uname}?`) && void run(() => renameUser(userId, uname))}
                className="rounded-md bg-hover px-3 py-1.5 text-sm font-semibold disabled:opacity-40"
              >
                Rename
              </button>
            </div>
            <button disabled={busy} onClick={() => confirm("Sign this member out on every device? They can sign back in.") && void run(() => revokeSessions(userId))} className="flex items-center gap-1.5 text-sm text-sub hover:text-txt">
              <LogOut className="size-4" /> Sign out of all devices
            </button>
          </div>
        </section>
      )}

      <section>
        <div className="mb-2 text-xs font-bold tracking-wide text-sub uppercase">Recent messages in servers</div>
        {recent === null ? (
          <button onClick={() => void searchMessages("", userId, true).then((r) => setRecent(r.slice(0, 20)))} className="rounded-md bg-hover px-3 py-1.5 text-sm font-semibold">
            Show last 20
          </button>
        ) : recent.length === 0 ? (
          <p className="text-sm text-sub">No server messages.</p>
        ) : (
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {recent.map((m) => (
              <div key={m.id} className={cn("flex items-start gap-2 rounded-md bg-side px-2.5 py-1.5 text-sm", m.deleted_at && "opacity-50")}>
                <span className="shrink-0 text-xs text-faint">{when(m.created_at)}</span>
                <span className="min-w-0 flex-1 truncate">{m.content || (m.attachment_name ? `📎 ${m.attachment_name}` : "—")}</span>
                <span className="shrink-0 text-xs text-sub">{m.space_name}</span>
                {!m.deleted_at && (
                  <button onClick={() => void modDelete(m.id).then((ok) => ok && setRecent((rs) => (rs ?? []).map((x) => (x.id === m.id ? { ...x, deleted_at: new Date().toISOString() } : x))))} className="shrink-0 text-sub hover:text-dnd" aria-label="Delete message">
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
