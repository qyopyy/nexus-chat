"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, Check, MessageCircle, Phone, UserMinus, Users, X } from "lucide-react";
import { useApp } from "@/store/app";
import { startCall } from "@/lib/call";
import { openDM, removeFriend, respondFriendRequest, sendFriendRequest } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import Avatar, { statusLabel } from "@/components/ui/Avatar";
import NameTag from "@/components/ui/NameTag";

type Tab = "online" | "all" | "pending" | "add";

export default function FriendsView() {
  const [tab, setTab] = useState<Tab>("online");
  const friendships = useApp((s) => s.friendships);
  const presence = useApp((s) => s.presence);
  const profiles = useApp((s) => s.profiles);
  const me = useApp((s) => s.userId);
  const [filter, setFilter] = useState("");

  const friends = useMemo(
    () =>
      friendships
        .filter((f) => f.status === "accepted")
        .map((f) => (f.requester_id === me ? f.addressee_id : f.requester_id))
        .sort((a, b) => (profiles[a]?.display_name ?? "").localeCompare(profiles[b]?.display_name ?? "")),
    [friendships, me, profiles],
  );
  const pending = friendships.filter((f) => f.status === "pending");
  const incoming = pending.filter((f) => f.addressee_id === me).length;

  const list = tab === "online" ? friends.filter((id) => presence[id]) : friends;
  const q = filter.toLowerCase();
  const shown = list.filter((id) => !q || `${profiles[id]?.display_name} ${profiles[id]?.username}`.toLowerCase().includes(q));

  const activeNow = friends.filter((id) => presence[id]?.voice);

  async function callFriend(id: string) {
    const { data, error } = await supabase.rpc("get_or_create_dm", { p_user: id });
    if (error || !data) return;
    await openDM(id);
    void startCall(data as string);
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 overflow-x-auto border-b border-black/25 px-3 shadow-sm">
          <button onClick={() => useApp.setState({ mobileSidebar: true })} className="rounded p-1 text-sub hover:text-txt md:hidden" aria-label="Back">
            <ArrowLeft className="size-5" />
          </button>
          <Users className="size-5 shrink-0 text-sub" />
          <span className="mr-2 font-semibold">Friends</span>
          <div className="mx-1 h-6 w-px bg-line" />
          {(["online", "all", "pending"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn("flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium whitespace-nowrap capitalize transition", tab === t ? "bg-active text-white" : "text-sub hover:bg-hover hover:text-txt")}
            >
              {t}
              {t === "pending" && incoming > 0 && <span className="rounded-full bg-dnd px-1.5 text-xs font-bold text-white">{incoming}</span>}
            </button>
          ))}
          <button
            onClick={() => setTab("add")}
            className={cn("rounded-md px-2.5 py-1 text-sm font-semibold whitespace-nowrap transition", tab === "add" ? "bg-transparent text-ok" : "bg-ok text-white hover:bg-ok/85")}
          >
            Add Friend
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-8">
          {tab === "add" ? (
            <AddFriend />
          ) : tab === "pending" ? (
            <PendingList />
          ) : (
            <>
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Search"
                className="mb-4 w-full rounded-md bg-rail px-3 py-2 text-sm outline-none placeholder:text-sub"
              />
              <p className="mb-2 text-xs font-bold tracking-wide text-sub uppercase">
                {tab === "online" ? "Online" : "All friends"} — {shown.length}
              </p>
              {shown.length === 0 && (
                <div className="mt-16 text-center text-sub">
                  <div className="mb-2 text-5xl">🫂</div>
                  {friends.length === 0 ? "No friends yet. Hit “Add Friend” and send a request by username." : "Nobody here right now."}
                </div>
              )}
              {shown.map((id) => {
                const p = profiles[id];
                const pr = presence[id];
                return (
                  <div key={id} className="group flex items-center gap-3 border-t border-line/50 py-2.5 hover:-mx-2 hover:rounded-lg hover:border-transparent hover:bg-hover hover:px-2">
                    <Avatar userId={id} size={40} showStatus ringClass="ring-chat group-hover:ring-hover" />
                    <button onClick={() => void openDM(id)} className="min-w-0 flex-1 text-left">
                      <div className="flex items-center gap-1.5">
                        <NameTag userId={id} className="font-semibold" />
                        <span className="hidden truncate text-sm text-sub group-hover:inline">@{p?.username}</span>
                      </div>
                      <div className="truncate text-xs text-sub">{pr?.voice ? "In a voice call" : p?.custom_status || statusLabel(pr?.status)}</div>
                    </button>
                    <RoundBtn label="Message" onClick={() => void openDM(id)}>
                      <MessageCircle className="size-[18px]" />
                    </RoundBtn>
                    <RoundBtn label="Call" onClick={() => void callFriend(id)}>
                      <Phone className="size-[18px]" />
                    </RoundBtn>
                    <RoundBtn label="Remove friend" danger onClick={() => confirm(`Remove ${p?.display_name} from friends?`) && void removeFriend(id)}>
                      <UserMinus className="size-[18px]" />
                    </RoundBtn>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>

      {/* Active now (Discord) */}
      <aside className="hidden w-[340px] shrink-0 border-l border-black/20 p-4 xl:block">
        <h3 className="mb-4 text-xl font-bold">Active Now</h3>
        {activeNow.length === 0 ? (
          <div className="text-center">
            <p className="font-semibold">It&apos;s quiet for now…</p>
            <p className="mt-1 text-sm text-sub">When a friend jumps into a call, it&apos;ll show up here.</p>
          </div>
        ) : (
          activeNow.map((id) => (
            <div key={id} className="mb-2 flex items-center gap-3 rounded-lg border border-line/60 bg-side p-3">
              <Avatar userId={id} size={36} showStatus />
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{profiles[id]?.display_name}</div>
                <div className="text-xs text-ok">{presence[id]?.screen ? "🔴 Streaming" : "🔊 In voice"}</div>
              </div>
            </div>
          ))
        )}
      </aside>
    </div>
  );
}

function RoundBtn({ children, label, onClick, danger }: { children: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn("grid size-9 place-items-center rounded-full bg-side text-sub transition", danger ? "hover:text-dnd" : "hover:text-txt")}
    >
      {children}
    </button>
  );
}

function PendingList() {
  const friendships = useApp((s) => s.friendships);
  const profiles = useApp((s) => s.profiles);
  const me = useApp((s) => s.userId);
  const pending = friendships.filter((f) => f.status === "pending");
  if (pending.length === 0) return <p className="mt-16 text-center text-sub">No pending requests. 📭</p>;
  return (
    <>
      <p className="mb-2 text-xs font-bold tracking-wide text-sub uppercase">Pending — {pending.length}</p>
      {pending.map((f) => {
        const incoming = f.addressee_id === me;
        const other = incoming ? f.requester_id : f.addressee_id;
        const p = profiles[other];
        return (
          <div key={f.id} className="flex items-center gap-3 border-t border-line/50 py-2.5">
            <Avatar userId={other} size={40} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{p?.display_name}</div>
              <div className="text-xs text-sub">{incoming ? "Incoming friend request" : "Outgoing friend request"}</div>
            </div>
            {incoming && (
              <RoundBtn label="Accept" onClick={() => void respondFriendRequest(f.id, true)}>
                <Check className="size-[18px] text-ok" />
              </RoundBtn>
            )}
            <RoundBtn label={incoming ? "Ignore" : "Cancel"} danger onClick={() => void respondFriendRequest(f.id, false)}>
              <X className="size-[18px]" />
            </RoundBtn>
          </div>
        );
      })}
    </>
  );
}

function AddFriend() {
  const me = useApp((s) => (s.userId ? s.profiles[s.userId] : undefined));
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="max-w-2xl">
      <h2 className="text-lg font-bold">Add Friend</h2>
      <p className="mb-4 text-sm text-sub">
        You can add friends with their username. Yours is <b className="text-txt">@{me?.username}</b>.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          setBusy(true);
          const error = await sendFriendRequest(name.replace(/^@/, ""));
          setBusy(false);
          setErr(error);
          if (!error) setName("");
        }}
        className={cn("flex items-center gap-2 rounded-lg border bg-rail p-2", err ? "border-dnd" : "border-black/40 focus-within:border-accent")}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="You can add friends with their username."
          className="flex-1 bg-transparent px-2 py-1.5 outline-none placeholder:text-sub"
          autoFocus
        />
        <button disabled={!name.trim() || busy} className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-2 disabled:opacity-50">
          Send Friend Request
        </button>
      </form>
      {err && <p className="mt-2 text-sm text-dnd">{err}</p>}
    </div>
  );
}
