"use client";

import { ActivityText, NowPlayingCard, liveNow } from "@/components/profile/NowPlaying";
import { useEffect, useMemo } from "react";
import { Crown, LogOut, MessageCircle, Phone, Video } from "lucide-react";
import { useApp, findChannel, openProfileCard } from "@/store/app";
import NameTag, { Badges } from "@/components/ui/NameTag";
import { startCall, useCall } from "@/lib/call";
import { leaveGroup, loadConvMembers } from "@/lib/data";
import { cn } from "@/lib/utils";
import Avatar, { statusLabel } from "@/components/ui/Avatar";
import type { SpaceMember } from "@/lib/types";

const EMPTY_IDS: string[] = [];
const EMPTY_MEMBERS: SpaceMember[] = [];

export default function MemberList({ conversationId }: { conversationId: string }) {
  const chat = useApp((s) => s.chatList.find((c) => c.id === conversationId));
  const channel = useApp((s) => findChannel(s, conversationId));
  const convMembers = useApp((s) => s.convMembers[conversationId] ?? EMPTY_IDS);
  const spaceMembers = useApp((s) => (channel?.space_id ? s.spaceMembers[channel.space_id] ?? EMPTY_MEMBERS : EMPTY_MEMBERS));
  const presence = useApp((s) => s.presence);
  const profiles = useApp((s) => s.profiles);

  useEffect(() => {
    if (chat) void loadConvMembers(conversationId);
  }, [chat?.id, conversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  const ids = channel ? spaceMembers.map((m) => m.user_id) : convMembers;
  const roles = useMemo(() => Object.fromEntries(spaceMembers.map((m) => [m.user_id, m.role])), [spaceMembers]);

  if (chat?.kind === "dm" && chat.other_user_id) return <ProfilePanel userId={chat.other_user_id} conversationId={conversationId} />;

  const online = ids.filter((id) => presence[id]);
  const offline = ids.filter((id) => !presence[id]);
  const byName = (a: string, b: string) => (profiles[a]?.display_name ?? "").localeCompare(profiles[b]?.display_name ?? "");

  return (
    <div className="flex h-full flex-col">
      {chat?.kind === "group" && (
        <div className="border-b border-black/20 p-4 text-center">
          <Avatar name={chat.name} color="#2aabee" size={72} className="mx-auto" />
          <div className="mt-2 text-lg font-bold">{chat.name}</div>
          <div className="text-sm text-sub">
            {chat.member_count} members, {online.length} online
          </div>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        <Section title={`Online — ${online.length}`} ids={online.sort(byName)} roles={roles} />
        {offline.length > 0 && <Section title={`Offline — ${offline.length}`} ids={offline.sort(byName)} roles={roles} dim />}
      </div>
      {chat?.kind === "group" && (
        <button
          onClick={() => confirm("Leave this group?") && void leaveGroup(conversationId)}
          className="m-3 flex items-center justify-center gap-2 rounded-md bg-dnd/15 py-2 text-sm font-semibold text-dnd hover:bg-dnd hover:text-white"
        >
          <LogOut className="size-4" /> Leave group
        </button>
      )}
    </div>
  );
}

function Section({ title, ids, roles, dim }: { title: string; ids: string[]; roles: Record<string, string>; dim?: boolean }) {
  const profiles = useApp((s) => s.profiles);
  const presence = useApp((s) => s.presence);
  return (
    <div className="mb-4">
      <p className="mb-1 px-2 text-xs font-bold tracking-wide text-sub uppercase">{title}</p>
      {ids.map((id) => {
        const p = profiles[id];
        const pr = presence[id];
        return (
          <button
            key={id}
            onClick={(e) => openProfileCard(id, e)}
            className={cn("flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left hover:bg-hover", dim && "opacity-40 hover:opacity-100")}
          >
            <Avatar userId={id} size={34} showStatus={!dim} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1 truncate font-medium">
                <NameTag userId={id} />
                {roles[id] === "owner" && <Crown className="size-3.5 shrink-0 text-idle" aria-label="Space owner" />}
              </div>
              <div className="truncate text-xs text-sub">
                {pr?.voice ? "🔊 In voice" : <ActivityText userId={id} fallback={p?.custom_status || (dim ? "" : statusLabel(pr?.status))} />}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function ProfilePanel({ userId, conversationId }: { userId: string; conversationId: string }) {
  const p = useApp((s) => s.profiles[userId]);
  const status = useApp((s) => s.presence[userId]?.status);
  const inCall = useCall((s) => s.conversationId === conversationId && s.status !== "idle");
  if (!p) return null;
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="h-28 shrink-0" style={{ background: `linear-gradient(135deg, ${p.banner_color || p.avatar_color}, #1e1f22)` }} />
      <div className="-mt-12 px-4">
        <Avatar userId={userId} size={88} showStatus ringClass="ring-side" className="rounded-full ring-[6px] ring-side" />
        <div className="mt-3 text-xl font-bold">
          <NameTag userId={userId} badges={false} />
        </div>
        <div className="text-sm text-sub">@{p.username}</div>
        <Badges userId={userId} size="md" className="mt-2" max={12} />
        <div className="mt-1 text-sm text-sub">{statusLabel(status)}</div>
      </div>
      {p.custom_status && <div className="mx-4 mt-3 rounded-lg bg-panel p-3 text-sm">{p.custom_status}</div>}
      {liveNow(p.now_playing) && <NowPlayingCard np={liveNow(p.now_playing)!} className="mx-4 mt-3" />}
      {p.bio && (
        <div className="mx-4 mt-3 rounded-lg bg-panel p-3 text-sm">
          <div className="text-xs font-bold tracking-wide text-sub uppercase">About me</div>
          <p className="mt-1 whitespace-pre-wrap">{p.bio}</p>
        </div>
      )}
      <div className="mx-4 mt-3 rounded-lg bg-panel p-3 text-sm">
        <div className="text-xs font-bold tracking-wide text-sub uppercase">Member since</div>
        <div className="mt-1">{new Date(p.created_at).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" })}</div>
      </div>
      <div className="mx-4 mt-3 grid grid-cols-3 gap-2">
        <QuickBtn icon={<MessageCircle className="size-5" />} label="Message" onClick={() => {}} />
        <QuickBtn icon={<Phone className="size-5" />} label="Call" disabled={inCall} onClick={() => void startCall(conversationId)} />
        <QuickBtn icon={<Video className="size-5" />} label="Video" disabled={inCall} onClick={() => void startCall(conversationId, { video: true })} />
      </div>
    </div>
  );
}

function QuickBtn({ icon, label, onClick, disabled }: { icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className="flex flex-col items-center gap-1 rounded-lg bg-panel py-2.5 text-xs text-accent transition hover:bg-hover disabled:opacity-40"
    >
      {icon}
      {label}
    </button>
  );
}
