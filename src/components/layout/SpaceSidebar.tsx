"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Hash, HeadphoneOff, LogOut, MicOff, MonitorUp, Plus, Trash2, UserPlus, Video, Volume2 } from "lucide-react";
import { useApp, openModal } from "@/store/app";
import { useCall, joinCall } from "@/lib/call";
import { deleteSpace, leaveSpace, openConversation } from "@/lib/data";
import { cn } from "@/lib/utils";
import Avatar from "@/components/ui/Avatar";
import type { Conversation } from "@/lib/types";

const EMPTY: Conversation[] = [];

export default function SpaceSidebar({ spaceId }: { spaceId: string }) {
  const space = useApp((s) => s.spaces.find((x) => x.id === spaceId));
  const channels = useApp((s) => s.channels[spaceId] ?? EMPTY);
  const conversationId = useApp((s) => s.conversationId);
  const unread = useApp((s) => s.unread);
  const presence = useApp((s) => s.presence);
  const profiles = useApp((s) => s.profiles);
  const me = useApp((s) => s.userId);
  const callConv = useCall((s) => (s.status !== "idle" ? s.conversationId : null));
  const participants = useCall((s) => s.participants);
  const mySpeaking = useCall((s) => s.speaking);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const isOwner = space?.owner_id === me;

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => !menuRef.current?.contains(e.target as Node) && setMenu(false);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [menu]);

  const text = channels.filter((c) => c.kind === "text");
  const voice = channels.filter((c) => c.kind === "voice");

  const voiceUsers = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const p of Object.values(presence)) if (p.voice) (map[p.voice] ??= []).push(p.user_id);
    // make sure I show up immediately even before presence round-trips
    if (callConv && me && !(map[callConv] ?? []).includes(me)) (map[callConv] ??= []).push(me);
    return map;
  }, [presence, callConv, me]);

  if (!space) return null;

  return (
    <div className="flex h-full flex-col">
      <div ref={menuRef} className="relative">
        <button
          onClick={() => setMenu((v) => !v)}
          className="flex h-12 w-full items-center justify-between border-b border-black/25 px-4 font-semibold shadow-sm transition hover:bg-hover"
        >
          <span className="truncate">{space.name}</span>
          <ChevronDown className={cn("size-4 transition", menu && "rotate-180")} />
        </button>
        {menu && (
          <div className="absolute inset-x-2 top-14 z-30 animate-pop rounded-lg bg-menu p-1.5 text-sm shadow-2xl">
            <MenuItem icon={<UserPlus className="size-4" />} label="Invite People" accent onClick={() => (setMenu(false), openModal("spaceInvite", spaceId))} />
            {isOwner && (
              <MenuItem icon={<Plus className="size-4" />} label="Create Channel" onClick={() => (setMenu(false), openModal("createChannel", spaceId))} />
            )}
            <div className="my-1 h-px bg-line" />
            {isOwner ? (
              <MenuItem
                icon={<Trash2 className="size-4" />}
                label="Delete Space"
                danger
                onClick={() => {
                  setMenu(false);
                  if (confirm(`Delete "${space.name}" for everyone? This can't be undone.`)) void deleteSpace(spaceId);
                }}
              />
            ) : (
              <MenuItem
                icon={<LogOut className="size-4" />}
                label="Leave Space"
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

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        <Category label="Text Channels" onAdd={isOwner ? () => openModal("createChannel", spaceId) : undefined} />
        {text.map((c) => {
          const n = unread[c.id] ?? 0;
          const active = conversationId === c.id;
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
              <Hash className="size-5 shrink-0 opacity-70" />
              <span className={cn("truncate", n > 0 && "font-semibold")}>{c.name}</span>
              {n > 0 && !active && (
                <span className="ml-auto rounded-full bg-dnd px-1.5 text-[11px] font-bold text-white">{n}</span>
              )}
            </button>
          );
        })}

        <div className="h-4" />
        <Category label="Voice Channels" onAdd={isOwner ? () => openModal("createChannel", spaceId) : undefined} />
        {voice.map((c) => {
          const users = voiceUsers[c.id] ?? [];
          const active = conversationId === c.id;
          const connected = callConv === c.id;
          return (
            <div key={c.id} className="mb-0.5">
              <button
                onClick={() => {
                  openConversation(c.id, spaceId);
                  if (!connected) void joinCall(c.id);
                }}
                className={cn(
                  "flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left transition",
                  active ? "bg-active text-white" : connected ? "text-white hover:bg-hover" : "text-sub hover:bg-hover hover:text-txt",
                )}
              >
                <Volume2 className={cn("size-5 shrink-0", connected ? "text-ok" : "opacity-70")} />
                <span className="truncate">{c.name}</span>
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
        <p className="mt-6 flex items-center gap-1.5 px-2 text-xs text-faint">
          <MonitorUp className="size-3.5" /> Join a voice channel to talk, stream & share your screen.
        </p>
      </div>
    </div>
  );
}

function Category({ label, onAdd }: { label: string; onAdd?: () => void }) {
  return (
    <div className="group mb-1 flex items-center justify-between px-1 text-xs font-bold tracking-wide text-sub uppercase">
      <span className="flex items-center gap-0.5">
        <ChevronDown className="size-3" />
        {label}
      </span>
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
