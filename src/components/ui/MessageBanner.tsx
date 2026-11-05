"use client";

import { useEffect } from "react";
import { useMessageBanner } from "@/lib/messageBanner";
import { openConversation } from "@/lib/data";
import { useApp } from "@/store/app";
import { haptic } from "@/lib/haptics";
import { fmtCount } from "@/lib/links";

/** In-app Telegram-style banner for a new message while you're looking at something else. */
export default function MessageBanner() {
  const banner = useMessageBanner((s) => s.banner);
  const dismiss = useMessageBanner((s) => s.dismiss);

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => {
      // only auto-hide if it wasn't refreshed recently
      const cur = useMessageBanner.getState().banner;
      if (cur && Date.now() - cur.at >= 4500) dismiss();
    }, 5000);
    return () => clearTimeout(t);
  }, [banner, dismiss]);

  if (!banner) return null;

  return (
    <button
      type="button"
      onClick={() => {
        haptic.select();
        const id = banner.conversationId;
        dismiss();
        const s = useApp.getState();
        let spaceId: string | null = null;
        if (!s.chatList.some((c) => c.id === id)) {
          for (const [sid, list] of Object.entries(s.channels)) {
            if (list.some((c) => c.id === id)) {
              spaceId = sid;
              break;
            }
          }
        }
        useApp.setState({ hub: null, mobileTab: spaceId ? "spaces" : "chats", mobileSidebar: false });
        openConversation(id, spaceId);
      }}
      className="animate-pop fixed top-[max(12px,env(safe-area-inset-top))] right-3 left-3 z-[70] mx-auto flex max-w-lg items-start gap-3 rounded-2xl border border-white/10 bg-panel/95 px-3.5 py-3 text-left shadow-[0_12px_40px_rgba(0,0,0,.45)] backdrop-blur-xl active:scale-[.98] sm:left-1/2 sm:-translate-x-1/2"
    >
      <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-full bg-accent text-sm font-black text-white">
        {banner.count > 1 ? (banner.count > 99 ? "99+" : banner.count) : banner.title.slice(0, 1).toUpperCase()}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-[15px] font-bold">{banner.title}</span>
          {banner.count > 1 && (
            <span className="shrink-0 rounded-full bg-dnd px-1.5 text-[11px] leading-[18px] font-bold text-white">
              {fmtCount(banner.count)}
            </span>
          )}
        </span>
        <span className="mt-0.5 line-clamp-2 text-[13px] text-sub">{banner.body}</span>
      </span>
    </button>
  );
}
