"use client";

import { Heart, Instagram, Link2, Share2 } from "lucide-react";
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

async function copyHandle(label: string, handle: string) {
  const text = `@${handle}`;
  try {
    await navigator.clipboard.writeText(text);
    haptic.success();
    toast(`${label} copied — ${text}`, "success");
  } catch {
    toast(text, "info");
  }
}

/** Credit + support + Instagram — login / welcome / Me / settings */
export function NexusCredit({
  className,
  compact,
  support = !compact,
}: {
  className?: string;
  compact?: boolean;
  /** Show Support us + Instagram (default on for full credit) */
  support?: boolean;
}) {
  return (
    <div className={cn("space-y-2 text-center text-[12px] leading-relaxed text-sub/80", className)}>
      <p>
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
      {support && (
        <div className="flex flex-col items-center gap-1.5 sm:gap-2">
          <a
            href={SITE.revolut.url}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => {
              // Keep a fallback copy for Revolut usernames if the deep link fails later
              if (e.metaKey || e.ctrlKey) return;
            }}
            className="inline-flex items-center gap-1.5 font-semibold text-inherit underline-offset-2 hover:underline"
          >
            <Heart className="size-3.5 shrink-0 opacity-80" aria-hidden />
            Support us · Revolut @{SITE.revolut.handle}
          </a>
          <button
            type="button"
            onClick={() => void copyHandle("Revolut", SITE.revolut.handle)}
            className="text-[11px] font-medium opacity-70 underline-offset-2 hover:underline"
          >
            Copy Revolut @{SITE.revolut.handle}
          </button>
          <a
            href={SITE.instagram.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 font-semibold text-inherit underline-offset-2 hover:underline"
          >
            <Instagram className="size-3.5 shrink-0 opacity-80" aria-hidden />
            Instagram @{SITE.instagram.handle}
          </a>
        </div>
      )}
    </div>
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
