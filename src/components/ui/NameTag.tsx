"use client";

import { useMemo } from "react";
import { useApp } from "@/store/app";
import { ROLE_INFO, type SiteRole } from "@/lib/theme";
import { cn } from "@/lib/utils";
import type { Badge } from "@/lib/types";

const EMPTY: string[] = [];

/** Role badge + granted badges, sorted by priority */
export function Badges({ userId, size = "sm", max = 6, className }: { userId: string; size?: "sm" | "md" | "lg"; max?: number; className?: string }) {
  const role = useApp((s) => s.profiles[userId]?.site_role ?? "member") as SiteRole;
  const ids = useApp((s) => s.userBadges[userId] ?? EMPTY);
  const catalog = useApp((s) => s.badges);

  const list = useMemo(() => {
    const out: (Pick<Badge, "name" | "icon" | "color" | "description"> & { key: string })[] = [];
    if (role !== "member") {
      const r = ROLE_INFO[role];
      out.push({ key: `role-${role}`, name: r.label, icon: r.icon, color: r.color, description: `Site ${r.label}` });
    }
    ids
      .map((id) => catalog[id])
      .filter((b) => b && b.key !== "verified")
      .sort((a, b) => b.priority - a.priority)
      .filter((b) => !out.some((o) => o.icon === b.icon))
      .forEach((b) => out.push({ key: b.id, name: b.name, icon: b.icon, color: b.color, description: b.description }));
    return out;
  }, [role, ids, catalog]);

  const verified = ids.some((id) => catalog[id]?.key === "verified");
  const shown = list.slice(0, verified ? Math.max(0, max - 1) : max);
  if (!shown.length && !verified) return null;
  const box = size === "lg" ? "h-7 min-w-7 text-base px-1.5" : size === "md" ? "h-5 min-w-5 text-[13px] px-1" : "h-4 min-w-4 text-[11px] px-0.5";
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-0.5 align-middle", className)}>
      {shown.map((b) => (
        <span
          key={b.key}
          title={b.description ? `${b.name} — ${b.description}` : b.name}
          className={cn("inline-grid place-items-center rounded-md leading-none", box)}
          style={{ background: `${b.color}26`, boxShadow: `inset 0 0 0 1px ${b.color}55` }}
        >
          {b.icon}
        </span>
      ))}
      {verified && <VerifiedCheck size={size === "lg" ? 22 : size === "md" ? 17 : 14} />}
    </span>
  );
}

/** White glowing verified checkmark — always rendered after the name and every other badge */
export function VerifiedCheck({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <span title="Verified" className={cn("verified-glow inline-grid shrink-0 place-items-center", className)} style={{ width: size, height: size }}>
      <svg viewBox="0 0 24 24" width={size} height={size} aria-label="Verified">
        <path
          fill="#fff"
          d="M12 1.5l2.6 1.9 3.2-.2 1 3.1 2.6 1.9-1 3.1 1 3.1-2.6 1.9-1 3.1-3.2-.2L12 22.5l-2.6-1.9-3.2.2-1-3.1L2.6 15.8l1-3.1-1-3.1 2.6-1.9 1-3.1 3.2.2z"
        />
        <path fill="none" stroke="#0b0c10" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" d="M7.6 12.3l3 3 5.8-6.1" />
      </svg>
    </span>
  );
}

/** Display name with role color/gradient + badges */
export default function NameTag({
  userId,
  className,
  badges = true,
  badgeSize = "sm",
  fallbackColor,
  maxBadges = 6,
}: {
  userId: string;
  className?: string;
  badges?: boolean;
  badgeSize?: "sm" | "md" | "lg";
  fallbackColor?: string;
  maxBadges?: number;
}) {
  const p = useApp((s) => s.profiles[userId]);
  const role = (p?.site_role ?? "member") as SiteRole;
  const info = ROLE_INFO[role];
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1", className)}>
      <span className={cn("truncate", info.nameClass)} style={!info.nameClass && fallbackColor ? { color: fallbackColor } : undefined}>
        {p?.display_name ?? "…"}
      </span>
      {badges && <Badges userId={userId} size={badgeSize} max={maxBadges} />}
    </span>
  );
}
