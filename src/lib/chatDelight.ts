"use client";

import { supabase, errorText } from "./supabase";
import { toast } from "@/store/app";
import { loadProfiles } from "./data";
import type { Message } from "./types";

export type SavedRow = {
  saved_at: string;
  message_id: string;
  conversation_id: string;
  author_id: string;
  content: string;
  attachment_name: string | null;
  attachment_type: string | null;
  created_at: string;
};

export type PinRow = {
  conversation_id: string;
  message_id: string;
  pinned_by: string | null;
  pinned_at: string;
  messages?: Message | Message[] | null;
};

export async function toggleSaveMessage(messageId: string): Promise<boolean | null> {
  const { data, error } = await supabase.rpc("toggle_save_message", { p_message: messageId });
  if (error) {
    toast(errorText(error), "error");
    return null;
  }
  const on = !!data;
  toast(on ? "Saved" : "Removed from saved", "success");
  return on;
}

export async function isMessageSaved(messageId: string) {
  const { data } = await supabase.from("message_saves").select("message_id").eq("message_id", messageId).maybeSingle();
  return !!data;
}

export async function listSavedMessages(limit = 50) {
  const { data, error } = await supabase.rpc("list_saved_messages", { p_limit: limit });
  if (error) {
    toast(errorText(error), "error");
    return [] as SavedRow[];
  }
  const rows = (data ?? []) as SavedRow[];
  await loadProfiles(rows.map((r) => r.author_id));
  return rows;
}

export async function pinMessage(messageId: string) {
  const { error } = await supabase.rpc("pin_message", { p_message: messageId });
  if (error) toast(errorText(error), "error");
  else toast("Pinned", "success");
  return !error;
}

export async function unpinMessage(messageId: string) {
  const { error } = await supabase.rpc("unpin_message", { p_message: messageId });
  if (error) toast(errorText(error), "error");
  else toast("Unpinned", "success");
  return !error;
}

export async function listPins(conversationId: string) {
  const { data, error } = await supabase
    .from("message_pins")
    .select("conversation_id, message_id, pinned_by, pinned_at, messages(id, content, author_id, attachment_name, attachment_type, created_at, deleted_at)")
    .eq("conversation_id", conversationId)
    .order("pinned_at", { ascending: false })
    .limit(25);
  if (error) return [] as PinRow[];
  const rows = (data ?? []) as PinRow[];
  const authors = rows.flatMap((r) => {
    const m = Array.isArray(r.messages) ? r.messages[0] : r.messages;
    return m?.author_id ? [m.author_id] : [];
  });
  await loadProfiles(authors);
  return rows;
}

export async function searchMessages(conversationId: string, q: string) {
  const { data, error } = await supabase.rpc("search_messages", { p_conv: conversationId, p_q: q, p_limit: 40 });
  if (error) {
    toast(errorText(error), "error");
    return [] as Message[];
  }
  const msgs = (data ?? []) as Message[];
  await loadProfiles(msgs.map((m) => m.author_id));
  return msgs;
}
