"use client";

import { Link2, Share2 } from "lucide-react";
import { toast } from "@/store/app";
import { haptic } from "@/lib/haptics";
import { SITE, shareAppText, shareAppUrl } from "@/lib/seo";
import { cn } from "@/lib/utils";

export async function copyNexusAppLink() {
  const url = shareAppUrl();
  try {
    if (typeof navigator !== "undefined" && navigator.share) {
      await navigator.share({ title: "Nexus", text: shareAppText(), url });
      haptic.success();
      return;
    }
  } catch (e) {
    if ((e as Error)?.name === "AbortError") return;
  }
  try {
    await navigator.clipboard.writeText(url);
    haptic.success();
    toast("Nexus app link copied", "success");
  } catch {
    toast(url, "info");
  }
}

/** Compact credit line used on login / welcome / Me / settings */
export function NexusCredit({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <p className={cn("text-center text-[12px] leading-relaxed text-sub/80", className)}>
      Made with <span aria-hidden>❤️</span>{" "}
      <a
        href={SITE.makers.url}
        target="_blank"
        rel="noreferrer"
        className="font-semibold text-inherit underline-offset-2 hover:underline"
      >
        @{SITE.makers.handle}
      </a>
      {!compact && <span className="sr-only"> — {SITE.makers.org}</span>}
    </p>
  );
}

/** Share Nexus app link + credit footer block */
export default function NexusShareFooter({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      <button
        type="button"
        onClick={() => void copyNexusAppLink()}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-side px-4 py-3 text-[15px] font-semibold text-txt active:bg-white/[.06] hover:bg-hover"
      >
        <Share2 className="size-4 text-accent" />
        Share Nexus app link
        <Link2 className="size-3.5 text-sub" />
      </button>
      <NexusCredit />
    </div>
  );
}
