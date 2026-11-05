"use client";

import { Sparkles } from "lucide-react";
import { useApp, openModal, toast } from "@/store/app";
import { toggleAvatar, useCall } from "@/lib/call";
import { toggleLiveAvatar, useLive } from "@/lib/live";
import { cn } from "@/lib/utils";
import { useMyAvatar } from "./AvatarStudio";

/** ✨ send your V-Avatar instead of the camera — works in calls and Nexus Live */
export default function AvatarButton({ mobile, context = "call" }: { mobile?: boolean; context?: "call" | "live" }) {
  const callOn = useCall((s) => s.avatarOn);
  const liveOn = useLive((s) => s.avatarOn);
  const on = context === "live" ? liveOn : callOn;
  const hasLook = useApp((s) => !!(s.userId && s.profiles[s.userId]?.vavatar));
  const look = useMyAvatar();
  const click = () => {
    if (!on && !hasLook) {
      toast("Create your V-Avatar first — then tap ✨ again", "info");
      openModal("settings", "vavatar");
      return;
    }
    if (context === "live") void toggleLiveAvatar(look);
    else void toggleAvatar(look);
  };
  if (mobile)
    return (
      <button onClick={click} onContextMenu={(e) => (e.preventDefault(), openModal("settings", "vavatar"))} className="flex flex-col items-center gap-1.5" aria-label="V-Avatar">
        <span className={cn("grid size-[52px] place-items-center rounded-full active:scale-90", on ? "bg-gradient-to-br from-[#ff2bd6] to-[#8b5cff] text-white" : "bg-white/15 text-white")}>
          <Sparkles className="size-6" />
        </span>
        <span className="text-[11px] font-medium text-white/80">Avatar</span>
      </button>
    );
  return (
    <div className="group relative">
      <button
        onClick={click}
        title={on ? "Turn off V-Avatar" : "Use my V-Avatar"}
        aria-label={on ? "Turn off V-Avatar" : "Use my V-Avatar"}
        className={cn(
          "grid place-items-center rounded-full text-white transition",
          context === "live" ? "size-10" : "size-14",
          on ? "bg-gradient-to-br from-[#ff2bd6] to-[#8b5cff]" : context === "live" ? "bg-white/15 hover:bg-white/25" : "bg-[#2b2d31] hover:bg-[#3a3c42]",
        )}
      >
        <Sparkles className={context === "live" ? "size-4" : "size-6"} />
      </button>
      <div className="absolute bottom-full left-1/2 z-30 hidden -translate-x-1/2 pb-1.5 group-hover:block">
        <button onClick={() => openModal("settings", "vavatar")} className="rounded-md bg-menu px-2 py-1 text-xs font-semibold whitespace-nowrap text-txt shadow-lg hover:bg-accent hover:text-white">
          Edit avatar
        </button>
      </div>
    </div>
  );
}
