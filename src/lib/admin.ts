"use client";

import { supabase, errorText } from "./supabase";
import { useApp, toast } from "@/store/app";
import { roleRank } from "./theme";
import type { AdminAction, AdminUserRow, Badge, Profile, UserBadge } from "./types";

export async function refreshBadges() {
  const [{ data: b }, { data: ub }] = await Promise.all([
    supabase.from("badges").select("*").is("archived_at", null).order("priority", { ascending: false }),
    supabase.from("user_badges").select("user_id,badge_id,granted_at").is("revoked_at", null),
  ]);
  const badges: Record<string, Badge> = {};
  for (const x of (b ?? []) as Badge[]) badges[x.id] = x;
  const userBadges: Record<string, string[]> = {};
  for (const x of (ub ?? []) as UserBadge[]) (userBadges[x.user_id] ??= []).push(x.badge_id);
  useApp.setState({ badges, userBadges });
}

export function myRank() {
  const s = useApp.getState();
  return roleRank(s.userId ? s.profiles[s.userId]?.site_role : null);
}

async function call<T = unknown>(fn: string, args: Record<string, unknown>, ok?: string): Promise<T | null> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    toast(errorText(error), "error");
    return null;
  }
  if (ok) toast(ok, "success");
  return (data as T) ?? (true as unknown as T);
}

async function refreshProfile(id: string) {
  const { data } = await supabase.from("profiles").select("*").eq("id", id).single();
  if (data) useApp.setState((s) => ({ profiles: { ...s.profiles, [id]: data as Profile } }));
}

export async function setRole(userId: string, role: Profile["site_role"]) {
  const r = await call("admin_set_role", { p_user: userId, p_role: role }, "Role updated");
  if (r) await refreshProfile(userId);
  return !!r;
}

export async function grantBadge(userId: string, badgeId: string) {
  const r = await call("admin_grant_badge", { p_user: userId, p_badge: badgeId });
  if (r) await refreshBadges();
}

export async function revokeBadge(userId: string, badgeId: string) {
  const r = await call("admin_revoke_badge", { p_user: userId, p_badge: badgeId });
  if (r) await refreshBadges();
}

export async function createBadge(name: string, icon: string, color: string, description: string) {
  const r = await call("admin_create_badge", { p_name: name, p_icon: icon, p_color: color, p_description: description }, "Badge created");
  if (r) await refreshBadges();
}

export async function deleteBadge(id: string) {
  const r = await call("admin_delete_badge", { p_badge: id }, "Badge deleted");
  if (r) await refreshBadges();
}

/** minutes null = permanent ban */
export async function banUser(userId: string, minutes: number | null, reason: string) {
  const r = await call("admin_ban", { p_user: userId, p_minutes: minutes, p_reason: reason }, minutes ? "User timed out" : "User banned");
  if (r) await refreshProfile(userId);
  return !!r;
}

export async function unbanUser(userId: string) {
  const r = await call("admin_unban", { p_user: userId }, "User unbanned");
  if (r) await refreshProfile(userId);
  return !!r;
}

export async function resetProfile(userId: string) {
  const r = await call("admin_reset_profile", { p_user: userId }, "Profile reset");
  if (r) await refreshProfile(userId);
}

export async function listUsers(search: string): Promise<AdminUserRow[]> {
  const { data, error } = await supabase.rpc("admin_list_users", { p_search: search, p_limit: 200 });
  if (error) {
    toast(errorText(error), "error");
    return [];
  }
  return (data ?? []) as AdminUserRow[];
}

export async function adminStats(): Promise<Record<string, number> | null> {
  const { data, error } = await supabase.rpc("admin_stats");
  if (error) return null;
  return data as Record<string, number>;
}

export async function auditLog(): Promise<AdminAction[]> {
  const { data } = await supabase.from("admin_actions").select("*").order("id", { ascending: false }).limit(60);
  return (data ?? []) as AdminAction[];
}

export function isBanned(p: Profile | undefined) {
  if (!p?.banned_until) return false;
  return p.banned_until === "infinity" || new Date(p.banned_until).getTime() > Date.now();
}

/** until = ISO time, or null for permanent */
export async function banUntil(userId: string, until: string | null, reason: string) {
  const r = await call("admin_ban_until", { p_user: userId, p_until: until, p_reason: reason }, until ? `Suspended until ${new Date(until).toLocaleString()}` : "User banned");
  if (r) await refreshProfile(userId);
  return !!r;
}

/** Remove messaging ability until a time (null lifts it) */
export async function muteUser(userId: string, until: string | null, reason: string) {
  const r = await call("admin_mute", { p_user: userId, p_until: until, p_reason: reason }, until ? `Messaging blocked until ${new Date(until).toLocaleString()}` : "Messaging restored");
  if (r) await refreshProfile(userId);
  return !!r;
}

export function isMuted(p: { muted_until?: string | null } | undefined) {
  if (!p?.muted_until) return false;
  return p.muted_until === "infinity" || new Date(p.muted_until).getTime() > Date.now();
}

export async function toggleBadge(userId: string, badgeId: string) {
  const has = (useApp.getState().userBadges[userId] ?? []).includes(badgeId);
  return has ? revokeBadge(userId, badgeId) : grantBadge(userId, badgeId);
}

export async function reviewClaim(id: string, approve: boolean) {
  return call("admin_review_claim", { p_claim: id, p_approve: approve }, approve ? "Claim approved — artist page is live" : "Claim rejected");
}

// ---------------------------------------------------------------- file vault (admin password)
let vaultToken: { token: string; exp: number } | null = null;

export const vaultUnlocked = () => !!vaultToken && vaultToken.exp > Date.now();

async function vault<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("vault", { body });
  if (error) {
    let msg = errorText(error);
    try {
      const j = await (error as { context?: Response }).context?.json();
      if (j?.error) msg = j.error;
      if (j?.locked) vaultToken = null;
    } catch {
      /* not json */
    }
    throw new Error(msg);
  }
  return data as T;
}

export async function unlockVault(password: string) {
  const r = await vault<{ token: string; exp: number }>({ action: "unlock", password });
  vaultToken = r;
  return true;
}

export function lockVault() {
  vaultToken = null;
}

export type VaultItem = { name: string; folder: boolean; size: number | null; type: string | null; created_at: string | null };

export async function vaultList(bucket: string, prefix: string) {
  return (await vault<{ items: VaultItem[] }>({ action: "list", token: vaultToken?.token, bucket, prefix })).items;
}

export async function vaultSign(bucket: string, path: string) {
  return (await vault<{ url: string }>({ action: "sign", token: vaultToken?.token, bucket, path })).url;
}

export async function vaultSignUrl(url: string) {
  return (await vault<{ url: string }>({ action: "sign", token: vaultToken?.token, url })).url;
}
