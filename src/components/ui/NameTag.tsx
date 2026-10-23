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
      .filter(Boolean)
      .sort((a, b) => b.priority - a.priority)
      .forEach((b) => out.push({ key: b.id, name: b.name, icon: b.icon, color: b.color, description: b.description }));
    return out.slice(0, max);
  }, [role, ids, catalog, max]);

  if (!list.length) return null;
  const box = size === "lg" ? "h-7 min-w-7 text-base px-1.5" : size === "md" ? "h-5 min-w-5 text-[13px] px-1" : "h-4 min-w-4 text-[11px] px-0.5";
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-0.5 align-middle", className)}>
      {list.map((b) => (
        <span
          key={b.key}
          title={b.description ? `${b.name} — ${b.description}` : b.name}
          className={cn("inline-grid place-items-center rounded-md leading-none", box)}
          style={{ background: `${b.color}26`, boxShadow: `inset 0 0 0 1px ${b.color}55` }}
        >
          {b.icon}
        </span>
      ))}
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
}: {
  userId: string;
  className?: string;
  badges?: boolean;
  badgeSize?: "sm" | "md" | "lg";
  fallbackColor?: string;
}) {
  const p = useApp((s) => s.profiles[userId]);
  const role = (p?.site_role ?? "member") as SiteRole;
  const info = ROLE_INFO[role];
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1", className)}>
      <span className={cn("truncate", info.nameClass)} style={!info.nameClass && fallbackColor ? { color: fallbackColor } : undefined}>
        {p?.display_name ?? "…"}
      </span>
      {badges && <Badges userId={userId} size={badgeSize} />}
    </span>
  );
}
