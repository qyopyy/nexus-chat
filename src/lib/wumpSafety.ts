"use client";

import { supabase, errorText } from "./supabase";
import { useApp } from "@/store/app";

export type SafetyContact = {
  owner_id: string;
  contact_id: string;
  status: "pending" | "accepted" | "declined";
  created_at: string;
};

export type SafetyCheck = {
  id: string;
  user_id: string;
  contact_id: string;
  note: string | null;
  due_at: string;
  status: "active" | "ok" | "cancelled" | "missed";
  notified_at: string | null;
  created_at: string;
};

export async function safetyContacts() {
  const me = useApp.getState().userId;
  if (!me) return [] as SafetyContact[];
  const { data, error } = await supabase
    .from("wump_safety_contacts")
    .select("owner_id, contact_id, status, created_at")
    .or(`owner_id.eq.${me},contact_id.eq.${me}`);
  if (error) return [] as SafetyContact[];
  return (data ?? []) as SafetyContact[];
}

export async function safetyChecks() {
  const me = useApp.getState().userId;
  if (!me) return [] as SafetyCheck[];
  const { data, error } = await supabase
    .from("wump_safety_checks")
    .select("id, user_id, contact_id, note, due_at, status, notified_at, created_at")
    .or(`user_id.eq.${me},contact_id.eq.${me}`)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) return [] as SafetyCheck[];
  return (data ?? []) as SafetyCheck[];
}

export async function inviteSafetyContact(contactId: string) {
  const { error } = await supabase.rpc("wump_safety_invite", { p_contact: contactId });
  if (error) throw new Error(errorText(error));
}

export async function respondSafetyContact(ownerId: string, accept: boolean) {
  const { error } = await supabase.rpc("wump_safety_respond", { p_owner: ownerId, p_accept: accept });
  if (error) throw new Error(errorText(error));
}

export async function removeSafetyContact(ownerId: string, contactId: string) {
  const { error } = await supabase.from("wump_safety_contacts").delete().eq("owner_id", ownerId).eq("contact_id", contactId);
  if (error) throw new Error(errorText(error));
}

export async function startSafetyCheck(contactId: string, dueAt: string, note: string) {
  const { data, error } = await supabase.rpc("wump_safety_start", {
    p_contact: contactId,
    p_due: dueAt,
    p_note: note.trim() || null,
  });
  if (error) throw new Error(errorText(error));
  return data as string;
}

export async function resolveSafetyCheck(id: string, status: "ok" | "cancelled") {
  const { error } = await supabase.rpc("wump_safety_resolve", { p_id: id, p_status: status });
  if (error) throw new Error(errorText(error));
}

export async function sweepSafetyChecks() {
  const { error } = await supabase.rpc("wump_safety_sweep");
  if (error) return;
}
