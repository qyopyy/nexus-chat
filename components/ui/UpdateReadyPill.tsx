"use client";

import { useEffect, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { reloadToUpdate } from "@/lib/liveUpdate";

/** "New version of Nexus is ready" — appears seconds after a deploy (Supabase Realtime) */
export default function UpdateReadyPill() {
  const [ready, setReady] = useState(false);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const on = () => {
      setReady(true);
      setHidden(false);
    };
    window.addEventListener("nexus:update-ready", on);
    return () => window.removeEventListener("nexus:update-ready", on);
  }, []);
  if (!ready || hidden) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[max(.75rem,env(safe-area-inset-top))] z-[120] flex justify-center px-3">
      <div className="pointer-events-auto flex animate-pop items-center gap-2 rounded-full bg-accent py-1.5 pr-1.5 pl-4 text-sm font-semibold text-white shadow-2xl ring-1 ring-white/20">
        ✨ A new version of Nexus is ready
        <button onClick={reloadToUpdate} className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-black active:scale-95">
          <RefreshCw className="size-3.5" /> Refresh
        </button>
        <button onClick={() => setHidden(true)} className="grid size-7 place-items-center rounded-full hover:bg-white/15" aria-label="Later">
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
