"use client";

import { useApp } from "@/store/app";
import { cn, initials } from "@/lib/utils";

const STATUS_COLOR: Record<string, string> = {
  online: "bg-ok",
  idle: "bg-idle",
  dnd: "bg-dnd",
  offline: "bg-faint",
};

type Props = {
  userId?: string | null;
  name?: string | null;
  color?: string | null;
  url?: string | null;
  size?: number;
  showStatus?: boolean;
  /** tailwind ring color class matching the background the avatar sits on */
  ringClass?: string;
  speaking?: boolean;
  className?: string;
  square?: boolean;
  /** override the profile's decoration (e.g. live preview); "" = none */
  decoration?: string | null;
  /** hide decorations for tiny avatars */
  plain?: boolean;
};

export default function Avatar({
  userId,
  name,
  color,
  url,
  size = 40,
  showStatus = false,
  ringClass = "ring-side",
  speaking = false,
  className,
  square = false,
  decoration,
  plain = false,
}: Props) {
  const profile = useApp((s) => (userId ? s.profiles[userId] : undefined));
  const status = useApp((s) => (userId ? s.presence[userId]?.status ?? "offline" : "offline"));
  const label = name ?? profile?.display_name ?? "?";
  const bg = color ?? profile?.avatar_color ?? "#5865F2";
  const img = url ?? profile?.avatar_url;
  const dot = Math.max(10, Math.round(size * 0.3));
  const deco = plain ? null : decoration !== undefined ? decoration : profile?.avatar_decoration;

  return (
    <div
      className={cn("relative shrink-0", deco && `deco deco-${deco}`, className)}
      style={{ width: size, height: size, ["--deco-w" as string]: `${Math.max(2, Math.round(size * 0.05))}px` }}
    >
      <div
        className={cn(
          "grid size-full select-none place-items-center overflow-hidden font-semibold text-white transition-shadow",
          square ? "rounded-2xl" : "rounded-full",
          speaking && "speaking-ring",
        )}
        style={{ background: img ? undefined : `linear-gradient(135deg, ${bg}, ${bg}cc)`, fontSize: size * 0.38 }}
      >
        {img ? <img src={img} alt="" className="size-full object-cover" /> : initials(label)}
      </div>
      {showStatus && (
        <span
          className={cn("absolute right-0 bottom-0 rounded-full ring-[3px]", STATUS_COLOR[status], ringClass)}
          style={{ width: dot, height: dot }}
        />
      )}
    </div>
  );
}

export function StatusDot({ userId, className }: { userId: string; className?: string }) {
  const status = useApp((s) => s.presence[userId]?.status ?? "offline");
  return <span className={cn("inline-block size-2.5 rounded-full", STATUS_COLOR[status], className)} />;
}

export function statusLabel(status: string | undefined) {
  switch (status) {
    case "online":
      return "Online";
    case "idle":
      return "Idle";
    case "dnd":
      return "Do Not Disturb";
    default:
      return "Offline";
  }
}
