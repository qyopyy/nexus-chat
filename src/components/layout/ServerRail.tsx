"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Aperture,
  AppWindow,
  BellOff,
  Clapperboard,
  Crown,
  Folder,
  Gamepad2,
  Headphones,
  LayoutDashboard,
  Megaphone,
  MessageCircle,
  Pencil,
  Plus,
  Radio,
  Star,
  Tv,
} from "lucide-react";
import { useApp, openModal } from "@/store/app";
import { selectHome, selectSpace } from "@/lib/data";
import { openUntitled } from "@/lib/untitled";
import { openRadio } from "@/lib/radio";
import { openLiveHub } from "@/lib/live";
import { openPulse } from "@/lib/pulse";
import { can, openStaffDesk } from "@/lib/privileges";
import { cn, initials } from "@/lib/utils";
import { sortSpaces, useSpacePrefs } from "@/lib/spacePrefs";
import { useRailLayout, type RailHubId } from "@/lib/railLayout";
import RailCustomize, { HUB_META, applyRailTemplateFromHash } from "./RailCustomize";

function RailItem({
  active,
  unread,
  badge,
  label,
  onClick,
  children,
  color,
  onContextMenu,
}: {
  active: boolean;
  unread?: boolean;
  badge?: number;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  color?: string;
  onContextMenu?: (e: React.MouseEvent) => void;
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
        onContextMenu={onContextMenu}
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

const HUB_ICON: Record<RailHubId, React.ReactNode> = {
  dm: <MessageCircle className="size-6" />,
  gram: <Aperture className="size-6" />,
  videos: <Clapperboard className="size-6" />,
  live: <Tv className="size-5" />,
  pulse: <Megaphone className="size-5" />,
  music: <Headphones className="size-6" />,
  cutroom: <span className="text-lg font-semibold leading-none">♩</span>,
  radio: <Radio className="size-5" />,
  games: <Gamepad2 className="size-6" />,
  apps: <AppWindow className="size-6" />,
  studio: <LayoutDashboard className="size-6" />,
  staff: <Crown className="size-5" />,
};

const HUB_COLOR: Partial<Record<RailHubId, string>> = {
  gram: "#c13584",
  videos: "#eb459e",
  live: "#9146ff",
  pulse: "#1d9bf0",
  music: "#1DB954",
  cutroom: "#c4a574",
  radio: "#ff2bd6",
  games: "#ff2bd6",
  apps: "#00a8fc",
  staff: "#eb459e",
};

function activateHub(id: RailHubId) {
  switch (id) {
    case "dm":
      useApp.setState({ hub: null });
      selectHome();
      break;
    case "gram":
      useApp.setState({ hub: "gram" });
      break;
    case "videos":
      useApp.setState({ hub: "videos" });
      break;
    case "live":
      openLiveHub();
      break;
    case "pulse":
      openPulse();
      break;
    case "music":
      useApp.setState({ hub: "music" });
      break;
    case "cutroom":
      openUntitled();
      break;
    case "radio":
      void openRadio();
      break;
    case "games":
      useApp.setState({ hub: "games" });
      break;
    case "apps":
      useApp.setState({ hub: "apps" });
      break;
    case "studio":
      useApp.setState({ hub: "studio" });
      break;
    case "staff":
      openStaffDesk();
      break;
  }
}

function hubActive(id: RailHubId, spaceId: string | null, hub: string | null) {
  switch (id) {
    case "dm":
      return spaceId === null && !hub;
    case "cutroom":
      return hub === "cutroom" || hub === "untitled";
    case "studio":
      return hub === "studio";
    default:
      return hub === id;
  }
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
  const favorites = useSpacePrefs((s) => s.favorites);
  const muted = useSpacePrefs((s) => s.muted);
  const entries = useRailLayout((s) => s.entries);
  const folders = useRailLayout((s) => s.folders);
  const ordered = useMemo(() => sortSpaces(spaces), [spaces, favorites]);
  const [customize, setCustomize] = useState(false);
  const [openFolder, setOpenFolder] = useState<string | null>(null);
  const folderPopRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    applyRailTemplateFromHash();
  }, []);

  useEffect(() => {
    if (!openFolder) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (folderPopRef.current?.contains(t)) return;
      setOpenFolder(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenFolder(null);
    };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [openFolder]);

  const homeBadge = useMemo(() => {
    const dms = chatList.reduce((n, c) => n + (unread[c.id] ?? 0), 0);
    const pending = friendships.filter((f) => f.status === "pending" && f.addressee_id === me).length;
    return dms + pending;
  }, [chatList, unread, friendships, me]);

  const staffOk = can.staffDesk();

  function renderHub(id: RailHubId) {
    if (id === "staff" && !staffOk) return null;
    const active = hubActive(id, spaceId, hub);
    const color = active ? HUB_COLOR[id] : undefined;
    return (
      <RailItem
        key={id}
        active={active}
        label={HUB_META[id].label}
        badge={id === "dm" ? homeBadge : undefined}
        onClick={() => activateHub(id)}
        color={color}
        onContextMenu={(e) => {
          e.preventDefault();
          setCustomize(true);
        }}
      >
        {HUB_ICON[id]}
      </RailItem>
    );
  }

  const openFolderData = openFolder ? folders[openFolder] : null;

  return (
    <>
      <nav className="flex h-full w-[72px] shrink-0 flex-col items-center gap-2 overflow-y-auto bg-rail py-3" aria-label="Servers">
        {entries.map((e) => {
          if (e.kind === "hub") return renderHub(e.id);
          const f = folders[e.id];
          if (!f) return null;
          const visibleItems = f.items.filter((id) => id !== "staff" || staffOk);
          if (!visibleItems.length && f.items.includes("staff") && !staffOk) return null;
          const anyActive = visibleItems.some((id) => hubActive(id, spaceId, hub));
          return (
            <div key={e.id} className="relative flex w-full justify-center" ref={openFolder === e.id ? folderPopRef : undefined}>
              <RailItem
                active={anyActive || openFolder === e.id}
                label={f.name}
                onClick={() => setOpenFolder((cur) => (cur === e.id ? null : e.id))}
                color={f.color}
                onContextMenu={(ev) => {
                  ev.preventDefault();
                  setCustomize(true);
                }}
              >
                <span className="relative grid size-full place-items-center">
                  <Folder className="size-5 opacity-90" />
                  <span className="absolute bottom-1 text-[9px] font-bold leading-none">{visibleItems.length}</span>
                </span>
              </RailItem>
              {openFolder === e.id && openFolderData && (
                <div className="absolute top-0 left-[calc(100%+8px)] z-40 flex min-w-[200px] flex-col gap-1 rounded-2xl border border-white/10 bg-[#1e1f22] p-2 shadow-2xl">
                  <div className="truncate px-2 pb-1 text-xs font-bold text-sub">{openFolderData.name}</div>
                  {visibleItems.map((id) => {
                    const active = hubActive(id, spaceId, hub);
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => {
                          activateHub(id);
                          setOpenFolder(null);
                        }}
                        className={cn(
                          "flex items-center gap-2 rounded-xl px-2 py-2 text-left text-sm font-semibold transition",
                          active ? "bg-accent text-white" : "hover:bg-white/5",
                        )}
                      >
                        <span
                          className="grid size-9 place-items-center rounded-xl text-white"
                          style={{ background: active ? HUB_COLOR[id] || "var(--accent)" : "rgba(255,255,255,.08)" }}
                        >
                          {HUB_ICON[id]}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{HUB_META[id].label}</span>
                      </button>
                    );
                  })}
                  {!visibleItems.length && <div className="px-2 py-2 text-xs text-sub">Empty folder</div>}
                </div>
              )}
            </div>
          );
        })}

        <button
          type="button"
          title="Customize rail"
          aria-label="Customize rail"
          onClick={() => setCustomize(true)}
          className="grid size-9 place-items-center rounded-full text-sub transition hover:bg-white/5 hover:text-txt"
        >
          <Pencil className="size-4" />
        </button>

        <div className="mx-auto h-0.5 w-8 rounded bg-line" />
        {ordered.map((sp) => {
          const quiet = muted.includes(sp.id);
          const spaceUnread = !quiet && (channels[sp.id] ?? []).some((c) => (unread[c.id] ?? 0) > 0);
          const fav = favorites.includes(sp.id);
          return (
            <RailItem
              key={sp.id}
              active={spaceId === sp.id && !hub}
              unread={spaceUnread}
              label={quiet ? `${sp.name} (muted)` : sp.name}
              onClick={() => (useApp.setState({ hub: null }), void selectSpace(sp.id))}
              color={sp.icon_url ? undefined : sp.icon_color}
            >
              {sp.icon_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={sp.icon_url} alt="" className={cn("size-12 rounded-[inherit] object-cover", quiet && "opacity-55")} />
              ) : (
                <span className={cn("text-base font-semibold", quiet && "opacity-55")}>{initials(sp.name)}</span>
              )}
              {fav && <Star className="absolute -top-0.5 -right-0.5 size-3 fill-amber-400 text-amber-400 drop-shadow" />}
              {quiet && <BellOff className="absolute -right-0.5 -bottom-0.5 size-3 text-sub drop-shadow" />}
            </RailItem>
          );
        })}
        <RailItem active={false} label="Add a Server" onClick={() => openModal("createSpace")}>
          <Plus className="size-6 text-ok group-hover:text-white" />
        </RailItem>
      </nav>
      <RailCustomize open={customize} onClose={() => setCustomize(false)} />
    </>
  );
}
