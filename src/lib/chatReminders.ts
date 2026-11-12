"use client";

import { useEffect } from "react";
import { supabase, errorText } from "./supabase";
import { toast, useApp } from "@/store/app";
import { openConversation } from "./data";
import { recordDeviceNotice } from "./phoneLink";

const snoozed = new Map<string, number>();

export function conversationSnoozed(conversationId: string) {
  const until = snoozed.get(conversationId) ?? 0;
  return until > Date.now();
}

export async function refreshSnoozes() {
  const userId = useApp.getState().userId;
  if (!userId) return;
  const { data } = await supabase.from("conversation_snoozes").select("conversation_id, until").eq("user_id", userId).gt("until", new Date().toISOString());
  snoozed.clear();
  for (const row of data ?? []) snoozed.set(row.conversation_id as string, Date.parse(row.until as string));
}

export async function snoozeConversation(conversationId: string, minutes: number) {
  const userId = useApp.getState().userId;
  if (!userId) throw new Error("Sign in required");
  if (minutes <= 0) {
    const { error } = await supabase.from("conversation_snoozes").delete().eq("user_id", userId).eq("conversation_id", conversationId);
    if (error) throw new Error(errorText(error));
    snoozed.delete(conversationId);
    return;
  }
  const until = new Date(Date.now() + minutes * 60_000).toISOString();
  const { error } = await supabase.from("conversation_snoozes").upsert({ user_id: userId, conversation_id: conversationId, until });
  if (error) throw new Error(errorText(error));
  snoozed.set(conversationId, Date.parse(until));
}

export async function remindAboutMessage(messageId: string, conversationId: string, minutes: number) {
  const userId = useApp.getState().userId;
  if (!userId) throw new Error("Sign in required");
  const { error } = await supabase.from("message_reminders").insert({
    user_id: userId,
    message_id: messageId,
    conversation_id: conversationId,
    remind_at: new Date(Date.now() + minutes * 60_000).toISOString(),
    note: "Reminder",
  });
  if (error) throw new Error(errorText(error));
}

async function fireReminders() {
  const { data, error } = await supabase.rpc("fire_due_reminders");
  if (error || !Array.isArray(data)) return;
  for (const row of data as { conversation_id?: string; note?: string | null }[]) {
    const note = row.note || "You asked to be reminded about a message";
    toast(note, "info");
    if (row.conversation_id) {
      void recordDeviceNotice({ title: "Reminder", body: note, href: `/?conv=${row.conversation_id}` });
    }
  }
}

export function useReminderClock(userId: string | null) {
  useEffect(() => {
    if (!userId) return;
    let live = true;
    const tick = async () => {
      if (!live) return;
      await refreshSnoozes();
      await fireReminders();
    };
    void tick();
    const timer = window.setInterval(() => void tick(), 30_000);
    const onFocus = () => void tick();
    window.addEventListener("focus", onFocus);
    return () => {
      live = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [userId]);
}

export function openReminder(conversationId: string) {
  openConversation(conversationId, null);
}
