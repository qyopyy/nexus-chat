"use client";

import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import Modal from "@/components/ui/Modal";
import { searchMessages } from "@/lib/chatDelight";
import { useApp } from "@/store/app";
import { useChat } from "@/store/chat";
import { formatTime } from "@/lib/utils";
import type { Message } from "@/lib/types";

export default function ChatSearch({
  conversationId,
  open,
  onClose,
}: {
  conversationId: string;
  open: boolean;
  onClose: () => void;
}) {
  const profiles = useApp((s) => s.profiles);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setQ("");
      setHits([]);
    }
  }, [open]);

  useEffect(() => {
    if (!open || q.trim().length < 2) {
      setHits([]);
      return;
    }
    let dead = false;
    const t = setTimeout(() => {
      setBusy(true);
      void searchMessages(conversationId, q.trim()).then((rows) => {
        if (!dead) {
          setHits(rows);
          setBusy(false);
        }
      });
    }, 220);
    return () => {
      dead = true;
      clearTimeout(t);
    };
  }, [q, conversationId, open]);

  return (
    <Modal open={open} onClose={onClose} title="Find in chat" subtitle="Search messages in this conversation" className="max-w-lg">
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-sub" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search messages…"
          className="w-full rounded-xl border border-line bg-rail py-2.5 pr-10 pl-9 text-sm outline-none focus:border-accent"
        />
        {q && (
          <button onClick={() => setQ("")} className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-1 text-sub hover:text-txt" aria-label="Clear">
            <X className="size-4" />
          </button>
        )}
      </div>
      <div className="max-h-[50vh] space-y-1 overflow-y-auto">
        {busy && <p className="py-6 text-center text-sm text-sub">Searching…</p>}
        {!busy && q.trim().length >= 2 && hits.length === 0 && <p className="py-6 text-center text-sm text-sub">No matches</p>}
        {!busy &&
          hits.map((m) => (
            <button
              key={m.id}
              onClick={() => {
                useChat.setState({ jumpTo: m.id });
                onClose();
              }}
              className="flex w-full flex-col gap-0.5 rounded-xl px-3 py-2.5 text-left hover:bg-hover"
            >
              <div className="flex items-center gap-2 text-xs text-sub">
                <span className="font-semibold text-txt">{profiles[m.author_id]?.display_name ?? "Someone"}</span>
                <span>{formatTime(m.created_at)}</span>
              </div>
              <div className="line-clamp-2 text-sm">{m.content || m.attachment_name || "Attachment"}</div>
            </button>
          ))}
        {q.trim().length > 0 && q.trim().length < 2 && <p className="py-4 text-center text-xs text-sub">Type at least 2 characters</p>}
      </div>
    </Modal>
  );
}
