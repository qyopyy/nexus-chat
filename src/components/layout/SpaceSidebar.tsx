"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BellOff, CalendarDays, CheckCheck, ChevronDown, Gauge, Hash, LayoutDashboard, Lock, Star, Trophy, HeadphoneOff, LogOut, MicOff, MonitorUp, Plus, Trash2, UserPlus, Video, Volume2 } from "lucide-react";
import { useApp, openModal, toast } from "@/store/app";
import { useCall, joinCall, unlockCallAudio } from "@/lib/call";
import { deleteSpace, leaveSpace, markSpaceRead, openConversation } from "@/lib/data";
import { cn } from "@/lib/utils";
import {
  EMPTY_SPACE_LIST,
  toggleCollapsedCategory,
  toggleFavoriteSpace,
  toggleMuteSpace,
  useSpacePrefs,
} from "@/lib/spacePrefs";
import Avatar from "@/components/ui/Avatar";
import SpaceMusic from "@/components/music/SpaceMusic";
import ServerHub, { WelcomeGate } from "@/components/space/ServerHub";
import type { Conversation, SpaceMember } from "@/lib/types";

const EMPTY_C: Conversation[] = [];
const EMPTY_M: SpaceMember[] = [];

export default function SpaceSidebar({ spaceId }: { spaceId: string }) {
  const space = useApp((s) => s.spaces.find((x) => x.id === spaceId));
  const channels = useApp((s) => s.channels[spaceId] ?? EMPTY_C);
  const conversationId = useApp((s) => s.conversationId);
  const unread = useApp((s) => s.unread);
  const presence = useApp((s) => s.presence);
  const profiles = useApp((s) => s.profiles);
  const me = useApp((s) => s.userId);
  const callConv = useCall((s) => (s.status !== "idle" ? s.conversationId : null));
  const participants = useCall((s) => s.participants);
  const mySpeaking = useCall((s) => s.speaking);
  const [menu, setMenu] = useState(false);
  const [hub, setHub] = useState<null | "home" | "look" | "invites" | "roles" | "events" | "levels" | "members">(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // Stable empty fallbacks — `?? []` in a Zustand selector re-renders forever (React #185).
  const members = useApp((s) => s.spaceMembers[spaceId] ?? EMPTY_M);
  const isOwner = space?.owner_id === me;
  const isStaff = isOwner || members.find((m) => m.user_id === me)?.role === "admin";
  const fav = useSpacePrefs((s) => s.favorites.includes(spaceId));
  const quiet = useSpacePrefs((s) => s.muted.includes(spaceId));
  const collapsedForSpace = useSpacePrefs((s) => s.collapsed[spaceId] ?? EMPTY_SPACE_LIST);
  const textCollapsed = collapsedForSpace.includes("Text Channels");
  const voiceCollapsed = collapsedForSpace.includes("Voice Channels");

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => !menuRef.current?.contains(e.target as Node) && setMenu(false);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [menu]);

  const text = channels.filter((c) => c.kind === "text");
  const voice = channels.filter((c) => c.kind === "voice");
  const unreadTotal = channels.reduce((n, c) => n + (unread[c.id] ?? 0), 0);

  const voiceUsers = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const p of Object.values(presence)) if (p.voice) (map[p.voice] ??= []).push(p.user_id);
    // make sure I show up immediately even before presence round-trips
    if (callConv && me && !(map[callConv] ?? []).includes(me)) (map[callConv] ??= []).push(me);
    return map;
  }, [presence, callConv, me]);

  if (!space) return null;

  return (
    <div
      className="flex h-full flex-col"
      style={
        space.background_url
          ? { backgroundImage: `linear-gradient(180deg, rgba(10,10,14,.82), rgba(10,10,14,.92)), url(${space.background_url})`, backgroundSize: "cover", backgroundPosition: "center" }
          : undefined
      }
    >
      <div ref={menuRef} className="relative">
        <button
          onClick={() => setMenu((v) => !v)}
          className="flex h-12 w-full items-center justify-between gap-2 border-b border-black/25 px-3 font-semibold shadow-sm transition hover:bg-hover"
        >
          <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-lg text-[11px] font-black text-white" style={{ background: space.icon_color }}>
            {space.icon_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={space.icon_url} alt="" className="size-full object-cover" />
            ) : (
              space.name.slice(0, 2).toUpperCase()
            )}
          </span>
          <span className="min-w-0 flex-1 truncate text-left">{space.name}</span>
          <ChevronDown className={cn("size-4 shrink-0 transition", menu && "rotate-180")} />
        </button>
        {menu && (
          <div className="absolute inset-x-2 top-14 z-30 animate-pop rounded-lg bg-menu p-1.5 text-sm shadow-2xl">
            <MenuItem icon={<UserPlus className="size-4" />} label="Invite People" accent onClick={() => (setMenu(false), openModal("spaceInvite", spaceId))} />
            <MenuItem icon={<LayoutDashboard className="size-4" />} label="Server Hub" onClick={() => (setMenu(false), setHub("home"))} />
            {isStaff && <MenuItem icon={<Plus className="size-4" />} label="Server look & invites" onClick={() => (setMenu(false), setHub("look"))} />}
            <MenuItem icon={<CalendarDays className="size-4" />} label="Events" onClick={() => (setMenu(false), setHub("events"))} />
            <MenuItem icon={<Trophy className="size-4" />} label="Levels & Leaderboard" onClick={() => (setMenu(false), setHub("levels"))} />
            {isStaff && (
              <MenuItem icon={<Plus className="size-4" />} label="Create Channel" onClick={() => (setMenu(false), openModal("createChannel", spaceId))} />
            )}
            <div className="my-1 h-px bg-line" />
            <MenuItem
              icon={<Star className={cn("size-4", fav && "fill-amber-400 text-amber-400")} />}
              label={fav ? "Unfavorite server" : "Favorite server"}
              onClick={() => (setMenu(false), toggleFavoriteSpace(spaceId))}
            />
            <MenuItem
              icon={<BellOff className="size-4" />}
              label={quiet ? "Unmute server" : "Mute server"}
              onClick={() => {
                setMenu(false);
                toggleMuteSpace(spaceId);
                toast(quiet ? "Server unmuted" : "Server muted", "info");
              }}
            />
            {unreadTotal > 0 && (
              <MenuItem
                icon={<CheckCheck className="size-4" />}
                label="Mark all as read"
                onClick={() => (setMenu(false), void markSpaceRead(spaceId))}
              />
            )}
            <div className="my-1 h-px bg-line" />
            {isOwner ? (
              <MenuItem
                icon={<Trash2 className="size-4" />}
                label="Delete Server"
                danger
                onClick={() => {
                  setMenu(false);
                  if (confirm(`Delete "${space.name}" for everyone? This can't be undone.`)) void deleteSpace(spaceId);
                }}
              />
            ) : (
              <MenuItem
                icon={<LogOut className="size-4" />}
                label="Leave Server"
                danger
                onClick={() => {
                  setMenu(false);
                  if (confirm(`Leave "${space.name}"?`)) void leaveSpace(spaceId);
                }}
              />
            )}
          </div>
        )}
      </div>

      {hub && <ServerHub spaceId={spaceId} initial={hub} onClose={() => setHub(null)} />}
      <WelcomeGate spaceId={spaceId} />
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        <div className="mb-3 grid grid-cols-3 gap-1">
          {([
            ["home", "Hub", <LayoutDashboard key="h" className="size-4" />],
            ["events", "Events", <CalendarDays key="e" className="size-4" />],
            ["levels", "Levels", <Trophy key="l" className="size-4" />],
          ] as const).map(([id, label, icon]) => (
            <button key={id} onClick={() => setHub(id)} className="flex flex-col items-center gap-0.5 rounded-lg bg-black/15 py-1.5 text-[11px] font-semibold text-sub transition hover:bg-hover hover:text-txt">
              {icon}
              {label}
            </button>
          ))}
        </div>
        <Category
          label="Text Channels"
          collapsed={textCollapsed}
          onToggle={() => toggleCollapsedCategory(spaceId, "Text Channels")}
          onAdd={isStaff ? () => openModal("createChannel", spaceId) : undefined}
        />
        {!textCollapsed && text.map((c) => {
          const n = unread[c.id] ?? 0;
          const active = conversationId === c.id;
          const locked = !!c.password_hash || !!c.is_private;
          return (
            <button
              key={c.id}
              onClick={() => openConversation(c.id, spaceId)}
              className={cn(
                "group relative mb-0.5 flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left transition",
                active ? "bg-active text-white" : n > 0 ? "text-white hover:bg-hover" : "text-sub hover:bg-hover hover:text-txt",
              )}
            >
              {n > 0 && !active && <span className="absolute top-1/2 -left-2 h-2 w-1 -translate-y-1/2 rounded-r-full bg-white" />}
              {locked ? <Lock className="size-4 shrink-0 opacity-70" /> : <Hash className="size-5 shrink-0 opacity-70" />}
              <span className={cn("truncate", n > 0 && "font-semibold")}>{c.name}</span>
              {c.nsfw && <span className="rounded bg-dnd/80 px-1 text-[9px] font-black text-white">18+</span>}
              {!!c.slowmode && <Gauge className="size-3.5 shrink-0 opacity-60" aria-label="Slow mode" />}
              {n > 0 && !active && !quiet && (
                <span className="ml-auto rounded-full bg-dnd px-1.5 text-[11px] font-bold text-white">{n}</span>
              )}
              {n > 0 && !active && quiet && <span className="ml-auto size-2 rounded-full bg-sub" />}
            </button>
          );
        })}

        <div className="h-4" />
        <Category
          label="Voice Channels"
          collapsed={voiceCollapsed}
          onToggle={() => toggleCollapsedCategory(spaceId, "Voice Channels")}
          onAdd={isStaff ? () => openModal("createChannel", spaceId) : undefined}
        />
        {!voiceCollapsed && voice.map((c) => {
          const users = voiceUsers[c.id] ?? [];
          const active = conversationId === c.id;
          const connected = callConv === c.id;
          const locked = !!c.password_hash || !!c.is_private;
          return (
            <div key={c.id} className="mb-0.5">
              <button
                onClick={() => {
                  openConversation(c.id, spaceId);
                  if (!connected && !c.password_hash) {
                    unlockCallAudio();
                    void joinCall(c.id);
                  }
                }}
                className={cn(
                  "flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left transition",
                  active ? "bg-active text-white" : connected ? "text-white hover:bg-hover" : "text-sub hover:bg-hover hover:text-txt",
                )}
              >
                {locked ? <Lock className={cn("size-4 shrink-0", connected ? "text-ok" : "opacity-70")} /> : <Volume2 className={cn("size-5 shrink-0", connected ? "text-ok" : "opacity-70")} />}
                <span className="truncate">{c.name}</span>
                {c.nsfw && <span className="rounded bg-dnd/80 px-1 text-[9px] font-black text-white">18+</span>}
                {users.length > 0 && <span className="ml-auto text-xs text-sub">{users.length}</span>}
              </button>
              {users.map((uid) => {
                const pr = presence[uid];
                const inMyCall = connected;
                const speaking = inMyCall ? (uid === me ? mySpeaking : participants[uid]?.speaking ?? false) : false;
                return (
                  <div key={uid} className="ml-7 flex items-center gap-2 rounded-md px-2 py-1 text-sm text-sub hover:bg-hover">
                    <Avatar userId={uid} size={24} speaking={speaking} />
                    <span className={cn("truncate", speaking && "text-txt")}>{profiles[uid]?.display_name ?? "…"}</span>
                    <span className="ml-auto flex items-center gap-1">
                      {pr?.screen && <span className="rounded bg-dnd px-1 text-[10px] font-bold text-white">LIVE</span>}
                      {pr?.video && <Video className="size-3.5" />}
                      {pr?.deafened ? <HeadphoneOff className="size-3.5 text-dnd" /> : pr?.muted ? <MicOff className="size-3.5 text-dnd" /> : null}
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })}
        {voice.length === 0 && text.length === 0 && <p className="px-2 text-sm text-sub">No channels yet.</p>}
        <SpaceMusic spaceId={spaceId} />
        <p className="mt-6 flex items-center gap-1.5 px-2 text-xs text-faint">
          <MonitorUp className="size-3.5" /> Join a voice channel to talk, stream & share your screen.
        </p>
      </div>
    </div>
  );
}

function Category({ label, onAdd, collapsed, onToggle }: { label: string; onAdd?: () => void; collapsed?: boolean; onToggle?: () => void }) {
  return (
    <div className="group mb-1 flex items-center justify-between px-1 text-xs font-bold tracking-wide text-sub uppercase">
      <button type="button" onClick={onToggle} className="flex items-center gap-0.5 hover:text-txt">
        <ChevronDown className={cn("size-3 transition", collapsed && "-rotate-90")} />
        {label}
      </button>
      {onAdd && (
        <button onClick={onAdd} className="opacity-0 transition group-hover:opacity-100 hover:text-txt" title="Create channel">
          <Plus className="size-4" />
        </button>
      )}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  danger,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
  accent?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-between rounded px-2 py-2 transition",
        danger ? "text-dnd hover:bg-dnd hover:text-white" : accent ? "text-accent hover:bg-accent hover:text-white" : "text-txt hover:bg-accent hover:text-white",
      )}
    >
      {label}
      {icon}
    </button>
  );
}
