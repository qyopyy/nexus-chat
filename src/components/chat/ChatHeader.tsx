"use client";

import { useMemo } from "react";
import { ArrowLeft, Hash, Maximize2, MessageSquare, Phone, Users, Video, Volume2 } from "lucide-react";
import { useApp, conversationTitle, findChannel } from "@/store/app";
import { useChat } from "@/store/chat";
import { useCall, startCall } from "@/lib/call";
import { cn } from "@/lib/utils";
import Avatar, { statusLabel } from "@/components/ui/Avatar";
import NameTag from "@/components/ui/NameTag";

export default function ChatHeader({
  conversationId,
  stageExpanded,
  onToggleStage,
}: {
  conversationId: string;
  stageExpanded: boolean;
  onToggleStage: () => void;
}) {
  const title = useApp((s) => conversationTitle(s, conversationId));
  const chat = useApp((s) => s.chatList.find((c) => c.id === conversationId));
  const channel = useApp((s) => findChannel(s, conversationId));
  const presence = useApp((s) => s.presence);
  const profiles = useApp((s) => s.profiles);
  const showMembers = useApp((s) => s.showMembers);
  const typing = useChat((s) => s.typing);
  const inThisCall = useCall((s) => s.status !== "idle" && s.conversationId === conversationId);

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
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-black/25 bg-chat px-3 shadow-sm">
      <button onClick={() => useApp.setState({ mobileSidebar: true })} className="rounded p-1 text-sub hover:text-txt md:hidden" aria-label="Back">
        <ArrowLeft className="size-5" />
      </button>

      {kind === "dm" && chat?.other_user_id ? (
        <Avatar userId={chat.other_user_id} size={36} showStatus ringClass="ring-chat" />
      ) : kind === "group" ? (
        <Avatar name={title} color="#2aabee" size={36} />
      ) : kind === "voice" ? (
        <Volume2 className="size-6 text-sub" />
      ) : (
        <Hash className="size-6 text-sub" />
      )}

      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate font-semibold">
          {kind === "dm" && chat?.other_user_id ? <NameTag userId={chat.other_user_id} /> : title}
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
          <HeaderBtn label={showMembers ? "Hide member list" : "Show member list"} active={showMembers} onClick={() => useApp.setState({ showMembers: !showMembers })} className="hidden lg:grid">
            <Users className="size-5" />
          </HeaderBtn>
        )}
      </div>
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
