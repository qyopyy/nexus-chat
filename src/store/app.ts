"use client";

import { create } from "zustand";
import type {
  Badge,
  ChatListItem,
  Conversation,
  Friendship,
  PresenceState,
  Profile,
  Space,
  SpaceMember,
  UserStatus,
} from "@/lib/types";

export type ModalKind =
  | "premium"
  | "settings"
  | "createSpace"
  | "newGroup"
  | "createChannel"
  | "spaceInvite"
  | "profile"
  | null;

export type ProfileCardState = { userId: string; x: number; y: number } | null;

export type Toast = { id: number; text: string; kind: "info" | "error" | "success" };

export type AppState = {
  userId: string | null;
  bootstrapped: boolean;
  profiles: Record<string, Profile>;
  friendships: Friendship[];
  spaces: Space[];
  channels: Record<string, Conversation[]>;
  spaceMembers: Record<string, SpaceMember[]>;
  chatList: ChatListItem[];
  convMembers: Record<string, string[]>;
  convKinds: Record<string, Conversation["kind"]>;
  /** disappearing-messages timer per chat (seconds), null = off */
  convTtl: Record<string, number | null>;
  unread: Record<string, number>;
  presence: Record<string, PresenceState>;
  myStatus: UserStatus;
  /** spaceId null = Home (DMs + friends) */
  spaceId: string | null;
  /** null in Home = Friends page */
  conversationId: string | null;
  lastChannel: Record<string, string>;
  showMembers: boolean;
  mobileSidebar: boolean;
  chatFilter: "all" | "dm" | "group" | "unread";
  search: string;
  modal: ModalKind;
  modalArg: string | null;
  toasts: Toast[];
  badges: Record<string, Badge>;
  userBadges: Record<string, string[]>;
  profileCard: ProfileCardState;
  /** phone layout: which bottom tab is showing */
  mobileTab: "chats" | "spaces" | "videos" | "music" | "games" | "friends" | "me";
  /** a full-width hub replaces the chat pane: music, videos or the creator studio */
  hub: "music" | "videos" | "studio" | "games" | null;
  /** phone layout: call screen minimized to the floating bar */
  callMinimized: boolean;
};

export const useApp = create<AppState>(() => ({
  userId: null,
  bootstrapped: false,
  profiles: {},
  friendships: [],
  spaces: [],
  channels: {},
  spaceMembers: {},
  chatList: [],
  convMembers: {},
  convKinds: {},
  convTtl: {},
  unread: {},
  presence: {},
  myStatus: "online",
  spaceId: null,
  conversationId: null,
  lastChannel: {},
  showMembers: true,
  mobileSidebar: true,
  chatFilter: "all",
  search: "",
  modal: null,
  modalArg: null,
  toasts: [],
  badges: {},
  userBadges: {},
  profileCard: null,
  mobileTab: "chats",
  hub: null,
  callMinimized: false,
}));

export function openProfileCard(userId: string, e: { clientX: number; clientY: number }) {
  useApp.setState({ profileCard: { userId, x: e.clientX, y: e.clientY } });
}

let toastSeq = 0;
export function toast(text: string, kind: Toast["kind"] = "info") {
  const id = ++toastSeq;
  useApp.setState((s) => ({ toasts: [...s.toasts, { id, text, kind }] }));
  setTimeout(() => useApp.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4000);
}

export function openModal(modal: ModalKind, arg: string | null = null) {
  useApp.setState({ modal, modalArg: arg });
}
export function closeModal() {
  useApp.setState({ modal: null, modalArg: null });
}

/** Display name for a conversation */
export function conversationTitle(s: AppState, convId: string | null): string {
  if (!convId) return "";
  const item = s.chatList.find((c) => c.id === convId);
  if (item) {
    if (item.kind === "dm") {
      const p = item.other_user_id ? s.profiles[item.other_user_id] : undefined;
      return p?.display_name ?? "Direct message";
    }
    return item.name ?? "Group";
  }
  for (const list of Object.values(s.channels)) {
    const ch = list.find((c) => c.id === convId);
    if (ch) return ch.name ?? "channel";
  }
  return "";
}

export function findChannel(s: AppState, convId: string | null): Conversation | undefined {
  if (!convId) return undefined;
  for (const list of Object.values(s.channels)) {
    const ch = list.find((c) => c.id === convId);
    if (ch) return ch;
  }
  return undefined;
}
