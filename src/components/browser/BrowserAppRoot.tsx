"use client";

import { useEffect } from "react";
import { useApp } from "@/store/app";
import BrowserHub from "@/components/browser/BrowserHub";
import Toasts from "@/components/ui/Toasts";

/**
 * Nexus Browser app (`/browser/app`, App Store build).
 * A private web browser only: search, ad/tracker shields, encrypted DNS and reader mode.
 * No account, no social features, no over-the-air code updates (App Review 2.5.19).
 */
export default function BrowserAppRoot() {
  useEffect(() => {
    useApp.setState({ hub: "apps", appsTool: "browser" });
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#0b1220] text-white">
      <div className="flex shrink-0 items-center gap-2.5 border-b border-white/10 bg-[#111827] px-3 pt-safe-3 pb-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/browser-icon.png" alt="" className="size-9 rounded-xl object-cover ring-1 ring-white/15" width={36} height={36} />
        <div className="min-w-0">
          <div className="text-[11px] font-bold tracking-[0.14em] text-[#93c5fd] uppercase">Nexus Browser</div>
          <div className="truncate text-sm font-semibold text-white/80">Private search · Shields · Encrypted DNS · Reader</div>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <BrowserHub standalone />
      </div>
      <Toasts />
    </div>
  );
}
