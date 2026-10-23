"use client";

import { useEffect, useState } from "react";
import { Mic, MicOff, PhoneOff } from "lucide-react";
import { useApp, conversationTitle, findChannel } from "@/store/app";
import { useCall, leaveCall, toggleMute } from "@/lib/call";
import { openConversation } from "@/lib/data";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import Avatar from "@/components/ui/Avatar";

/** Floating "return to call" pill shown above the tab bar / chat while a call runs in the background */
export default function MobileCallBar({ className }: { className?: string }) {
  const status = useCall((s) => s.status);
  const convId = useCall((s) => s.conversationId);
  const startedAt = useCall((s) => s.startedAt);
  const muted = useCall((s) => s.muted || s.deafened);
  const participants = useCall((s) => s.participants);
  const title = useApp((s) => conversationTitle(s, convId));
  const channel = useApp((s) => findChannel(s, convId));
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (status === "idle" || !convId) return null;
  const secs = startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;
  const time = `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;
  const anySpeaking = Object.values(participants).some((p) => p.speaking);
  const ids = Object.keys(participants).slice(0, 3);

  return (
    <div className={cn("pointer-events-none z-40 px-3 pb-2", className)}>
      <div className="pointer-events-auto mx-auto flex max-w-lg animate-pop items-center gap-2 rounded-full bg-ok py-1.5 pr-1.5 pl-2 text-white shadow-[0_8px_30px_rgba(35,165,90,.45)]">
        <button
          onClick={() => {
            haptic.light();
            useApp.setState({ callMinimized: false });
            openConversation(convId, channel?.space_id ?? null);
          }}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
        >
          <span className="flex -space-x-2.5">
            {ids.length ? (
              ids.map((id) => <Avatar key={id} userId={id} size={30} plain className="rounded-full ring-2 ring-ok" />)
            ) : (
              <span className="grid size-[30px] place-items-center rounded-full bg-white/20 text-sm">…</span>
            )}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[14px] leading-tight font-bold">{title || "Call"}</span>
            <span className="flex items-center gap-1.5 text-[12px] leading-tight text-white/85">
              <span className={cn("flex h-2.5 items-end gap-[2px]", anySpeaking && "eq-on")}>
                <i className="eq" />
                <i className="eq" />
                <i className="eq" />
              </span>
              {status === "connecting" ? "Connecting…" : `${time} · Tap to return`}
            </span>
          </span>
        </button>
        <button onClick={toggleMute} className={cn("grid size-9 place-items-center rounded-full", muted ? "bg-white text-ok" : "bg-white/20")} aria-label={muted ? "Unmute" : "Mute"}>
          {muted ? <MicOff className="size-[18px]" /> : <Mic className="size-[18px]" />}
        </button>
        <button onClick={() => void leaveCall()} className="grid size-9 place-items-center rounded-full bg-dnd" aria-label="Leave call">
          <PhoneOff className="size-[18px]" />
        </button>
      </div>
    </div>
  );
}
