"use client";

import { Sparkles } from "lucide-react";
import { useApp, openModal, toast } from "@/store/app";
import { toggleAvatar, useCall } from "@/lib/call";
import { cn } from "@/lib/utils";
import { useMyAvatar } from "./AvatarStudio";

/** ✨ call button: send your V-Avatar instead of the camera (opens the maker first if you have none) */
export default function AvatarButton({ mobile }: { mobile?: boolean }) {
  const on = useCall((s) => s.avatarOn);
  const hasLook = useApp((s) => !!(s.userId && s.profiles[s.userId]?.vavatar));
  const look = useMyAvatar();
  const click = () => {
    if (!on && !hasLook) {
      toast("Create your V-Avatar first — then tap ✨ again", "info");
      openModal("settings", "vavatar");
      return;
    }
    void toggleAvatar(look);
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
        className={cn("grid size-14 place-items-center rounded-full text-white transition", on ? "bg-gradient-to-br from-[#ff2bd6] to-[#8b5cff]" : "bg-[#2b2d31] hover:bg-[#3a3c42]")}
      >
        <Sparkles className="size-6" />
      </button>
      <div className="absolute bottom-full left-1/2 z-30 hidden -translate-x-1/2 pb-1.5 group-hover:block">
        <button onClick={() => openModal("settings", "vavatar")} className="rounded-md bg-menu px-2 py-1 text-xs font-semibold whitespace-nowrap text-txt shadow-lg hover:bg-accent hover:text-white">
          Edit avatar
        </button>
      </div>
    </div>
  );
}
