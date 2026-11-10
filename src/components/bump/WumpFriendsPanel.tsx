"use client";

import { useMemo, useState } from "react";
import {
  Check,
  Hand,
  MapPin,
  MessageCircle,
  Navigation,
  Share2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useApp } from "@/store/app";
import { respondFriendRequest, sendFriendRequest } from "@/lib/data";
import { formatMeters } from "@/lib/location";
import type { BumpNearby } from "@/lib/bump";
import { WUMP } from "@/lib/wumpBrand";
import { wumpPresenceBits } from "@/lib/wumpTogether";
import { cn } from "@/lib/utils";
import Avatar from "@/components/ui/Avatar";
import NameTag from "@/components/ui/NameTag";

type Sub = "nearby" | "all" | "pending" | "add";

export default function WumpFriendsPanel({
  friendIds,
  nearbyById,
  onOpen,
  onMessage,
  onWave,
  onSharePin,
  onFindOnMap,
  onRefresh,
}: {
  friendIds: string[];
  nearbyById: Map<string, BumpNearby>;
  onOpen: (id: string) => void;
  onMessage: (id: string) => void;
  onWave: (id: string) => void;
  onSharePin: (id: string) => void;
  onFindOnMap?: (id: string) => void;
  onRefresh?: () => void;
}) {
  const me = useApp((s) => s.userId);
  const friendships = useApp((s) => s.friendships);
  const profiles = useApp((s) => s.profiles);
  const presence = useApp((s) => s.presence);
  const [sub, setSub] = useState<Sub>("nearby");
  const [filter, setFilter] = useState("");
  const [addName, setAddName] = useState("");
  const [busy, setBusy] = useState(false);

  const pending = useMemo(
    () => friendships.filter((f) => f.status === "pending"),
    [friendships],
  );
  const incoming = pending.filter((f) => f.addressee_id === me);
  const outgoing = pending.filter((f) => f.requester_id === me);

  const nearbyFriends = friendIds.filter((id) => nearbyById.has(id));
  const base = sub === "nearby" ? nearbyFriends : friendIds;
  const q = filter.trim().toLowerCase();
  const shown = base
    .filter((id) => {
      if (!q) return true;
      const p = profiles[id];
      return `${p?.display_name ?? ""} ${p?.username ?? ""}`.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      const da = nearbyById.get(a)?.meters ?? 1e12;
      const db = nearbyById.get(b)?.meters ?? 1e12;
      if (da !== db) return da - db;
      return (profiles[a]?.display_name ?? "").localeCompare(profiles[b]?.display_name ?? "");
    });

  async function addFriend() {
    const name = addName.trim().replace(/^@/, "");
    if (!name) return;
    setBusy(true);
    const err = await sendFriendRequest(name);
    setBusy(false);
    if (!err) {
      setAddName("");
      setSub("pending");
      onRefresh?.();
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <section className="overflow-hidden rounded-2xl bg-side ring-1 ring-white/5">
        <div className="flex items-center gap-2 border-b border-white/5 px-4 py-3">
          <Users className="size-4 text-emerald-400" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold">Friends</div>
            <p className="text-[11px] text-sub">
              {friendIds.length} friends · {nearbyFriends.length} nearby on {WUMP}
            </p>
          </div>
          {onRefresh && (
            <button type="button" onClick={onRefresh} className="text-xs font-semibold text-accent hover:underline">
              Refresh
            </button>
          )}
        </div>

        <div className="flex gap-1 overflow-x-auto px-3 py-2.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {(
            [
              ["nearby", "Nearby"],
              ["all", "All"],
              ["pending", "Requests"],
              ["add", "Add"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setSub(id)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition",
                sub === id ? "bg-emerald-500 text-white" : "bg-white/5 text-sub hover:bg-white/10 hover:text-txt",
              )}
            >
              {label}
              {id === "pending" && incoming.length > 0 && (
                <span className="rounded-full bg-white/25 px-1.5 text-[10px] font-bold">{incoming.length}</span>
              )}
              {id === "nearby" && nearbyFriends.length > 0 && sub !== "nearby" && (
                <span className="rounded-full bg-emerald-500/25 px-1.5 text-[10px] font-bold text-emerald-300">
                  {nearbyFriends.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </section>

      {sub === "add" && (
        <section className="rounded-2xl bg-side p-4 ring-1 ring-white/5">
          <div className="mb-1 text-sm font-bold">Add by username</div>
          <p className="mb-3 text-xs text-sub">Same Nexus friends — once accepted they show up on your {WUMP} map.</p>
          <div className="flex gap-2">
            <input
              value={addName}
              onChange={(e) => setAddName(e.target.value.replace(/[^a-zA-Z0-9_@]/g, "").slice(0, 32))}
              onKeyDown={(e) => {
                if (e.key === "Enter") void addFriend();
              }}
              placeholder="@username"
              className="min-w-0 flex-1 rounded-xl bg-black/30 px-3 py-2.5 text-sm outline-none ring-1 ring-white/10 focus:ring-emerald-500"
            />
            <button
              type="button"
              disabled={busy || !addName.trim()}
              onClick={() => void addFriend()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 text-sm font-bold text-white disabled:opacity-40"
            >
              <UserPlus className="size-4" /> Add
            </button>
          </div>
        </section>
      )}

      {sub === "pending" && (
        <section className="overflow-hidden rounded-2xl bg-side ring-1 ring-white/5">
          <div className="border-b border-white/5 px-4 py-3 text-sm font-bold">Friend requests</div>
          {!pending.length ? (
            <p className="px-4 py-6 text-center text-xs text-sub">No pending requests. Add someone by username.</p>
          ) : (
            <ul>
              {incoming.map((f) => {
                const id = f.requester_id;
                return (
                  <li key={f.id} className="flex items-center gap-2 border-b border-white/5 px-3 py-2.5 last:border-0">
                    <button type="button" onClick={() => onOpen(id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                      <Avatar userId={id} size={42} />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">
                          <NameTag userId={id} />
                        </div>
                        <div className="text-[11px] text-sub">Wants to be friends</div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => void respondFriendRequest(f.id, true)}
                      className="grid size-9 place-items-center rounded-full bg-emerald-500 text-white"
                      aria-label="Accept"
                    >
                      <Check className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void respondFriendRequest(f.id, false)}
                      className="grid size-9 place-items-center rounded-full bg-white/10 text-sub hover:bg-white/15"
                      aria-label="Decline"
                    >
                      <X className="size-4" />
                    </button>
                  </li>
                );
              })}
              {outgoing.map((f) => {
                const id = f.addressee_id;
                return (
                  <li key={f.id} className="flex items-center gap-3 border-b border-white/5 px-3 py-2.5 last:border-0">
                    <Avatar userId={id} size={42} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">
                        <NameTag userId={id} />
                      </div>
                      <div className="text-[11px] text-sub">Request sent</div>
                    </div>
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-sub">Pending</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {(sub === "nearby" || sub === "all") && (
        <section className="overflow-hidden rounded-2xl bg-side ring-1 ring-white/5">
          <div className="border-b border-white/5 px-4 py-3">
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search friends"
              className="w-full rounded-xl bg-black/30 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-emerald-500"
            />
          </div>
          {!friendIds.length ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm font-semibold text-txt">No friends yet</p>
              <p className="mt-1 text-xs text-sub">Add people by username, then Go Live so they can find you nearby.</p>
              <button
                type="button"
                onClick={() => setSub("add")}
                className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-emerald-500 px-4 py-2 text-xs font-bold text-white"
              >
                <UserPlus className="size-3.5" /> Add a friend
              </button>
            </div>
          ) : !shown.length ? (
            <p className="px-4 py-6 text-center text-xs text-sub">
              {sub === "nearby" ? "Nobody nearby right now — try All, or Go Live." : "No matches."}
            </p>
          ) : (
            <ul>
              {shown.map((id) => {
                const n = nearbyById.get(id);
                const online = !!presence[id];
                return (
                  <li key={id} className="border-b border-white/5 last:border-0">
                    <div className="flex items-center gap-1 px-2.5 py-2.5">
                      <button type="button" onClick={() => onOpen(id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                        <Avatar userId={id} size={44} showStatus />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-semibold">
                              <NameTag userId={id} />
                            </span>
                            {n && (
                              <span className="rounded-full bg-emerald-500/20 px-1.5 text-[10px] font-bold text-emerald-300">
                                {formatMeters(n.meters)}
                              </span>
                            )}
                          </div>
                          <div className="truncate text-[11px] text-sub">
                            {n
                              ? ["Nearby", ...wumpPresenceBits(n)].join(" · ")
                              : online
                                ? "Online on Nexus · not sharing location"
                                : "Not sharing location right now"}
                          </div>
                        </div>
                      </button>
                      <div className="flex shrink-0 items-center gap-0.5">
                        {n && onFindOnMap && (
                          <IconBtn label="Find on map" onClick={() => onFindOnMap(id)}>
                            <Navigation className="size-4" />
                          </IconBtn>
                        )}
                        <IconBtn label="Wave" onClick={() => onWave(id)}>
                          <Hand className="size-4" />
                        </IconBtn>
                        <IconBtn label="Share pin" onClick={() => onSharePin(id)}>
                          <Share2 className="size-4" />
                        </IconBtn>
                        <IconBtn label="Chat" accent onClick={() => onMessage(id)}>
                          <MessageCircle className="size-4" />
                        </IconBtn>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {friendIds.length > 0 && sub !== "add" && (
        <div className="flex flex-wrap gap-2 px-1">
          <HintChip icon={<MapPin className="size-3.5" />} text="Go Live so friends see your pin" />
          <HintChip icon={<MessageCircle className="size-3.5" />} text="Chat is built into Wump" />
        </div>
      )}
    </div>
  );
}

function IconBtn({
  children,
  label,
  onClick,
  accent,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "grid size-9 place-items-center rounded-full transition",
        accent ? "bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30" : "bg-white/5 text-sub hover:bg-white/10 hover:text-txt",
      )}
    >
      {children}
    </button>
  );
}

function HintChip({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-[10px] font-semibold text-sub ring-1 ring-white/5">
      {icon}
      {text}
    </span>
  );
}
