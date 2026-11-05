"use client";

import { useEffect, useState } from "react";
import { Bookmark, ExternalLink } from "lucide-react";
import Modal from "@/components/ui/Modal";
import { listSavedMessages, type SavedRow } from "@/lib/chatDelight";
import { openConversation } from "@/lib/data";
import { useApp } from "@/store/app";
import { useChat } from "@/store/chat";
import { formatTime } from "@/lib/utils";

export default function SavedMessages({ open, onClose }: { open: boolean; onClose: () => void }) {
  const profiles = useApp((s) => s.profiles);
  const channels = useApp((s) => s.channels);
  const chatList = useApp((s) => s.chatList);
  const [rows, setRows] = useState<SavedRow[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setBusy(true);
    void listSavedMessages().then((r) => {
      setRows(r);
      setBusy(false);
    });
  }, [open]);

  function openSaved(r: SavedRow) {
    onClose();
    const inChats = chatList.some((c) => c.id === r.conversation_id);
    let spaceId: string | null = null;
    if (!inChats) {
      for (const [sid, list] of Object.entries(channels)) {
        if (list.some((c) => c.id === r.conversation_id)) spaceId = sid;
      }
    }
    useApp.setState({ hub: null, mobileTab: spaceId ? "spaces" : "chats" });
    openConversation(r.conversation_id, spaceId);
    // jump after messages load
    setTimeout(() => useChat.setState({ jumpTo: r.message_id }), 350);
  }

  return (
    <Modal open={open} onClose={onClose} title="Saved messages" subtitle="Starred from any chat" className="max-w-lg">
      <div className="max-h-[55vh] space-y-1 overflow-y-auto">
        {busy && <p className="py-8 text-center text-sm text-sub">Loading…</p>}
        {!busy && rows.length === 0 && (
          <div className="py-10 text-center">
            <Bookmark className="mx-auto mb-2 size-8 text-sub" />
            <p className="text-sm text-sub">Long-press a message → Save</p>
          </div>
        )}
        {rows.map((r) => (
          <button key={r.message_id} onClick={() => openSaved(r)} className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-hover">
            <Bookmark className="mt-1 size-4 shrink-0 text-accent" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-xs text-sub">
                <span className="font-semibold text-txt">{profiles[r.author_id]?.display_name ?? "Someone"}</span>
                <span>{formatTime(r.created_at)}</span>
              </div>
              <div className="line-clamp-2 text-sm">{r.content || r.attachment_name || "Attachment"}</div>
            </div>
            <ExternalLink className="mt-1 size-3.5 shrink-0 text-sub" />
          </button>
        ))}
      </div>
    </Modal>
  );
}
