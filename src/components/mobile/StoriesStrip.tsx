"use client";

import { useMemo } from "react";
import { Plus } from "lucide-react";
import { useApp, openModal } from "@/store/app";
import { friendIds, openDM } from "@/lib/data";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import Avatar from "@/components/ui/Avatar";

/** Instagram/Telegram-style row of friends who are online — gradient ring when they're in voice or live */
export default function StoriesStrip() {
  const presence = useApp((s) => s.presence);
  const profiles = useApp((s) => s.profiles);
  const friendships = useApp((s) => s.friendships);
  const me = useApp((s) => s.userId);

  const online = useMemo(() => {
    const ids = friendIds().filter((id) => presence[id]);
    const score = (id: string) => (presence[id]?.screen ? 3 : presence[id]?.voice ? 2 : presence[id]?.status === "online" ? 1 : 0);
    return ids.sort((a, b) => score(b) - score(a));
  }, [presence, friendships]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="no-scrollbar flex gap-3.5 overflow-x-auto px-4 pt-1 pb-3">
      <button onClick={() => useApp.setState({ mobileTab: "friends" })} className="flex w-[62px] shrink-0 flex-col items-center gap-1.5 active:scale-95">
        <span className="relative">
          {me && <Avatar userId={me} size={58} plain />}
          <span className="absolute -right-0.5 -bottom-0.5 grid size-5 place-items-center rounded-full bg-accent text-white ring-[3px] ring-rail">
            <Plus className="size-3.5" strokeWidth={3} />
          </span>
        </span>
        <span className="w-full truncate text-center text-[11px] text-sub">Add friend</span>
      </button>

      {online.length === 0 && (
        <button
          onClick={() => openModal("newGroup")}
          className="flex h-[58px] shrink-0 items-center rounded-full border border-dashed border-white/15 px-4 text-xs text-sub active:scale-95"
        >
          No friends online right now
        </button>
      )}

      {online.map((id) => {
        const pr = presence[id];
        const live = pr?.screen;
        const voice = !!pr?.voice;
        return (
          <button
            key={id}
            onClick={() => {
              haptic.light();
              void openDM(id);
            }}
            className="flex w-[62px] shrink-0 flex-col items-center gap-1.5 active:scale-95"
          >
            <span className={cn("story-ring rounded-full p-[2.5px]", live ? "story-live" : voice ? "story-voice" : "story-online")}>
              <span className="block rounded-full bg-rail p-[2px]">
                <Avatar userId={id} size={50} plain />
              </span>
              {(live || voice) && (
                <span className={cn("absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-md px-1.5 text-[9px] leading-4 font-extrabold tracking-wide text-white", live ? "bg-dnd" : "bg-ok")}>
                  {live ? "LIVE" : "VOICE"}
                </span>
              )}
            </span>
            <span className="w-full truncate text-center text-[11px] text-txt">{profiles[id]?.display_name?.split(" ")[0] ?? "…"}</span>
          </button>
        );
      })}
    </div>
  );
}
