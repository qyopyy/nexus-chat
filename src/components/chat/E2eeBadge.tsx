"use client";

import { useEffect, useState } from "react";
import { Lock, LockOpen } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { e2eeUnlocked, onE2eeChange } from "@/lib/e2ee";
import { toast } from "@/store/app";

/** Small lock next to a DM's name: green = text is end-to-end encrypted, grey = you're set up but they aren't yet */
export default function E2eeBadge({ peerId }: { peerId: string }) {
  const [state, setState] = useState<"off" | "on" | "waiting">("off");

  useEffect(() => {
    let dead = false;
    const check = async () => {
      if (!(await e2eeUnlocked())) return !dead && setState("off");
      const { data } = await supabase.from("e2ee_public_keys").select("user_id").eq("user_id", peerId).maybeSingle();
      if (!dead) setState(data ? "on" : "waiting");
    };
    void check();
    const off = onE2eeChange(() => void check());
    return () => {
      dead = true;
      off();
    };
  }, [peerId]);

  if (state === "off") return null;
  const on = state === "on";
  const Icon = on ? Lock : LockOpen;
  return (
    <button
      type="button"
      onClick={() => toast(on ? "Messages in this chat are end-to-end encrypted. Photos, videos and files are not." : "They haven't turned on encrypted DMs yet, so messages here are sent normally.", "info")}
      aria-label={on ? "End-to-end encrypted" : "Not end-to-end encrypted yet"}
      title={on ? "End-to-end encrypted text" : "Not encrypted yet"}
      className={on ? "shrink-0 text-[#23a55a]" : "shrink-0 text-sub"}
    >
      <Icon className="size-3.5" aria-hidden />
    </button>
  );
}
