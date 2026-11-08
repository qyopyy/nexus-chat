"use client";

import { create } from "zustand";
import { supabase, errorText } from "./supabase";
import { toast } from "@/store/app";

/* ───────────── reports ───────────── */
export const REPORT_REASONS = [
  { id: "spam", label: "Spam or ads" },
  { id: "harassment", label: "Harassment or bullying" },
  { id: "hate", label: "Hate speech" },
  { id: "nsfw", label: "Sexual or graphic content" },
  { id: "scam", label: "Scam, phishing or malware" },
  { id: "impersonation", label: "Pretending to be someone" },
  { id: "other", label: "Something else" },
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number]["id"];

export type Report = {
  id: number;
  reporter_id: string;
  target_user: string | null;
  message_id: string | null;
  conversation_id: string | null;
  excerpt: string | null;
  reason: ReportReason;
  details: string | null;
  status: "open" | "resolved" | "dismissed";
  resolved_by: string | null;
  resolved_at: string | null;
  resolution: string | null;
  created_at: string;
};

/** who/what the report dialog is about — opened from a message menu or a profile */
export const useReportDialog = create<{ target: { messageId?: string; userId?: string; excerpt?: string; name?: string } | null }>(() => ({ target: null }));
export const openReport = (target: { messageId?: string; userId?: string; excerpt?: string; name?: string }) => useReportDialog.setState({ target });

export async function fileReport(reason: ReportReason, details: string, target: { messageId?: string; userId?: string }) {
  const { error } = await supabase.rpc("file_report", { p_reason: reason, p_details: details, p_message: target.messageId ?? null, p_user: target.userId ?? null });
  if (error) {
    toast(errorText(error), "error");
    return false;
  }
  toast("Thanks — the Nexus team will review it", "success");
  return true;
}

export async function listReports(status: Report["status"] | "all" = "open") {
  let q = supabase.from("reports").select("*").order("created_at", { ascending: false }).limit(100);
  if (status !== "all") q = q.eq("status", status);
  const { data, error } = await q;
  if (error) toast(errorText(error), "error");
  return (data ?? []) as Report[];
}

/** open-report count for the Admin tab label (refreshed when the panel opens and after resolving) */
export const useReportBadge = create<{ open: number }>(() => ({ open: 0 }));
export async function refreshReportBadge() {
  const { count } = await supabase.from("reports").select("id", { count: "exact", head: true }).eq("status", "open");
  useReportBadge.setState({ open: count ?? 0 });
}

export async function resolveReport(id: number, status: Report["status"], note?: string) {
  const { error } = await supabase.rpc("admin_resolve_report", { p_id: id, p_status: status, p_resolution: note ?? null });
  if (error) toast(errorText(error), "error");
  else void refreshReportBadge();
  return !error;
}

/* ───────────── site settings ───────────── */
export type SiteSettings = { signups_open: boolean; read_only: boolean; new_account_minutes: number; blocked_words: string[]; updated_at: string; updated_by: string | null };

export async function getSiteSettings() {
  const { data } = await supabase.from("site_settings").select("*").eq("id", 1).maybeSingle();
  return (data as SiteSettings | null) ?? null;
}

export async function saveSiteSettings(s: Pick<SiteSettings, "signups_open" | "read_only" | "new_account_minutes" | "blocked_words">) {
  const { data, error } = await supabase.rpc("admin_update_site_settings", {
    p_signups_open: s.signups_open,
    p_read_only: s.read_only,
    p_new_account_minutes: s.new_account_minutes,
    p_blocked_words: s.blocked_words,
  });
  if (error) {
    toast(errorText(error), "error");
    return null;
  }
  toast("Site settings saved", "success");
  return data as SiteSettings;
}

/* ───────────── message search ───────────── */
export type FoundMessage = {
  id: string;
  conversation_id: string;
  author_id: string;
  content: string | null;
  attachment_name: string | null;
  created_at: string;
  deleted_at: string | null;
  conv_kind: string;
  conv_name: string | null;
  space_name: string | null;
};

export async function searchMessages(query: string, userId: string | null, serversOnly: boolean) {
  const { data, error } = await supabase.rpc("admin_search_messages", { p_query: query, p_user: userId, p_servers_only: serversOnly, p_limit: 100 });
  if (error) {
    toast(errorText(error), "error");
    return [];
  }
  return (data ?? []) as FoundMessage[];
}

/* ───────────── members ───────────── */
export async function setPremium(userId: string, tier: string | null, days: number) {
  const { error } = await supabase.rpc("admin_set_premium", { p_user: userId, p_tier: tier, p_days: tier ? days : null });
  if (error) toast(errorText(error), "error");
  else toast(tier ? `Gave ${days} days of ${tier}` : "Premium removed", "success");
  return !error;
}

export async function revokeSessions(userId: string) {
  const { data, error } = await supabase.rpc("admin_revoke_sessions", { p_user: userId });
  if (error) toast(errorText(error), "error");
  else toast(`Signed out of ${Number(data ?? 0)} session(s)`, "success");
  return !error;
}

export async function renameUser(userId: string, username: string) {
  const { error } = await supabase.rpc("admin_set_username", { p_user: userId, p_username: username });
  if (error) toast(errorText(error), "error");
  else toast(`Username is now @${username.toLowerCase()}`, "success");
  return !error;
}

export type ActivityDay = { day: string; signups: number; messages: number; active_users: number };
export async function activity(days = 14) {
  const { data, error } = await supabase.rpc("admin_activity", { p_days: days });
  if (error) return [];
  return (data ?? []) as ActivityDay[];
}

/* ───────────── your account ───────────── */
export type NotifPrefs = {
  dms: boolean;
  groups: boolean;
  mentions: boolean;
  calls: boolean;
  previews: boolean;
  quiet_enabled: boolean;
  quiet_start: number;
  quiet_end: number;
  quiet_allow_calls: boolean;
  tz: string;
  /** Wump: "<friend> is Live" (present once the column exists) */
  wump_live?: boolean;
};
export const NOTIF_DEFAULTS: NotifPrefs = { dms: true, groups: true, mentions: true, calls: true, previews: true, quiet_enabled: false, quiet_start: 22 * 60, quiet_end: 8 * 60, quiet_allow_calls: true, tz: "UTC" };

export async function getNotifPrefs(userId: string): Promise<NotifPrefs> {
  const { data } = await supabase.from("notification_prefs").select("*").eq("user_id", userId).maybeSingle();
  const tz = (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
      return "UTC";
    }
  })();
  return { ...NOTIF_DEFAULTS, tz, ...((data as Partial<NotifPrefs> | null) ?? {}) };
}

export async function saveNotifPrefs(userId: string, p: NotifPrefs) {
  const { error } = await supabase.from("notification_prefs").upsert({ user_id: userId, ...p, updated_at: new Date().toISOString() });
  if (error) toast(errorText(error), "error");
  return !error;
}

export async function deleteMyAccount(confirmUsername: string) {
  const { error } = await supabase.rpc("delete_my_account", { p_confirm: confirmUsername });
  if (error) {
    toast(errorText(error), "error");
    return false;
  }
  await supabase.auth.signOut().catch(() => undefined);
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith("nexus") || k.startsWith("sb-")) localStorage.removeItem(k);
  } catch {
    /* storage unavailable */
  }
  location.replace("/");
  return true;
}

/** minutes after midnight ⇄ "HH:MM" for <input type="time"> */
export const toHHMM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
export const fromHHMM = (s: string) => {
  const [h, m] = s.split(":").map(Number);
  return Math.max(0, Math.min(1439, (h || 0) * 60 + (m || 0)));
};

/** CSV download of the member list the admin is looking at */
export function downloadCsv(rows: Record<string, unknown>[], filename: string) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    // neutralise spreadsheet formulas
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
