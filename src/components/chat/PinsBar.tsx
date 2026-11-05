"use client";

import { useCallback, useEffect, useState } from "react";
import { Pin, X } from "lucide-react";
import { listPins, unpinMessage, type PinRow } from "@/lib/chatDelight";
import { useApp } from "@/store/app";
import { useChat } from "@/store/chat";
import { cn } from "@/lib/utils";

export default function PinsBar({ conversationId }: { conversationId: string }) {
  const profiles = useApp((s) => s.profiles);
  const [pins, setPins] = useState<PinRow[]>([]);
  const [i, setI] = useState(0);

  const load = useCallback(async () => {
    setPins(await listPins(conversationId));
    setI(0);
  }, [conversationId]);

  useEffect(() => {
    void load();
  }, [load]);

  // expose refresh for pin actions
  useEffect(() => {
    const h = () => void load();
    window.addEventListener("nexus:pins", h);
    return () => window.removeEventListener("nexus:pins", h);
  }, [load]);

  if (!pins.length) return null;
  const pin = pins[Math.min(i, pins.length - 1)];
  const msg = Array.isArray(pin.messages) ? pin.messages[0] : pin.messages;
  if (!msg || msg.deleted_at) return null;

  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-black/20 bg-side/80 px-3 py-1.5 backdrop-blur">
      <Pin className="size-3.5 shrink-0 text-accent" />
      <button
        onClick={() => useChat.setState({ jumpTo: pin.message_id })}
        className="min-w-0 flex-1 truncate text-left text-xs"
      >
        <span className="font-semibold text-accent">{profiles[msg.author_id]?.display_name ?? "Pinned"} · </span>
        <span className="text-sub">{msg.content || msg.attachment_name || "Attachment"}</span>
      </button>
      {pins.length > 1 && (
        <button
          onClick={() => setI((x) => (x + 1) % pins.length)}
          className={cn("shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-sub")}
        >
          {i + 1}/{pins.length}
        </button>
      )}
      <button
        onClick={async () => {
          await unpinMessage(pin.message_id);
          void load();
        }}
        className="grid size-6 shrink-0 place-items-center rounded-full text-sub hover:text-txt"
        aria-label="Unpin"
        title="Unpin"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

export function refreshPins() {
  window.dispatchEvent(new Event("nexus:pins"));
}
