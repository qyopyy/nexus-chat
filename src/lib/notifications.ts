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

/** Client-only inbox rows (e.g. Space event reminders) — not backed by notification_inbox. */
export type LocalInboxItem = {
  id: string;
  kind: string;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
};

type InboxState = {
  items: InboxItem[];
  localItems: LocalInboxItem[];
  unread: number;
  open: boolean;
  loaded: boolean;
};

export const useNotificationInbox = create<InboxState>(() => ({
  items: [],
  localItems: [],
  unread: 0,
  open: false,
  loaded: false,
}));

export function setNotificationPanelOpen(open: boolean) {
  useNotificationInbox.setState({ open });
}

/** Push a local (client-side) notification into the panel; dedupes by id. */
export function pushLocalNotification(item: Omit<LocalInboxItem, "read_at"> & { read_at?: string | null }) {
  useNotificationInbox.setState((s) => {
    if (s.localItems.some((x) => x.id === item.id)) return s;
    const row: LocalInboxItem = { ...item, read_at: item.read_at ?? null };
    const localItems = [row, ...s.localItems].slice(0, 40);
    return {
      localItems,
      unread: s.unread + (row.read_at ? 0 : 1),
    };
  });
}

export function markLocalNotificationsRead(ids?: string[]) {
  useNotificationInbox.setState((s) => {
    const now = new Date().toISOString();
    const localItems = s.localItems.map((i) =>
      ids && !ids.includes(i.id) ? i : { ...i, read_at: i.read_at ?? now },
    );
    const localUnread = localItems.filter((i) => !i.read_at).length;
    const serverUnread = s.items.filter((i) => !i.read_at).length;
    return { localItems, unread: localUnread + serverUnread };
  });
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
  const localUnread = useNotificationInbox.getState().localItems.filter((i) => !i.read_at).length;
  useNotificationInbox.setState({
    items,
    unread: items.filter((i) => !i.read_at).length + localUnread,
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
  useNotificationInbox.setState((s) => {
    const items = s.items.map((i) => (ids && !ids.includes(i.id) ? i : { ...i, read_at: i.read_at ?? new Date().toISOString() }));
    // "Read all" also clears local unread when no specific server ids were passed.
    const localItems = !ids?.length
      ? s.localItems.map((i) => ({ ...i, read_at: i.read_at ?? new Date().toISOString() }))
      : s.localItems;
    const unread = items.filter((i) => !i.read_at).length + localItems.filter((i) => !i.read_at).length;
    return { items, localItems, unread };
  });
}

export async function openNotification(item: InboxItem) {
  if (!item.read_at) void markNotificationsRead([item.id]);
  useNotificationInbox.setState({ open: false });
  if (item.conversation_id) openConversation(item.conversation_id, null);
}

export function openLocalNotification(item: LocalInboxItem) {
  if (!item.read_at) markLocalNotificationsRead([item.id]);
  useNotificationInbox.setState({ open: false });
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
          unread: s.unread + (row.read_at ? 0 : 1),
        }));
      },
    )
    .subscribe();
  void refreshNotificationInbox();
  return () => {
    void supabase.removeChannel(ch);
  };
}
