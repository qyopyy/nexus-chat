"use client";

import { useMemo, useState } from "react";
import { Forward, Search, Users } from "lucide-react";
import { forwardMessage } from "@/lib/data";
import { useApp } from "@/store/app";
import { cn } from "@/lib/utils";
import Avatar from "@/components/ui/Avatar";
import Sheet from "@/components/ui/Sheet";
import type { ChatListItem, Message } from "@/lib/types";

export default function ForwardPicker({
  message,
  open,
  onClose,
}: {
  message: Message;
  open: boolean;
  onClose: () => void;
}) {
  const chatList = useApp((s) => s.chatList);
  const profiles = useApp((s) => s.profiles);
  const [q, setQ] = useState("");
  const [sent, setSent] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const titleOf = (c: ChatListItem) =>
    c.kind === "dm" ? profiles[c.other_user_id ?? ""]?.display_name ?? "Direct message" : c.name ?? "Group";

  const query = q.trim().toLowerCase();
  const list = useMemo(() => {
    if (!query) return chatList;
    return chatList.filter((c) => {
      const p = c.other_user_id ? profiles[c.other_user_id] : undefined;
      return `${titleOf(c)} ${p?.username ?? ""}`.toLowerCase().includes(query);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatList, query, profiles]);

  const pick = async (c: ChatListItem) => {
    if (busy || sent[c.id]) return;
    setBusy(c.id);
    const ok = await forwardMessage(c.id, message);
    setBusy(null);
    if (ok) {
      setSent((s) => ({ ...s, [c.id]: true }));
      onClose();
    }
  };

  return (
    <Sheet
      open={open}
      onClose={() => {
        setQ("");
        setSent({});
        onClose();
      }}
      title="Forward to…"
      className="bg-menu"
    >
      <div className="space-y-3 px-1 pb-2">
        <div className="relative px-2">
          <Search className="pointer-events-none absolute top-1/2 left-5 size-4 -translate-y-1/2 text-sub" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search chats"
            className="h-10 w-full rounded-xl bg-white/[.07] pr-3 pl-10 text-[15px] outline-none placeholder:text-sub/80"
          />
        </div>
        <div className="max-h-[min(60dvh,420px)] space-y-0.5 overflow-y-auto">
          {list.map((c) => {
            const done = !!sent[c.id];
            const loading = busy === c.id;
            return (
              <button
                key={c.id}
                type="button"
                disabled={!!busy || done}
                onClick={() => void pick(c)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition active:scale-[.98]",
                  done ? "opacity-60" : "hover:bg-white/5 active:bg-white/10",
                )}
              >
                {c.kind === "dm" && c.other_user_id ? (
                  <Avatar userId={c.other_user_id} size={40} plain />
                ) : (
                  <span className="grid size-10 place-items-center rounded-full bg-accent/25 text-accent">
                    <Users className="size-5" />
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{titleOf(c)}</span>
                <span
                  className={cn(
                    "flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold",
                    done ? "bg-ok/20 text-ok" : "bg-accent text-white",
                  )}
                >
                  {done ? (
                    "Sent"
                  ) : loading ? (
                    "…"
                  ) : (
                    <>
                      <Forward className="size-3" /> Forward
                    </>
                  )}
                </span>
              </button>
            );
          })}
          {list.length === 0 && <p className="px-3 py-8 text-center text-sm text-sub">{query ? "No chats match" : "No chats yet"}</p>}
        </div>
      </div>
    </Sheet>
  );
}
