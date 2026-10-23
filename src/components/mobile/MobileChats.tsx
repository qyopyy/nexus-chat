"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BellOff, Bell, CheckCheck, Mic, Phone, Pin, PinOff, Search, SquarePen, Users, X } from "lucide-react";
import { useApp, openModal } from "@/store/app";
import { usePrefs, toggleMute, togglePin } from "@/store/prefs";
import { friendIds, markRead, openConversation, openDM } from "@/lib/data";
import { cn, formatListTime } from "@/lib/utils";
import Avatar from "@/components/ui/Avatar";
import NameTag from "@/components/ui/NameTag";
import Sheet, { SheetGroup, SheetItem } from "@/components/ui/Sheet";
import StoriesStrip from "./StoriesStrip";
import PushPrompt from "./PushPrompt";
import SwipeRow from "./SwipeRow";
import LargeTitle from "./LargeTitle";
import type { ChatListItem } from "@/lib/types";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "dm", label: "Personal" },
  { id: "group", label: "Groups" },
  { id: "unread", label: "Unread" },
] as const;

export default function MobileChats() {
  const chatList = useApp((s) => s.chatList);
  const profiles = useApp((s) => s.profiles);
  const unread = useApp((s) => s.unread);
  const presence = useApp((s) => s.presence);
  const pendingFriends = useApp((s) => s.friendships.filter((f) => f.status === "pending" && f.addressee_id === s.userId).length);
  const filter = useApp((s) => s.chatFilter);
  const me = useApp((s) => s.userId);
  const { pinned, muted } = usePrefs();
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [menu, setMenu] = useState<ChatListItem | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const top = () => scroller.current?.scrollTo({ top: 0, behavior: "smooth" });
    window.addEventListener("nexus:scrolltop", top);
    return () => window.removeEventListener("nexus:scrolltop", top);
  }, []);

  const titleOf = (c: ChatListItem) =>
    c.kind === "dm" ? profiles[c.other_user_id ?? ""]?.display_name ?? "Direct message" : c.name ?? "Group";

  const inCall = useMemo(() => {
    const s = new Set<string>();
    for (const p of Object.values(presence)) if (p.voice) s.add(p.voice);
    return s;
  }, [presence]);

  const query = q.trim().toLowerCase();
  const list = useMemo(() => {
    const filtered = chatList.filter((c) => {
      if (filter === "dm" && c.kind !== "dm") return false;
      if (filter === "group" && c.kind !== "group") return false;
      if (filter === "unread" && !(unread[c.id] > 0)) return false;
      if (query) {
        const p = c.other_user_id ? profiles[c.other_user_id] : undefined;
        return `${titleOf(c)} ${p?.username ?? ""} ${c.last_message ?? ""}`.toLowerCase().includes(query);
      }
      return true;
    });
    const pin = (id: string) => {
      const i = pinned.indexOf(id);
      return i === -1 ? Infinity : i;
    };
    return filtered.sort((a, b) => pin(a.id) - pin(b.id));
  }, [chatList, filter, unread, query, profiles, pinned]); // eslint-disable-line react-hooks/exhaustive-deps

  const dmPartners = new Set(chatList.filter((c) => c.kind === "dm").map((c) => c.other_user_id));
  const newContacts = query
    ? friendIds()
        .filter((id) => !dmPartners.has(id))
        .map((id) => profiles[id])
        .filter((p) => p && `${p.display_name} ${p.username}`.toLowerCase().includes(query))
    : [];

  const unreadCount = (f: string) =>
    chatList.filter((c) => (f === "all" || c.kind === f) && (unread[c.id] ?? 0) > 0).length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <LargeTitle
          title="Chats"
          scroller={scroller}
          right={
            <div className="flex items-center">
              <button onClick={() => useApp.setState({ mobileTab: "friends" })} className="relative grid size-10 place-items-center rounded-full text-accent active:bg-white/10" aria-label="Friends">
                <Users className="size-[22px]" />
                {pendingFriends > 0 && <span className="absolute top-1 right-1 size-2.5 rounded-full bg-dnd ring-2 ring-rail" />}
              </button>
              <button onClick={() => openModal("newGroup")} className="grid size-10 place-items-center rounded-full text-accent active:bg-white/10" aria-label="New group">
                <SquarePen className="size-[22px]" />
              </button>
            </div>
          }
        />

        {/* search */}
        <div className="flex items-center gap-2 px-4 pb-3">
          <div className="relative flex-1">
            <Search className="absolute top-1/2 left-3 size-[18px] -translate-y-1/2 text-sub" />
            <input
              value={q}
              onFocus={() => setSearching(true)}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search chats and friends"
              className="h-10 w-full rounded-xl bg-white/[.07] pr-9 pl-10 text-[16px] outline-none placeholder:text-sub/80"
            />
            {q && (
              <button onClick={() => setQ("")} className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full bg-sub/40 p-0.5 text-rail" aria-label="Clear search">
                <X className="size-3.5" strokeWidth={3} />
              </button>
            )}
          </div>
          {searching && (
            <button
              onClick={() => {
                setQ("");
                setSearching(false);
                (document.activeElement as HTMLElement)?.blur();
              }}
              className="animate-fade text-[16px] text-accent"
            >
              Cancel
            </button>
          )}
        </div>

        {!searching && <PushPrompt />}
        {!searching && <StoriesStrip />}

        {/* folders */}
        {!searching && (
          <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-2">
            {FILTERS.map((f) => {
              const n = f.id === "unread" ? 0 : unreadCount(f.id);
              const on = filter === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => useApp.setState({ chatFilter: f.id })}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[14px] font-semibold transition active:scale-95",
                    on ? "bg-accent text-white" : "bg-white/[.07] text-sub",
                  )}
                >
                  {f.label}
                  {n > 0 && <span className={cn("rounded-full px-1.5 text-[11px]", on ? "bg-white/25" : "bg-white/10 text-txt")}>{n}</span>}
                </button>
              );
            })}
          </div>
        )}

        <div className="pb-4">
          {list.length === 0 && newContacts.length === 0 && (
            <div className="px-8 py-16 text-center">
              <div className="mb-3 text-5xl">{query ? "🔎" : filter === "unread" ? "✨" : "💬"}</div>
              <div className="font-semibold">{query ? "Nothing found" : filter === "unread" ? "All caught up" : "No chats yet"}</div>
              <div className="mt-1 text-sm text-sub">{query ? "Try another name." : "Add a friend from the Friends tab and say hi."}</div>
            </div>
          )}

          {list.map((c) => {
            const n = unread[c.id] ?? 0;
            const isPinned = pinned.includes(c.id);
            const isMuted = muted.includes(c.id);
            const lastAuthor = c.last_author_id === me ? "You" : c.kind === "group" ? profiles[c.last_author_id ?? ""]?.display_name?.split(" ")[0] : null;
            const voice = c.last_message?.startsWith("📎 voice-");
            return (
              <SwipeRow
                key={c.id}
                onTap={() => openConversation(c.id, null)}
                onLongPress={() => setMenu(c)}
                actions={[
                  {
                    label: n > 0 ? "Read" : "Unread",
                    icon: <CheckCheck className="size-5" />,
                    color: "#5865f2",
                    onClick: () => (n > 0 ? void markRead(c.id) : useApp.setState((s) => ({ unread: { ...s.unread, [c.id]: 1 } }))),
                  },
                  { label: isMuted ? "Unmute" : "Mute", icon: isMuted ? <Bell className="size-5" /> : <BellOff className="size-5" />, color: "#f0a020", onClick: () => toggleMute(c.id) },
                  { label: isPinned ? "Unpin" : "Pin", icon: isPinned ? <PinOff className="size-5" /> : <Pin className="size-5" />, color: "#23a55a", onClick: () => togglePin(c.id) },
                ]}
              >
                <div className={cn("flex items-center gap-3 px-4 py-2.5 active:bg-white/[.05]", isPinned && "bg-white/[.025]")}>
                  {c.kind === "dm" ? (
                    <Avatar userId={c.other_user_id} size={56} showStatus ringClass="ring-rail" />
                  ) : (
                    <Avatar name={c.name} color="#2aabee" size={56} />
                  )}
                  <div className="min-w-0 flex-1 border-b border-white/[.06] pb-2.5">
                    <div className="flex items-center gap-1.5">
                      {c.kind === "group" && <Users className="size-4 shrink-0 text-sub" />}
                      <span className="min-w-0 truncate text-[16.5px] font-semibold">{c.kind === "dm" && c.other_user_id ? <NameTag userId={c.other_user_id} maxBadges={3} /> : titleOf(c)}</span>
                      {isMuted && <BellOff className="size-3.5 shrink-0 text-sub" />}
                      {inCall.has(c.id) && <Phone className="size-3.5 shrink-0 animate-pulse text-ok" />}
                      <span className={cn("ml-auto shrink-0 text-[13px]", n > 0 && !isMuted ? "text-accent" : "text-sub")}>{formatListTime(c.last_message_at ?? c.created_at)}</span>
                    </div>
                    <div className="mt-0.5 flex items-start gap-2">
                      <span className="line-clamp-2 min-h-[2.5em] flex-1 text-[14.5px] leading-[1.25] text-sub">
                        {c.last_message ? (
                          <>
                            {lastAuthor && <span className="text-txt">{lastAuthor}: </span>}
                            {voice ? (
                              <span className="inline-flex items-center gap-1 text-accent">
                                <Mic className="size-3.5" /> Voice message
                              </span>
                            ) : (
                              c.last_message
                            )}
                          </>
                        ) : (
                          <i>No messages yet</i>
                        )}
                      </span>
                      {n > 0 ? (
                        <span className={cn("mt-1 min-w-[22px] rounded-full px-1.5 text-center text-[13px] leading-[22px] font-bold text-white", isMuted ? "bg-sub/60" : "bg-accent")}>
                          {n > 999 ? "999+" : n}
                        </span>
                      ) : isPinned ? (
                        <Pin className="mt-1 size-4 rotate-45 text-sub" />
                      ) : null}
                    </div>
                  </div>
                </div>
              </SwipeRow>
            );
          })}

          {newContacts.length > 0 && (
            <>
              <p className="px-4 pt-4 pb-1 text-[13px] font-semibold text-sub uppercase">Friends</p>
              {newContacts.map((p) => (
                <button key={p!.id} onClick={() => void openDM(p!.id)} className="flex w-full items-center gap-3 px-4 py-2 text-left active:bg-white/5">
                  <Avatar userId={p!.id} size={44} showStatus ringClass="ring-rail" />
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{p!.display_name}</div>
                    <div className="truncate text-sm text-sub">@{p!.username}</div>
                  </div>
                </button>
              ))}
            </>
          )}
        </div>
      </div>

      <Sheet open={!!menu} onClose={() => setMenu(null)} title={menu ? titleOf(menu) : undefined}>
        {menu && (
          <SheetGroup>
            <SheetItem icon={pinned.includes(menu.id) ? <PinOff className="size-5" /> : <Pin className="size-5" />} label={pinned.includes(menu.id) ? "Unpin" : "Pin to top"} onClick={() => (togglePin(menu.id), setMenu(null))} />
            <SheetItem icon={muted.includes(menu.id) ? <Bell className="size-5" /> : <BellOff className="size-5" />} label={muted.includes(menu.id) ? "Unmute" : "Mute notifications"} onClick={() => (toggleMute(menu.id), setMenu(null))} />
            <SheetItem icon={<CheckCheck className="size-5" />} label="Mark as read" onClick={() => (void markRead(menu.id), setMenu(null))} />
          </SheetGroup>
        )}
      </Sheet>
    </div>
  );
}
