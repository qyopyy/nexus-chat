"use client";

import { ArrowLeft, Disc3 } from "lucide-react";
import { useApp } from "@/store/app";
import { cn } from "@/lib/utils";
import DistributionPanelCard from "./DistributionPanelCard";

export function openDistributionHub() {
  const mobile = typeof window !== "undefined" && window.innerWidth < 768;
  useApp.setState(
    mobile
      ? { mobileTab: "apps", hub: "panel", appsTool: null, mobileSidebar: true }
      : { hub: "panel", appsTool: null },
  );
}

export default function DistributionPanelHub({ mobile, onBack }: { mobile?: boolean; onBack?: () => void }) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-chat text-txt">
      <header className={cn("flex shrink-0 items-center gap-2 border-b border-black/20 px-3", mobile ? "pt-safe-3 pb-2" : "h-12")}>
        <button
          type="button"
          onClick={() => (onBack ? onBack() : useApp.setState({ hub: null }))}
          className="grid size-9 place-items-center rounded-full hover:bg-hover"
          aria-label="Back"
        >
          <ArrowLeft className="size-5" />
        </button>
        <Disc3 className="size-5 text-[#e4a15a]" />
        <span className={cn("font-bold", mobile ? "text-2xl tracking-tight" : "text-base")}>Panel</span>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-xl p-4 sm:p-6">
          <DistributionPanelCard />
          <p className="mt-4 text-sm text-sub">
            Acetate keeps the same door at Distribution in the library, and at /panel. Signing in on the panel is separate from your Nexus chat session.
          </p>
        </div>
      </div>
    </div>
  );
}
