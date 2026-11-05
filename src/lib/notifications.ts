"use client";

/**
 * Notification inbox — Supabase-backed store that powers the messaging panel
 * and pairs with Firebase Cloud Messaging (FCM) / local iOS banners.
 */

import { create } from "zustand";
import { supabase } from "./supabase";
import { useApp } from "@/store/app";
import { loadProfiles } from "./data";
import { openConversation } from "./data";

export type InboxItem = {
  id: number;
  user_id: string;
  kind: string;
  title: string;
  body: string;
  conversation_id: string | null;
  message_id: string | null;
  actor_id: string | null;
  read_at: string | null;
  created_at: string;
};

type InboxState = {
  items: InboxItem[];
  unread: number;
  open: boolean;
  loaded: boolean;
};

export const useNotificationInbox = create<InboxState>(() => ({
  items: [],
  unread: 0,
  open: false,
  loaded: false,
}));

export function setNotificationPanelOpen(open: boolean) {
  useNotificationInbox.setState({ open });
}

export async function refreshNotificationInbox() {
  const me = useApp.getState().userId;
  if (!me) return;
  const { data, error } = await supabase
    .from("notification_inbox")
    .select("id,user_id,kind,title,body,conversation_id,message_id,actor_id,read_at,created_at")
    .eq("user_id", me)
    .order("created_at", { ascending: false })
    .limit(60);
  if (error || !data) {
    useNotificationInbox.setState({ loaded: true });
    return;
  }
  const items = data as InboxItem[];
  const actors = [...new Set(items.map((i) => i.actor_id).filter(Boolean))] as string[];
  if (actors.length) void loadProfiles(actors);
  useNotificationInbox.setState({
    items,
    unread: items.filter((i) => !i.read_at).length,
    loaded: true,
  });
}

export async function markNotificationsRead(ids?: number[]) {
  const { error } = await supabase.rpc("notification_inbox_mark_read", {
    p_ids: ids?.length ? ids : null,
  });
  if (error) {
    // Fallback direct update
    const me = useApp.getState().userId;
    if (!me) return;
    let q = supabase.from("notification_inbox").update({ read_at: new Date().toISOString() }).eq("user_id", me).is("read_at", null);
    if (ids?.length) q = q.in("id", ids);
    await q;
  }
  useNotificationInbox.setState((s) => ({
    items: s.items.map((i) => (ids && !ids.includes(i.id) ? i : { ...i, read_at: i.read_at ?? new Date().toISOString() })),
    unread: 0,
  }));
}

export async function openNotification(item: InboxItem) {
  if (!item.read_at) void markNotificationsRead([item.id]);
  useNotificationInbox.setState({ open: false });
  if (item.conversation_id) openConversation(item.conversation_id, null);
}

/** Realtime subscription for inbox inserts (iPhone messaging panel). */
export function subscribeNotificationInbox(userId: string) {
  const ch = supabase
    .channel(`notification-inbox:${userId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "notification_inbox", filter: `user_id=eq.${userId}` },
      (payload) => {
        const row = payload.new as InboxItem;
        if (row.actor_id) void loadProfiles([row.actor_id]);
        useNotificationInbox.setState((s) => ({
          items: [row, ...s.items].slice(0, 60),
          unread: s.unread + 1,
        }));
      },
    )
    .subscribe();
  void refreshNotificationInbox();
  return () => {
    void supabase.removeChannel(ch);
  };
}
