"use client";

import { supabase, errorText } from "./supabase";
import { toast } from "@/store/app";
import { refreshSpaces } from "./data";

export type VerifyRequest = {
  id: number;
  space_id: string;
  requested_by: string;
  reason: string;
  links: string[];
  status: "pending" | "approved" | "rejected";
  note: string | null;
  reviewed_at: string | null;
  created_at: string;
};

export type VerifiedServer = { id: string; name: string; icon_url: string | null; icon_color: string; role: "owner" | "admin"; invite: string };

export async function latestVerifyRequest(spaceId: string): Promise<VerifyRequest | null> {
  const { data } = await supabase.from("space_verification_requests").select("*").eq("space_id", spaceId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  return (data as VerifyRequest | null) ?? null;
}

export async function applyForVerification(spaceId: string, reason: string, links: string[]) {
  const { data, error } = await supabase.rpc("apply_space_verification", { p_space: spaceId, p_reason: reason, p_links: links });
  if (error) {
    toast(errorText(error), "error");
    return null;
  }
  toast("Application sent — Nexus Bot will DM you with the decision", "success");
  return data as VerifyRequest;
}

/* staff (admin rank 3+) */
export type VerifyQueueRow = VerifyRequest & {
  space?: { name: string; icon_url: string | null; icon_color: string; verified: boolean } | null;
  members?: number;
};

export async function listVerifyRequests(status: "pending" | "approved" | "rejected" = "pending"): Promise<VerifyQueueRow[]> {
  const { data, error } = await supabase.rpc("admin_list_space_verifications", { p_status: status });
  if (error) {
    toast(errorText(error), "error");
    return [];
  }
  return ((data as VerifyQueueRow[] | null) ?? []).map((r) => ({ ...r, links: r.links ?? [] }));
}

export async function reviewVerifyRequest(id: number, approve: boolean, note?: string) {
  const { error } = await supabase.rpc("admin_review_space_verification", { p_id: id, p_approve: approve, p_note: note || null });
  if (error) {
    toast(errorText(error), "error");
    return false;
  }
  toast(approve ? "Server verified ✓" : "Application declined", "success");
  void refreshSpaces();
  return true;
}

export async function setServerVerified(spaceId: string, on: boolean) {
  const { error } = await supabase.rpc("admin_set_space_verified", { p_space: spaceId, p_on: on });
  if (error) {
    toast(errorText(error), "error");
    return false;
  }
  void refreshSpaces();
  return true;
}

const vsCache = new Map<string, { at: number; list: VerifiedServer[] }>();
export async function profileVerifiedServers(userId: string): Promise<VerifiedServer[]> {
  const hit = vsCache.get(userId);
  if (hit && Date.now() - hit.at < 60_000) return hit.list;
  const { data } = await supabase.rpc("profile_verified_servers", { p_user: userId });
  const list = ((data as VerifiedServer[] | null) ?? []).filter(Boolean);
  vsCache.set(userId, { at: Date.now(), list });
  return list;
}
