"use client";

import { useEffect } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { useApp, toast } from "@/store/app";
import { useChat } from "@/store/chat";
import { useCall, receiveRing, cancelRing, declineRing } from "./call";
import {
  addReactionLocal,
  bumpChatList,
  loadProfiles,
  loadSpace,
  markRead,
  mergeProfiles,
  refreshChatList,
  refreshFriends,
  refreshSpaces,
  refreshUnread,
  removeReactionLocal,
  isTimerNotice,
  loadTtl,
} from "./data";
import { sfx } from "./sounds";
import { useChatFx } from "./chatFx";
import { onInviteRow, loadPendingInvites } from "./gameInvites";
import { isEffect, playEffect } from "./effects";
import { isMuted } from "@/store/prefs";
import { isSpaceMuted } from "./spacePrefs";
import { haptic } from "./haptics";
import { refreshBadges } from "./admin";
import { nativeLocalNotify, usePush } from "./push";
import { syncAppBadge, totalUnread } from "./badge";
import { useMessageBanner } from "./messageBanner";
import { isNativeApp } from "./useMobile";
import type { Message, PresenceState, Profile, Reaction } from "./types";

type CallEvent = { id: string; conversation_id: string; caller_id: string; kind: "ring" | "cancel" | "decline"; created_at: string };

function spaceIdForConv(convId: string): string | null {
  const channels = useApp.getState().channels;
  for (const [sid, list] of Object.entries(channels)) {
    if (list.some((c) => c.id === convId)) return sid;
  }
  return null;
}

function notify(m: Message, opts?: { skipSound?: boolean }) {
  const s = useApp.getState();
  const sid = spaceIdForConv(m.conversation_id);
  if (s.myStatus === "dnd" || isMuted(m.conversation_id) || (sid && isSpaceMuted(sid))) return;
  if (!opts?.skipSound) {
    sfx.message();
    haptic.light();
  }
  const author = s.profiles[m.author_id]?.display_name ?? "New message";
  const body = m.content || m.attachment_name || "Sent an attachment";
  const chatOpen = useChat.getState().conversationId === m.conversation_id;

  // Telegram-style in-app banner when the app is visible but this chat isn't focused
  if (!document.hidden && !chatOpen) {
    useMessageBanner.getState().show({ conversationId: m.conversation_id, title: author, body });
  }

  if (isNativeApp()) {
    // System banner while backgrounded; in-app MessageBanner covers the foreground case
    if (document.hidden) void nativeLocalNotify(author, body, m.conversation_id, totalUnread());
    void syncAppBadge();
    return;
  }
  // with Web Push on, the service worker shows background notifications (no duplicates)
  if (usePush.getState().state === "on") return;
  if (typeof Notification === "undefined" || Notification.permission !== "granted" || !document.hidden) return;
  try {
    const n = new Notification(author, { body, tag: m.conversation_id });
    n.onclick = () => window.focus();
  } catch {
    /* notifications blocked */
  }
}

async function onMessageInsert(m: Message) {
  const app = useApp.getState();
  const me = app.userId;
  await loadProfiles([m.author_id]);

  const chat = useChat.getState();
  const isOpen = chat.conversationId === m.conversation_id;
  if (isTimerNotice(m)) void loadTtl(m.conversation_id);
  if (isOpen && m.author_id !== me && isEffect(m.effect) && Date.now() - new Date(m.created_at).getTime() < 60_000) playEffect(m.effect);
  if (isOpen) {
    useChat.setState((s) => {
      if (s.messages.some((x) => x.id === m.id)) return s;
      const live = { ...s.live };
      delete live[m.author_id];
      return { messages: [...s.messages, m], typing: { ...s.typing, [m.author_id]: 0 }, live };
    });
  }

  if (m.author_id !== me) {
    // Always play the incoming SFX (respects mute / DND / sound prefs inside notify & sfx)
    const sid = spaceIdForConv(m.conversation_id);
    const silenced =
      useApp.getState().myStatus === "dnd" ||
      isMuted(m.conversation_id) ||
      (!!sid && isSpaceMuted(sid));
    if (!silenced) {
      sfx.message();
      haptic.light();
    }
    if (isOpen && !document.hidden) {
      void markRead(m.conversation_id);
    } else {
      useApp.setState((s) => ({ unread: { ...s.unread, [m.conversation_id]: (s.unread[m.conversation_id] ?? 0) + 1 } }));
      notify(m, { skipSound: true }); // sound already played above
      void syncAppBadge();
    }
  }

  const kind = useApp.getState().convKinds[m.conversation_id];
  if (kind === "dm" || kind === "group") {
    if (useApp.getState().chatList.some((c) => c.id === m.conversation_id)) bumpChatList(m);
    else void refreshChatList();
  } else if (!kind) {
    void refreshChatList();
  }
}

function onMessageUpdate(m: Message) {
  useChat.setState((s) => ({ messages: s.messages.map((x) => (x.id === m.id ? { ...x, ...m, pending: false } : x)) }));
  void refreshChatListDebounced();
}

let chatListTimer: ReturnType<typeof setTimeout> | null = null;
function refreshChatListDebounced() {
  if (chatListTimer) clearTimeout(chatListTimer);
  chatListTimer = setTimeout(() => void refreshChatList(), 400);
}

function onCallEvent(e: CallEvent) {
  const s = useApp.getState();
  if (e.caller_id === s.userId) return;
  void loadProfiles([e.caller_id]);
  if (e.kind === "ring") {
    if (Date.now() - new Date(e.created_at).getTime() < 30000 && s.myStatus !== "dnd") receiveRing(e.conversation_id, e.caller_id);
  } else if (e.kind === "cancel") {
    cancelRing(e.conversation_id);
  } else if (e.kind === "decline") {
    if (useCall.getState().outgoingRing === e.conversation_id) {
      declineRing(e.conversation_id);
      const name = useApp.getState().profiles[e.caller_id]?.display_name ?? "They";
      toast(`${name} declined the call`);
    }
  }
}

let onlineChannel: RealtimeChannel | null = null;

function trackPresence() {
  const ch = onlineChannel;
  const s = useApp.getState();
  if (!ch || !s.userId) return;
  if (s.myStatus === "invisible") {
    void ch.untrack();
    return;
  }
  const c = useCall.getState();
  const state: PresenceState = {
    user_id: s.userId,
    status: s.myStatus,
    voice: c.status !== "idle" ? c.conversationId : null,
    muted: c.muted,
    deafened: c.deafened,
    video: !!c.localCam,
    screen: !!c.localScreen,
    online_at: new Date().toISOString(),
  };
  void ch.track(state);
}

let trackTimer: ReturnType<typeof setTimeout> | null = null;
function trackSoon() {
  if (trackTimer) clearTimeout(trackTimer);
  trackTimer = setTimeout(trackPresence, 150);
}

export function useRealtime(userId: string | null) {
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    const db = supabase
      .channel(`db:${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, ({ new: row }) => {
        void onMessageInsert(row as Message);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages" }, ({ new: row }) => {
        onMessageUpdate(row as Message);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "message_reactions" }, ({ new: row }) => {
        const r = row as Reaction;
        if (useChat.getState().conversationId === r.conversation_id) addReactionLocal(r);
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "message_reactions" }, ({ old }) => {
        const r = old as Partial<Reaction>;
        if (r.message_id && r.user_id && r.emoji) removeReactionLocal(r as Reaction);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, () => {
        void refreshFriends();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "conversation_members" }, () => {
        refreshChatListDebounced();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, ({ new: row }) => {
        const c = row as { space_id?: string | null };
        if (c?.space_id) void loadSpace(c.space_id);
        else refreshChatListDebounced();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "space_members" }, ({ new: row }) => {
        void refreshSpaces();
        const sm = row as { space_id?: string };
        if (sm?.space_id && useApp.getState().channels[sm.space_id]) void loadSpace(sm.space_id);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "call_events" }, ({ new: row }) => {
        onCallEvent(row as CallEvent);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "game_invites" }, ({ new: row }) => {
        onInviteRow(row as Parameters<typeof onInviteRow>[0]);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "user_badges" }, () => {
        void refreshBadges();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "badges" }, () => {
        void refreshBadges();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles" }, ({ new: row }) => {
        const p = row as Profile;
        if (useApp.getState().profiles[p.id]) mergeProfiles([p]);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void loadPendingInvites();
      });

    const online = supabase.channel("online", { config: { private: true, presence: { key: userId } } });
    online
      .on("presence", { event: "sync" }, () => {
        const state = online.presenceState() as unknown as Record<string, PresenceState[]>;
        const presence: Record<string, PresenceState> = {};
        for (const [key, metas] of Object.entries(state)) {
          const last = metas[metas.length - 1];
          if (last) presence[key] = last;
        }
        useApp.setState({ presence });
        void loadProfiles(Object.keys(presence));
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED" && !cancelled) trackPresence();
      });
    onlineChannel = online;

    const unsubCall = useCall.subscribe((c, p) => {
      if (
        c.status !== p.status ||
        c.conversationId !== p.conversationId ||
        c.muted !== p.muted ||
        c.deafened !== p.deafened ||
        c.localCam !== p.localCam ||
        c.localScreen !== p.localScreen
      )
        trackSoon();
    });
    const unsubApp = useApp.subscribe((a, p) => {
      if (a.myStatus !== p.myStatus) trackSoon();
    });

    // Re-sync when the tab / iPhone app comes back (sleep, backgrounded WebView…)
    const onVisible = () => {
      if (document.hidden) return;
      const conv = useChat.getState().conversationId;
      if (conv) void markRead(conv);
      void refreshChatList();
      void refreshUnread().then(() => syncAppBadge());
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      cancelled = true;
      unsubCall();
      unsubApp();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      void supabase.removeChannel(db);
      void supabase.removeChannel(online);
      onlineChannel = null;
    };
  }, [userId]);
}

/** Typing indicator channel for the open conversation */
export function useTypingChannel(convId: string | null, userId: string | null) {
  useEffect(() => {
    if (!convId || !userId) return;
    const ch = supabase.channel(`chat:${convId}`, { config: { private: true, broadcast: { self: false } } });
    ch.on("broadcast", { event: "typing" }, ({ payload }) => {
      const from = (payload as { from: string }).from;
      if (from === userId) return;
      useChat.setState((s) => ({ typing: { ...s.typing, [from]: Date.now() + 4000 } }));
    })
      .on("broadcast", { event: "five" }, ({ payload }) => {
        const { from, kind, to } = payload as { from: string; kind: "ask" | "back"; to?: string };
        if (from === userId) return;
        if (kind === "ask") useChat.setState({ five: { from, at: Date.now() } });
        else if (kind === "back" && to === userId) {
          playEffect("fireworks");
          haptic.heavy();
          const n = useApp.getState().profiles[from]?.display_name ?? "Your friend";
          toast(`🙌 ${n} high-fived you back!`, "success");
        }
      })
      .on("broadcast", { event: "live" }, ({ payload }) => {
        const { from, text } = payload as { from: string; text: string };
        if (from === userId || typeof text !== "string") return;
        useChat.setState((s) => {
          const live = { ...s.live };
          if (text) live[from] = { text: text.slice(0, 500), exp: Date.now() + 6000 };
          else delete live[from];
          return { live, typing: { ...s.typing, [from]: text ? Date.now() + 4000 : 0 } };
        });
      })
      .subscribe();
    typingChannel = ch;
    const sweep = setInterval(() => {
      const now = Date.now();
      const t = useChat.getState().typing;
      if (Object.values(t).some((exp) => exp && exp < now)) {
        const next: Record<string, number> = {};
        for (const [k, v] of Object.entries(t)) if (v > now) next[k] = v;
        useChat.setState({ typing: next });
      }
      const lv = useChat.getState().live;
      if (Object.values(lv).some((x) => x.exp < now)) {
        const next: typeof lv = {};
        for (const [k, v] of Object.entries(lv)) if (v.exp > now) next[k] = v;
        useChat.setState({ live: next });
      }
    }, 1000);
    return () => {
      clearInterval(sweep);
      useChat.setState({ live: {} });
      if (typingChannel === ch) typingChannel = null;
      void supabase.removeChannel(ch);
    };
  }, [convId, userId]);
}

let typingChannel: RealtimeChannel | null = null;
let lastTypingSent = 0;
export function sendTyping(userId: string) {
  const now = Date.now();
  if (!useChatFx.getState().showTyping) return;
  if (!typingChannel || now - lastTypingSent < 2500) return;
  lastTypingSent = now;
  void typingChannel.send({ type: "broadcast", event: "typing", payload: { from: userId } });
}

/** live typing: others see your draft as you type (only if you turned it on) */
let liveTimer: ReturnType<typeof setTimeout> | null = null;
let lastLive = 0;
let pendingLive: string | null = null;
let liveShown = false;
export function sendLive(userId: string, text: string) {
  const fx = useChatFx.getState();
  if (!typingChannel || !fx.showTyping || !fx.liveTyping) {
    if (liveShown && typingChannel) void typingChannel.send({ type: "broadcast", event: "live", payload: { from: userId, text: "" } });
    liveShown = false;
    return;
  }
  pendingLive = text;
  const flush = () => {
    liveTimer = null;
    if (pendingLive === null || !typingChannel) return;
    lastLive = Date.now();
    liveShown = !!pendingLive;
    void typingChannel.send({ type: "broadcast", event: "live", payload: { from: userId, text: pendingLive.slice(0, 500) } });
    pendingLive = null;
  };
  if (!text) return flush(); // clear immediately (sent / deleted)
  if (liveTimer) return;
  const wait = Math.max(0, 110 - (Date.now() - lastLive));
  liveTimer = setTimeout(flush, wait);
}

/** ✋ ask everyone in the open chat for a high five */
let lastFive = 0;
export function sendFive(userId: string) {
  if (!typingChannel || Date.now() - lastFive < 3000) return false;
  lastFive = Date.now();
  void typingChannel.send({ type: "broadcast", event: "five", payload: { from: userId, kind: "ask" } });
  return true;
}
export function answerFive(userId: string, to: string) {
  useChat.setState({ five: null });
  if (!typingChannel) return;
  void typingChannel.send({ type: "broadcast", event: "five", payload: { from: userId, kind: "back", to } });
  playEffect("fireworks");
  haptic.heavy();
}
