"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Phone, Search, SquarePen, Users } from "lucide-react";
import { useApp, openModal } from "@/store/app";
import { friendIds, openConversation, openDM } from "@/lib/data";
import { cn, formatListTime } from "@/lib/utils";
import { haptic } from "@/lib/haptics";
import { moveChatInList, sortChats, useSpacePrefs } from "@/lib/spacePrefs";
import Avatar from "@/components/ui/Avatar";
import NameTag from "@/components/ui/NameTag";
import NotificationPanel, { NotificationBellButton } from "@/components/chat/NotificationPanel";
import type { ChatListItem } from "@/lib/types";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "dm", label: "Personal" },
  { id: "group", label: "Groups" },
  { id: "unread", label: "Unread" },
] as const;

export default function HomeSidebar() {
  const chatList = useApp((s) => s.chatList);
  const profiles = useApp((s) => s.profiles);
  const unread = useApp((s) => s.unread);
  const presence = useApp((s) => s.presence);
  const filter = useApp((s) => s.chatFilter);
  const search = useApp((s) => s.search);
  const conversationId = useApp((s) => s.conversationId);
  const friendships = useApp((s) => s.friendships);
  const me = useApp((s) => s.userId);

  const pending = friendships.filter((f) => f.status === "pending" && f.addressee_id === me).length;
  const chatOrder = useSpacePrefs((s) => s.chatOrder);
  const [reorderChats, setReorderChats] = useState(false);

  const titleOf = (c: ChatListItem) =>
    c.kind === "dm" ? profiles[c.other_user_id ?? ""]?.display_name ?? "Direct message" : c.name ?? "Group";

  const activeCalls = useMemo(() => {
    const set = new Set<string>();
    for (const p of Object.values(presence)) if (p.voice) set.add(p.voice);
    return set;
  }, [presence]);

  const counts = useMemo(
    () => ({
      all: chatList.reduce((n, c) => n + (unread[c.id] ?? 0), 0),
      dm: chatList.filter((c) => c.kind === "dm").reduce((n, c) => n + (unread[c.id] ?? 0), 0),
      group: chatList.filter((c) => c.kind === "group").reduce((n, c) => n + (unread[c.id] ?? 0), 0),
      unread: chatList.reduce((n, c) => n + (unread[c.id] ?? 0), 0),
    }),
    [chatList, unread],
  );

  const q = search.trim().toLowerCase();
  const visible = useMemo(() => {
    const filtered = chatList.filter((c) => {
      if (filter === "dm" && c.kind !== "dm") return false;
      if (filter === "group" && c.kind !== "group") return false;
      if (filter === "unread" && !(unread[c.id] > 0)) return false;
      if (q) {
        const p = c.other_user_id ? profiles[c.other_user_id] : undefined;
        const hay = `${titleOf(c)} ${p?.username ?? ""} ${c.last_message ?? ""}`.toLowerCase();
        return hay.includes(q);
      }
      return true;
    });
    return sortChats(filtered);
    // titleOf uses profiles — include them
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatList, filter, unread, q, profiles, chatOrder, me]);
  const visibleIds = useMemo(() => visible.map((c) => c.id), [visible]);

  // Friends without a chat yet that match the search → start a new DM
  const dmPartners = new Set(chatList.filter((c) => c.kind === "dm").map((c) => c.other_user_id));
  const newContacts = q
    ? friendIds()
        .filter((id) => !dmPartners.has(id))
        .map((id) => profiles[id])
        .filter((p) => p && `${p.display_name} ${p.username}`.toLowerCase().includes(q))
    : [];

  return (
    <div className="relative flex h-full flex-col">
      <NotificationPanel />
      {/* search header */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-2">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-sub" />
          <input
            value={search}
            onChange={(e) => useApp.setState({ search: e.target.value })}
            placeholder="Search"
            className="w-full rounded-full bg-rail py-2 pr-3 pl-9 text-sm outline-none ring-accent/60 placeholder:text-sub focus:ring-2"
          />
        </div>
        <NotificationBellButton className="size-9 text-sub hover:text-txt" />
        {visible.length > 1 && (
          <button
            type="button"
            onClick={() => {
              haptic.select();
              setReorderChats((v) => !v);
            }}
            aria-pressed={reorderChats}
            title={reorderChats ? "Done reordering" : "Reorder chats & groups (left-click ↑↓)"}
            className={cn(
              "grid size-9 place-items-center rounded-full text-sm font-bold transition",
              reorderChats ? "bg-accent text-white" : "text-sub hover:bg-hover hover:text-txt",
            )}
          >
            ↕
          </button>
        )}
        <button
          onClick={() => openModal("newGroup")}
          className="grid size-9 place-items-center rounded-full text-sub hover:bg-hover hover:text-txt"
          title="New group"
        >
          <SquarePen className="size-[18px]" />
        </button>
      </div>

      {/* Telegram folder tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-black/20 px-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => useApp.setState({ chatFilter: f.id })}
            className={cn(
              "relative flex items-center gap-1.5 px-3 py-2 text-sm font-medium whitespace-nowrap transition",
              filter === f.id ? "text-accent" : "text-sub hover:text-txt",
            )}
          >
            {f.label}
            {f.id !== "unread" && counts[f.id] > 0 && (
              <span className="rounded-full bg-sub/30 px-1.5 text-[11px] font-bold text-txt">{counts[f.id]}</span>
            )}
            {filter === f.id && <span className="absolute inset-x-2 bottom-0 h-[3px] rounded-t bg-accent" />}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {/* Discord friends entry */}
        <button
          onClick={() => openConversation(null, null)}
          className={cn(
            "mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition",
            conversationId === null ? "bg-active text-white" : "text-sub hover:bg-hover hover:text-txt",
          )}
        >
          <Users className="size-5" />
          <span className="flex-1 font-medium">Friends</span>
          {pending > 0 && <span className="rounded-full bg-dnd px-1.5 text-xs font-bold text-white">{pending}</span>}
        </button>

        {visible.length === 0 && newContacts.length === 0 && (
          <p className="px-3 py-8 text-center text-sm text-sub">
            {q ? "No chats found" : filter === "unread" ? "You're all caught up ✨" : "No chats yet — add a friend and say hi!"}
          </p>
        )}

        {visible.map((c, idx) => {
          const n = unread[c.id] ?? 0;
          const active = conversationId === c.id;
          const lastAuthor = c.last_author_id === me ? "You" : c.kind === "group" ? profiles[c.last_author_id ?? ""]?.display_name : null;
          return (
            <div key={c.id} className="flex items-stretch gap-0.5">
              {reorderChats && (
                <div className="flex flex-col justify-center gap-0.5 py-1">
                  <button
                    type="button"
                    disabled={idx === 0}
                    title="Move up"
                    aria-label={`Move ${titleOf(c)} up`}
                    onClick={() => {
                      if (moveChatInList(visibleIds, c.id, -1)) haptic.light();
                    }}
                    className="grid size-6 place-items-center rounded-md bg-white/5 text-sub hover:bg-hover hover:text-txt disabled:opacity-25"
                  >
                    <ChevronUp className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={idx === visible.length - 1}
                    title="Move down"
                    aria-label={`Move ${titleOf(c)} down`}
                    onClick={() => {
                      if (moveChatInList(visibleIds, c.id, 1)) haptic.light();
                    }}
                    className="grid size-6 place-items-center rounded-md bg-white/5 text-sub hover:bg-hover hover:text-txt disabled:opacity-25"
                  >
                    <ChevronDown className="size-3.5" />
                  </button>
                </div>
              )}
              <button
                onClick={() => {
                  if (reorderChats) return;
                  openConversation(c.id, null);
                }}
                className={cn(
                  "flex min-w-0 flex-1 items-center gap-3 rounded-xl px-2.5 py-2 text-left transition",
                  active ? "bg-accent/90 text-white" : "hover:bg-hover",
                  reorderChats && "cursor-default opacity-90",
                )}
              >
                {c.kind === "dm" ? (
                  <Avatar userId={c.other_user_id} size={50} showStatus ringClass={active ? "ring-accent" : "ring-side"} />
                ) : (
                  <Avatar name={c.name} color="#2aabee" size={50} />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {c.kind === "group" && <Users className={cn("size-3.5 shrink-0", active ? "text-white" : "text-sub")} />}
                    <span className="truncate font-semibold">
                      {c.kind === "dm" && c.other_user_id && !active ? <NameTag userId={c.other_user_id} /> : titleOf(c)}
                    </span>
                    {activeCalls.has(c.id) && <Phone className="size-3.5 shrink-0 text-ok" />}
                    <span className={cn("ml-auto shrink-0 text-xs", active ? "text-white/80" : "text-sub")}>
                      {formatListTime(c.last_message_at ?? c.created_at)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn("truncate text-sm", active ? "text-white/85" : "text-sub")}>
                      {c.last_message ? (
                        <>
                          {lastAuthor && <span className={active ? "text-white" : "text-txt"}>{lastAuthor}: </span>}
                          {c.last_message}
                        </>
                      ) : (
                        <i>No messages yet</i>
                      )}
                    </span>
                    {n > 0 && (
                      <span
                        className={cn(
                          "ml-auto min-w-[22px] shrink-0 rounded-full px-1.5 text-center text-xs leading-[22px] font-bold",
                          active ? "bg-white text-accent" : "bg-accent text-white",
                        )}
                      >
                        {n > 999 ? "999+" : n}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            </div>
          );
        })}

        {newContacts.length > 0 && (
          <>
            <p className="px-3 pt-4 pb-1 text-xs font-bold tracking-wide text-sub uppercase">Friends</p>
            {newContacts.map((p) => (
              <button
                key={p!.id}
                onClick={() => void openDM(p!.id)}
                className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left hover:bg-hover"
              >
                <Avatar userId={p!.id} size={40} showStatus />
                <div className="min-w-0">
                  <div className="truncate font-semibold">{p!.display_name}</div>
                  <div className="truncate text-xs text-sub">@{p!.username}</div>
                </div>
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
