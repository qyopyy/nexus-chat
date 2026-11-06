"use client";

import { useChatFx } from "@/lib/chatFx";
import { TypingAnim } from "./TypingBubbles";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Bell, BellOff, Bookmark, Bot, ChevronLeft, Hash, Image as ImageIcon, Maximize2, MessageSquare, Phone, Search, Users, Video, Volume2 } from "lucide-react";
import { useApp, conversationTitle, findChannel, openProfileCard, toast } from "@/store/app";
import { haptic } from "@/lib/haptics";
import { useChat } from "@/store/chat";
import { useCall, startCall } from "@/lib/call";
import { clearChatWallpaper, fileToDataUrl, getChatWallpaper, setChatWallpaper, subscribeChatWallpapers } from "@/lib/chatWallpaper";
import { usePrefs, toggleMute } from "@/store/prefs";
import { cn } from "@/lib/utils";
import Avatar, { statusLabel } from "@/components/ui/Avatar";
import NameTag from "@/components/ui/NameTag";
import { useIsMobile } from "@/lib/useMobile";
import BotsPanel from "./BotsPanel";
import ChatSearch from "./ChatSearch";
import SavedMessages from "./SavedMessages";

const WALLPAPER_MAX_BYTES = 2 * 1024 * 1024;

export default function ChatHeader({
  conversationId,
  stageExpanded,
  onToggleStage,
}: {
  conversationId: string;
  stageExpanded: boolean;
  onToggleStage: () => void;
}) {
  const mobile = useIsMobile();
  const [bots, setBots] = useState(false);
  const [search, setSearch] = useState(false);
  const [saved, setSaved] = useState(false);
  const [wallpaperMenu, setWallpaperMenu] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const wallpaper = useSyncExternalStore(
    subscribeChatWallpapers,
    () => getChatWallpaper(conversationId),
    () => null,
  );
  const title = useApp((s) => conversationTitle(s, conversationId));
  const chat = useApp((s) => s.chatList.find((c) => c.id === conversationId));
  const channel = useApp((s) => findChannel(s, conversationId));
  const presence = useApp((s) => s.presence);
  const profiles = useApp((s) => s.profiles);
  const showMembers = useApp((s) => s.showMembers);
  const typing = useChat((s) => s.typing);
  const inThisCall = useCall((s) => s.status !== "idle" && s.conversationId === conversationId);
  const otherUnread = useApp((s) => Object.entries(s.unread).reduce((n, [id, c]) => n + (id !== conversationId && c > 0 ? 1 : 0), 0));
  const muted = usePrefs((s) => s.muted.includes(conversationId));

  const typers = useMemo(() => {
    const now = Date.now();
    return Object.entries(typing)
      .filter(([, exp]) => exp > now)
      .map(([id]) => profiles[id]?.display_name ?? "Someone");
  }, [typing, profiles]);

  const kind = chat?.kind ?? channel?.kind;
  let subtitle: React.ReactNode = null;
  if (typers.length) {
    subtitle = (
      <span className="flex items-center gap-1 text-accent">
        <TypingDots />
        {typers.length === 1 ? `${typers[0]} is typing` : `${typers.length} people are typing`}
      </span>
    );
  } else if (channel?.topic) {
    subtitle = <span className="text-sub">{channel.topic}</span>;
  } else if (chat?.kind === "dm" && chat.other_user_id) {
    const st = presence[chat.other_user_id]?.status;
    subtitle = <span className={st ? "text-accent" : "text-sub"}>{statusLabel(st).toLowerCase()}</span>;
  } else if (chat?.kind === "group") {
    subtitle = <span className="text-sub">{chat.member_count} members</span>;
  } else if (muted) {
    subtitle = <span className="text-sub">notifications muted</span>;
  }

  const canCall = kind === "dm" || kind === "group";

  useEffect(() => {
    setWallpaperMenu(false);
  }, [conversationId]);

  useEffect(() => {
    if (kind === "voice") return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f" && !e.shiftKey) {
        const t = e.target as HTMLElement | null;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
        e.preventDefault();
        setSearch(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [kind]);

  return (
    <header className="chat-header flex h-14 shrink-0 items-center gap-3 border-b border-black/25 bg-chat/90 px-3 shadow-sm backdrop-blur-xl max-md:gap-2 max-md:border-white/[.06] max-md:pl-0.5">
      <button
        onClick={() => {
          haptic.light();
          useApp.setState({ mobileSidebar: true });
        }}
        className="flex shrink-0 items-center text-accent active:opacity-50 md:hidden"
        aria-label="Back"
      >
        <ChevronLeft className="size-8" strokeWidth={2.2} />
        {otherUnread > 0 && <span className="-ml-1 min-w-[22px] rounded-full bg-accent px-1.5 text-center text-[13px] leading-[22px] font-bold text-white">{otherUnread}</span>}
      </button>

      {kind === "dm" && chat?.other_user_id ? (
        <button onClick={(e) => openProfileCard(chat.other_user_id!, e)} className="shrink-0 rounded-full active:scale-95" aria-label="View profile">
          <Avatar userId={chat.other_user_id} size={38} showStatus ringClass="ring-chat" />
        </button>
      ) : kind === "group" ? (
        <Avatar name={title} color="#2aabee" size={36} />
      ) : kind === "voice" ? (
        <Volume2 className="size-6 text-sub" />
      ) : (
        <Hash className="size-6 text-sub" />
      )}

      <div className="min-w-0 flex-1 leading-tight">
        <div className="flex min-w-0 items-center gap-1.5">
          <div className="truncate font-semibold">
            {kind === "dm" && chat?.other_user_id ? <NameTag userId={chat.other_user_id} maxBadges={mobile ? 3 : 6} /> : title}
          </div>
          {muted && <BellOff className="size-3.5 shrink-0 text-sub" aria-hidden />}
        </div>
        {subtitle && <div className="truncate text-xs">{subtitle}</div>}
      </div>

      <div className="flex items-center gap-1">
        {canCall && !inThisCall && (
          <>
            <HeaderBtn label="Start voice call" onClick={() => void startCall(conversationId)}>
              <Phone className="size-5" />
            </HeaderBtn>
            <HeaderBtn label="Start video call" onClick={() => void startCall(conversationId, { video: true })}>
              <Video className="size-5" />
            </HeaderBtn>
          </>
        )}
        {inThisCall && (
          <HeaderBtn label={stageExpanded ? "Show chat" : "Expand call"} onClick={onToggleStage} active={!stageExpanded}>
            {stageExpanded ? <MessageSquare className="size-5" /> : <Maximize2 className="size-5" />}
          </HeaderBtn>
        )}
        {kind !== "voice" && (
          <HeaderBtn
            label={muted ? "Unmute notifications" : "Mute notifications"}
            active={muted}
            onClick={() => {
              haptic.light();
              toggleMute(conversationId);
            }}
          >
            {muted ? <BellOff className="size-5" /> : <Bell className="size-5" />}
          </HeaderBtn>
        )}
        {kind !== "voice" && (
          <HeaderBtn label="Find in chat" onClick={() => setSearch(true)}>
            <Search className="size-5" />
          </HeaderBtn>
        )}
        {kind !== "voice" && (
          <HeaderBtn label="Saved messages" onClick={() => setSaved(true)}>
            <Bookmark className="size-5" />
          </HeaderBtn>
        )}
        {kind !== "voice" && (
          <HeaderBtn label="Bots & webhooks" onClick={() => setBots(true)}>
            <Bot className="size-5" />
          </HeaderBtn>
        )}
        {kind !== "voice" && (
          <div className="relative">
            <HeaderBtn
              label="Chat wallpaper"
              active={!!wallpaper || wallpaperMenu}
              onClick={() => {
                haptic.light();
                setWallpaperMenu((v) => !v);
              }}
            >
              <ImageIcon className="size-5" />
            </HeaderBtn>
            {wallpaperMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setWallpaperMenu(false)} />
                <div className="absolute top-11 right-0 z-50 w-56 animate-pop rounded-2xl bg-menu p-1.5 shadow-2xl ring-1 ring-white/10">
                  <button
                    type="button"
                    className="flex w-full items-center rounded-xl px-3 py-2.5 text-left text-sm font-semibold hover:bg-hover"
                    onClick={() => {
                      setWallpaperMenu(false);
                      const url = window.prompt("Wallpaper image URL", wallpaper?.startsWith("data:") ? "" : wallpaper ?? "");
                      if (url === null) return;
                      const trimmed = url.trim();
                      if (!trimmed) {
                        clearChatWallpaper(conversationId);
                        toast("Wallpaper cleared", "info");
                        return;
                      }
                      setChatWallpaper(conversationId, trimmed);
                      toast("Wallpaper set for this chat", "success");
                    }}
                  >
                    Set from URL
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center rounded-xl px-3 py-2.5 text-left text-sm font-semibold hover:bg-hover"
                    onClick={() => {
                      setWallpaperMenu(false);
                      fileRef.current?.click();
                    }}
                  >
                    Upload image
                  </button>
                  {wallpaper && (
                    <button
                      type="button"
                      className="flex w-full items-center rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-dnd hover:bg-hover"
                      onClick={() => {
                        setWallpaperMenu(false);
                        clearChatWallpaper(conversationId);
                        toast("Wallpaper cleared", "info");
                      }}
                    >
                      Clear wallpaper
                    </button>
                  )}
                </div>
              </>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                if (!f.type.startsWith("image/")) return toast("Pick an image file", "error");
                if (f.size > WALLPAPER_MAX_BYTES) return toast("Max 2 MB for chat wallpapers", "error");
                void fileToDataUrl(f)
                  .then((dataUrl) => {
                    setChatWallpaper(conversationId, dataUrl);
                    toast("Wallpaper set for this chat", "success");
                  })
                  .catch(() => toast("Could not read that image", "error"));
              }}
            />
          </div>
        )}
        {kind !== "voice" && (
          <HeaderBtn label={showMembers ? "Hide member list" : "Show member list"} active={showMembers} onClick={() => useApp.setState({ showMembers: !showMembers })} className="hidden lg:grid">
            <Users className="size-5" />
          </HeaderBtn>
        )}
      </div>
      {bots && <BotsPanel conversationId={conversationId} spaceId={channel?.space_id} open onClose={() => setBots(false)} />}
      <ChatSearch conversationId={conversationId} open={search} onClose={() => setSearch(false)} />
      <SavedMessages open={saved} onClose={() => setSaved(false)} />
    </header>
  );
}

function HeaderBtn({
  children,
  label,
  onClick,
  active,
  disabled,
  className,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={cn(
        "grid size-9 place-items-center rounded-full transition hover:bg-hover disabled:opacity-40",
        active ? "text-txt" : "text-sub hover:text-txt",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function TypingDots() {
  const style = useChatFx((s) => s.style);
  return <TypingAnim style={style} className="origin-left scale-[.6]" />;
}
export function TypingDotsClassic() {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[0, 150, 300].map((d) => (
        <span key={d} className="size-1 animate-bounce rounded-full bg-current" style={{ animationDelay: `${d}ms` }} />
      ))}
    </span>
  );
}
