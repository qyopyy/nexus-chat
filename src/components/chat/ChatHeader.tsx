"use client";

import { useMemo, useState } from "react";
import { Bot, ChevronLeft, Hash, Maximize2, MessageSquare, Phone, Users, Video, Volume2 } from "lucide-react";
import { useApp, conversationTitle, findChannel, openProfileCard } from "@/store/app";
import { haptic } from "@/lib/haptics";
import { useChat } from "@/store/chat";
import { useCall, startCall } from "@/lib/call";
import { cn } from "@/lib/utils";
import Avatar, { statusLabel } from "@/components/ui/Avatar";
import NameTag from "@/components/ui/NameTag";
import { useIsMobile } from "@/lib/useMobile";
import BotsPanel from "./BotsPanel";

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
  const title = useApp((s) => conversationTitle(s, conversationId));
  const chat = useApp((s) => s.chatList.find((c) => c.id === conversationId));
  const channel = useApp((s) => findChannel(s, conversationId));
  const presence = useApp((s) => s.presence);
  const profiles = useApp((s) => s.profiles);
  const showMembers = useApp((s) => s.showMembers);
  const typing = useChat((s) => s.typing);
  const inThisCall = useCall((s) => s.status !== "idle" && s.conversationId === conversationId);
  const otherUnread = useApp((s) => Object.entries(s.unread).reduce((n, [id, c]) => n + (id !== conversationId && c > 0 ? 1 : 0), 0));

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
  } else if (chat?.kind === "dm" && chat.other_user_id) {
    const st = presence[chat.other_user_id]?.status;
    subtitle = <span className={st ? "text-accent" : "text-sub"}>{statusLabel(st).toLowerCase()}</span>;
  } else if (chat?.kind === "group") {
    subtitle = <span className="text-sub">{chat.member_count} members</span>;
  }

  const canCall = kind === "dm" || kind === "group";

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
        <div className="truncate font-semibold">
          {kind === "dm" && chat?.other_user_id ? <NameTag userId={chat.other_user_id} maxBadges={mobile ? 3 : 6} /> : title}
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
          <HeaderBtn label="Bots & webhooks" onClick={() => setBots(true)}>
            <Bot className="size-5" />
          </HeaderBtn>
        )}
        {kind !== "voice" && (
          <HeaderBtn label={showMembers ? "Hide member list" : "Show member list"} active={showMembers} onClick={() => useApp.setState({ showMembers: !showMembers })} className="hidden lg:grid">
            <Users className="size-5" />
          </HeaderBtn>
        )}
      </div>
      {bots && <BotsPanel conversationId={conversationId} open onClose={() => setBots(false)} />}
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
  return (
    <span className="inline-flex items-center gap-0.5">
      {[0, 150, 300].map((d) => (
        <span key={d} className="size-1 animate-bounce rounded-full bg-current" style={{ animationDelay: `${d}ms` }} />
      ))}
    </span>
  );
}
