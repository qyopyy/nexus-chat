"use client";

import { useState } from "react";
import { Check, Copy, Send, UserPlus } from "lucide-react";
import { useApp, toast } from "@/store/app";
import type { RoomGame } from "@/store/games";
import { friendIds, sendGameInvites } from "@/lib/gameInvites";
import { roomLink } from "@/lib/room";
import { cn } from "@/lib/utils";
import Avatar from "@/components/ui/Avatar";
import NameTag from "@/components/ui/NameTag";

/** lobby panel: room code + one-tap invites (friends get a "Join?" pop-up) */
export default function RoomInvite({ game, code, dark = true }: { game: RoomGame; code: string; dark?: boolean }) {
  const presence = useApp((s) => s.presence);
  useApp((s) => s.friendships); // re-render when friends change
  const ids = friendIds();
  const [sent, setSent] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

  const invite = async (to: string[]) => {
    const todo = to.filter((id) => !sent[id]);
    if (!todo.length) return;
    setBusy(true);
    const n = await sendGameInvites(game, code, todo);
    setBusy(false);
    if (n) {
      setSent((s) => ({ ...s, ...Object.fromEntries(todo.map((id) => [id, true])) }));
      toast(n === 1 ? "Invite sent" : `${n} friends invited`, "success");
    }
  };

  return (
    <div className={cn("rounded-2xl p-3", dark ? "bg-white/10" : "bg-side")}>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-bold tracking-widest uppercase opacity-70">Room code</div>
          <div className="font-mono text-2xl font-black tracking-[0.3em]">{code}</div>
        </div>
        <button
          onClick={() => {
            void navigator.clipboard?.writeText(roomLink(code, game));
            toast("Invite link copied", "success");
          }}
          className="flex items-center gap-1.5 rounded-full bg-white px-3 py-2 text-sm font-bold text-black"
        >
          <Copy className="size-4" /> Link
        </button>
      </div>
      <div className="mt-3 flex items-center">
        <span className="flex-1 text-sm font-bold">Invite friends</span>
        {ids.length > 1 && (
          <button disabled={busy} onClick={() => void invite(ids)} className="flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-xs font-bold disabled:opacity-50">
            <Send className="size-3.5" /> Invite all
          </button>
        )}
      </div>
      <div className="mt-2 max-h-56 space-y-1 overflow-y-auto">
        {ids.length === 0 && (
          <p className="flex items-center gap-2 text-sm opacity-70">
            <UserPlus className="size-4" /> Add friends to invite them — or share the link.
          </p>
        )}
        {ids.map((id) => (
          <div key={id} className="flex items-center gap-2 rounded-xl px-1.5 py-1">
            <div className="relative">
              <Avatar userId={id} size={30} plain />
              {presence[id] && <span className="absolute -right-0.5 -bottom-0.5 size-3 rounded-full bg-ok ring-2 ring-black/60" />}
            </div>
            <span className="min-w-0 flex-1 truncate text-sm">
              <NameTag userId={id} badges={false} />
            </span>
            <button
              disabled={sent[id] || busy}
              onClick={() => void invite([id])}
              className={cn("flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold", sent[id] ? "bg-white/10 opacity-70" : "bg-white text-black")}
            >
              {sent[id] ? (
                <>
                  <Check className="size-3.5" /> Sent
                </>
              ) : (
                "Invite"
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
