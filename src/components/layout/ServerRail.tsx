"use client";

import { useMemo } from "react";
import { Aperture, AppWindow, Clapperboard, Crown, Gamepad2, Headphones, LayoutDashboard, Megaphone, MessageCircle, Plus, Radio, Tv } from "lucide-react";
import { useApp, openModal } from "@/store/app";
import { selectHome, selectSpace } from "@/lib/data";
import { openUntitled } from "@/lib/untitled";
import { openRadio } from "@/lib/radio";
import { openLiveHub } from "@/lib/live";
import { openPulse } from "@/lib/pulse";
import { can, openStaffDesk } from "@/lib/privileges";
import { cn, initials } from "@/lib/utils";

function RailItem({
  active,
  unread,
  badge,
  label,
  onClick,
  children,
  color,
}: {
  active: boolean;
  unread?: boolean;
  badge?: number;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  color?: string;
}) {
  return (
    <div className="group relative flex w-full justify-center">
      <span
        className={cn(
          "absolute top-1/2 left-0 w-1 -translate-y-1/2 rounded-r-full bg-white transition-all",
          active ? "h-10" : unread ? "h-2 group-hover:h-5" : "h-0 group-hover:h-5",
        )}
      />
      <button
        onClick={onClick}
        aria-label={label}
        title={label}
        className={cn(
          "relative grid size-12 place-items-center overflow-visible text-white transition-all duration-200",
          active ? "rounded-2xl" : "rounded-3xl group-hover:rounded-2xl",
          !color && (active ? "bg-accent" : "bg-chat text-txt group-hover:bg-accent group-hover:text-white"),
        )}
        style={color ? { background: color } : undefined}
      >
        {children}
        {!!badge && (
          <span className="absolute -right-1 -bottom-1 min-w-5 rounded-full border-4 border-rail bg-dnd px-1 text-center text-[11px] leading-3 font-bold text-white">
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </button>
    </div>
  );
}

export default function ServerRail() {
  const spaces = useApp((s) => s.spaces);
  const spaceId = useApp((s) => s.spaceId);
  const unread = useApp((s) => s.unread);
  const chatList = useApp((s) => s.chatList);
  const channels = useApp((s) => s.channels);
  const friendships = useApp((s) => s.friendships);
  const me = useApp((s) => s.userId);
  const hub = useApp((s) => s.hub);

  const homeBadge = useMemo(() => {
    const dms = chatList.reduce((n, c) => n + (unread[c.id] ?? 0), 0);
    const pending = friendships.filter((f) => f.status === "pending" && f.addressee_id === me).length;
    return dms + pending;
  }, [chatList, unread, friendships, me]);

  return (
    <nav className="flex h-full w-[72px] shrink-0 flex-col items-center gap-2 overflow-y-auto bg-rail py-3">
      <RailItem active={spaceId === null && !hub} label="Direct Messages" onClick={() => (useApp.setState({ hub: null }), selectHome())} badge={homeBadge}>
        <MessageCircle className="size-6" />
      </RailItem>
      <RailItem active={hub === "gram"} label="NexusGram — posts, Shorts & stories" onClick={() => useApp.setState({ hub: "gram" })} color={hub === "gram" ? "#c13584" : undefined}>
        <Aperture className="size-6" />
      </RailItem>
      <RailItem active={hub === "videos"} label="Videos" onClick={() => useApp.setState({ hub: "videos" })} color={hub === "videos" ? "#eb459e" : undefined}>
        <Clapperboard className="size-6" />
      </RailItem>
      <RailItem active={hub === "live"} label="Nexus Live — HD & 4K streams + screen share" onClick={() => openLiveHub()} color={hub === "live" ? "#9146ff" : undefined}>
        <Tv className="size-5" />
      </RailItem>
      <RailItem active={hub === "pulse"} label="Pulse — Twitter-style posts" onClick={() => openPulse()} color={hub === "pulse" ? "#1d9bf0" : undefined}>
        <Megaphone className="size-5" />
      </RailItem>
      <RailItem active={hub === "music"} label="Music" onClick={() => useApp.setState({ hub: "music" })} color={hub === "music" ? "#1DB954" : undefined}>
        <Headphones className="size-6" />
      </RailItem>
      <RailItem active={hub === "cutroom" || hub === "untitled"} label="Cutroom — WIP music" onClick={() => openUntitled()} color={hub === "cutroom" || hub === "untitled" ? "#c4a574" : undefined}>
        <span className="text-lg font-semibold leading-none">♩</span>
      </RailItem>
      <RailItem active={hub === "radio"} label="Nexus Radio — listen & jam together" onClick={() => void openRadio()} color={hub === "radio" ? "#ff2bd6" : undefined}>
        <Radio className="size-5" />
      </RailItem>
      <RailItem active={hub === "games"} label="Games" onClick={() => useApp.setState({ hub: "games" })} color={hub === "games" ? "#ff2bd6" : undefined}>
        <Gamepad2 className="size-6" />
      </RailItem>
      <RailItem active={hub === "apps"} label="Apps" onClick={() => useApp.setState({ hub: "apps" })} color={hub === "apps" ? "#00a8fc" : undefined}>
        <AppWindow className="size-6" />
      </RailItem>
      <RailItem active={false} label="Studio — upload videos & distribute music" onClick={() => useApp.setState({ hub: "studio" })}>
        <LayoutDashboard className="size-6" />
      </RailItem>
      {can.staffDesk() && (
        <RailItem active={hub === "staff"} label="Staff Desk — VIP & staff perks" onClick={() => openStaffDesk()} color={hub === "staff" ? "#eb459e" : undefined}>
          <Crown className="size-5" />
        </RailItem>
      )}
      <div className="mx-auto h-0.5 w-8 rounded bg-line" />
      {spaces.map((sp) => {
        const spaceUnread = (channels[sp.id] ?? []).some((c) => (unread[c.id] ?? 0) > 0);
        return (
          <RailItem
            key={sp.id}
            active={spaceId === sp.id && !hub}
            unread={spaceUnread}
            label={sp.name}
            onClick={() => (useApp.setState({ hub: null }), void selectSpace(sp.id))}
            color={sp.icon_color}
          >
            <span className="text-base font-semibold">{initials(sp.name)}</span>
          </RailItem>
        );
      })}
      <RailItem active={false} label="Add a Space" onClick={() => openModal("createSpace")}>
        <Plus className="size-6 text-ok group-hover:text-white" />
      </RailItem>
    </nav>
  );
}
