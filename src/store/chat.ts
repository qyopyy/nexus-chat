"use client";

import { create } from "zustand";
import type { Message, Reaction } from "@/lib/types";

export type ChatState = {
  conversationId: string | null;
  messages: Message[];
  reactions: Record<string, Reaction[]>;
  loading: boolean;
  hasMore: boolean;
  replyTo: Message | null;
  editingId: string | null;
  typing: Record<string, number>;
  /** message id to scroll to + flash */
  jumpTo: string | null;
};

export const useChat = create<ChatState>(() => ({
  conversationId: null,
  messages: [],
  reactions: {},
  loading: false,
  hasMore: true,
  replyTo: null,
  editingId: null,
  typing: {},
  jumpTo: null,
}));
