"use client";

import { useState } from "react";
import { Bell, X } from "lucide-react";
import { enablePush, usePush } from "@/lib/push";

const KEY = "nexus:push-prompt-dismissed";

/** small card asking to turn on notifications (or explaining the iPhone Home Screen step) */
export default function PushPrompt() {
  const { state, busy } = usePush();
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(KEY) === "1";
    } catch {
      return false;
    }
  });
  if (hidden || (state !== "default" && state !== "ios-install")) return null;
  const dismiss = () => {
    setHidden(true);
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* private mode */
    }
  };
  return (
    <div className="mx-4 mb-3 flex items-start gap-3 rounded-2xl bg-accent/15 p-3">
      <div className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-white">
        <Bell className="size-[18px]" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-semibold">Never miss a message</div>
        {state === "ios-install" ? (
          <div className="mt-0.5 text-[13px] text-sub">In Safari tap Share → Add to Home Screen, then open Nexus from the icon to turn on notifications.</div>
        ) : (
          <button disabled={busy} onClick={() => void enablePush()} className="mt-1.5 rounded-full bg-accent px-3.5 py-1.5 text-[13px] font-semibold text-white disabled:opacity-60">
            {busy ? "Turning on…" : "Turn on notifications"}
          </button>
        )}
      </div>
      <button onClick={dismiss} className="rounded-full p-1 text-sub active:bg-white/10" aria-label="Dismiss">
        <X className="size-4" />
      </button>
    </div>
  );
}
