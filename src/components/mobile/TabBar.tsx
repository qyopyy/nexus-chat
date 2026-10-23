"use client";

import { useMemo } from "react";
import { Clapperboard, Headphones, LayoutGrid, MessageCircle, UserRound } from "lucide-react";
import { useApp } from "@/store/app";
import { haptic } from "@/lib/haptics";
import { musicHome } from "@/store/music";
import { videosHome } from "@/store/studio";
import { cn } from "@/lib/utils";
import Avatar from "@/components/ui/Avatar";

type Tab = "chats" | "spaces" | "videos" | "music" | "friends" | "me";

export default function TabBar() {
  const tab = useApp((s) => s.mobileTab);
  const me = useApp((s) => s.userId);
  const unread = useApp((s) => s.unread);
  const chatList = useApp((s) => s.chatList);
  const channels = useApp((s) => s.channels);
  const friendships = useApp((s) => s.friendships);

  const chatBadge = useMemo(() => chatList.reduce((n, c) => n + ((unread[c.id] ?? 0) > 0 ? 1 : 0), 0), [chatList, unread]);
  const spaceDot = useMemo(() => Object.values(channels).some((list) => list.some((c) => (unread[c.id] ?? 0) > 0)), [channels, unread]);
  const pending = friendships.filter((f) => f.status === "pending" && f.addressee_id === me).length;

  const items: { id: Tab; label: string; icon: React.ReactNode; badge?: number; dot?: boolean }[] = [
    { id: "chats", label: "Chats", icon: <MessageCircle className="size-[25px]" strokeWidth={1.9} />, badge: chatBadge },
    { id: "spaces", label: "Spaces", icon: <LayoutGrid className="size-[25px]" strokeWidth={1.9} />, dot: spaceDot },
    { id: "videos", label: "Videos", icon: <Clapperboard className="size-[25px]" strokeWidth={1.9} /> },
    { id: "music", label: "Music", icon: <Headphones className="size-[25px]" strokeWidth={1.9} /> },
    {
      id: "me",
      label: "You",
      badge: pending,
      icon: me ? <Avatar userId={me} size={28} plain className={cn("rounded-full", tab === "me" && "ring-2 ring-accent")} /> : <UserRound className="size-[25px]" />,
    },
  ];

  return (
    <nav className="tabbar relative z-30 shrink-0 border-t border-white/[.07] bg-side/80 pb-safe backdrop-blur-2xl">
      <div className="mx-auto flex max-w-lg">
        {items.map((it) => {
          const active = tab === it.id;
          return (
            <button
              key={it.id}
              onClick={() => {
                if (active) {
                  // tap active tab again → pop to root (iOS behaviour)
                  if (it.id === "spaces") useApp.setState({ spaceId: null });
                  if (it.id === "music") musicHome();
                  if (it.id === "videos") videosHome();
                  window.dispatchEvent(new CustomEvent("nexus:scrolltop"));
                } else haptic.select();
                useApp.setState({ mobileTab: it.id, mobileSidebar: true });
              }}
              className={cn("relative flex flex-1 flex-col items-center gap-0.5 pt-2 pb-1.5 transition active:scale-90", active ? "text-accent" : "text-sub")}
              aria-label={it.label}
            >
              <span className="relative">
                {it.icon}
                {!!it.badge && (
                  <span className="absolute -top-1.5 -right-2.5 min-w-[18px] rounded-full bg-dnd px-1 text-center text-[11px] leading-[18px] font-bold text-white ring-2 ring-side">
                    {it.badge > 99 ? "99+" : it.badge}
                  </span>
                )}
                {it.dot && !it.badge && <span className="absolute -top-0.5 -right-1 size-2.5 rounded-full bg-dnd ring-2 ring-side" />}
              </span>
              <span className="text-[10.5px] font-semibold tracking-wide">{it.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
