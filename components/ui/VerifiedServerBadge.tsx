"use client";

import { cn } from "@/lib/utils";

/** Checkmark shown after a verified server's name. */
export default function VerifiedServerBadge({ className, size = 16, title = "Verified server" }: { className?: string; size?: number; title?: string }) {
  return (
    <span title={title} aria-label={title} role="img" className={cn("inline-grid shrink-0 place-items-center align-middle", className)} style={{ width: size, height: size }}>
      <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden>
        <path
          fill="#23A55A"
          d="M12 1.5l2.4 1.9 3-.3 1 2.9 2.7 1.4-.6 3 1.6 2.6-2.2 2.1.1 3-3 .7-1.4 2.7-2.9-1-2.7 1.5-2.4-1.9-3 .2-.9-2.9-2.7-1.5.7-3L1.6 12l2.2-2.1-.1-3 3-.6L8 3.6l2.9.9z"
        />
        <path fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" d="M7.6 12.3l3 3 5.8-6" />
      </svg>
    </span>
  );
}
