"use client";

import { create } from "zustand";

export type MessageBanner = {
  conversationId: string;
  title: string;
  body: string;
  /** stacked unread for this chat while the banner is visible */
  count: number;
  at: number;
};

type State = {
  banner: MessageBanner | null;
  show: (b: Omit<MessageBanner, "at" | "count"> & { count?: number }) => void;
  dismiss: () => void;
};

/** Telegram-style top banner for messages that arrive while another chat is open. */
export const useMessageBanner = create<State>((set, get) => ({
  banner: null,
  show: (b) => {
    const cur = get().banner;
    if (cur && cur.conversationId === b.conversationId) {
      set({
        banner: {
          ...cur,
          title: b.title,
          body: b.body,
          count: cur.count + (b.count ?? 1),
          at: Date.now(),
        },
      });
      return;
    }
    set({
      banner: {
        conversationId: b.conversationId,
        title: b.title,
        body: b.body,
        count: b.count ?? 1,
        at: Date.now(),
      },
    });
  },
  dismiss: () => set({ banner: null }),
}));
