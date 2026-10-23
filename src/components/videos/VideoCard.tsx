"use client";

import { useApp, openProfileCard } from "@/store/app";
import { videosGo } from "@/store/studio";
import { fmtDuration, fmtViews, isHD, qualityLabel, timeAgo } from "@/lib/videos";
import { cn } from "@/lib/utils";
import Avatar from "@/components/ui/Avatar";
import NameTag from "@/components/ui/NameTag";
import type { Video } from "@/lib/types";

export function Thumb({ v, className, rounded = "rounded-xl" }: { v: Video; className?: string; rounded?: string }) {
  return (
    <div className={cn("relative aspect-video w-full overflow-hidden bg-black/40", rounded, className)}>
      {v.thumb_url ? (
        <img src={v.thumb_url} alt="" loading="lazy" className="size-full object-cover transition duration-300 group-hover:scale-[1.03]" />
      ) : (
        <div className="grid size-full place-items-center bg-gradient-to-br from-accent/30 to-black text-3xl">▶</div>
      )}
      {v.duration ? <span className="absolute right-1.5 bottom-1.5 rounded-md bg-black/80 px-1.5 py-0.5 text-[11px] font-semibold text-white tabular-nums">{fmtDuration(v.duration)}</span> : null}
      {isHD(v) && (
        <span className="absolute top-1.5 right-1.5 rounded bg-black/70 px-1 text-[10px] font-black tracking-wide text-white" title={qualityLabel(v.height, v.width)}>
          {Math.min(v.height ?? 0, v.width ?? 0) >= 2160 ? "4K" : "HD"}
        </span>
      )}
    </div>
  );
}

/** Grid card: thumbnail, avatar, title, channel, views · age */
export default function VideoCard({ v, compact }: { v: Video; compact?: boolean }) {
  const owner = useApp((s) => s.profiles[v.owner_id]);
  const open = () => videosGo({ view: "watch", key: v.slug ?? v.id });
  if (compact) {
    return (
      <button onClick={open} className="group flex w-full gap-2.5 rounded-xl p-1 text-left hover:bg-white/5">
        <Thumb v={v} className="w-40 shrink-0" rounded="rounded-lg" />
        <div className="min-w-0 flex-1 py-0.5">
          <div className="line-clamp-2 text-sm leading-snug font-semibold">{v.title}</div>
          <div className="mt-1 truncate text-xs text-sub">{owner?.display_name ?? "…"}</div>
          <div className="text-xs text-sub">
            {fmtViews(v.views)} views · {timeAgo(v.published_at ?? v.created_at)}
          </div>
        </div>
      </button>
    );
  }
  return (
    <div className="group min-w-0">
      <button onClick={open} className="block w-full">
        <Thumb v={v} />
      </button>
      <div className="mt-2.5 flex gap-2.5">
        <button onClick={() => videosGo({ view: "channel", userId: v.owner_id })} className="shrink-0">
          <Avatar userId={v.owner_id} size={36} plain />
        </button>
        <div className="min-w-0 flex-1">
          <button onClick={open} className="line-clamp-2 text-left text-[15px] leading-snug font-semibold">
            {v.title}
          </button>
          <button onClick={(e) => (e.metaKey ? openProfileCard(v.owner_id, e) : videosGo({ view: "channel", userId: v.owner_id }))} className="mt-0.5 block max-w-full text-left text-[13px] text-sub hover:text-txt">
            <NameTag userId={v.owner_id} badges maxBadges={2} />
          </button>
          <div className="text-[13px] text-sub">
            {fmtViews(v.views)} views · {timeAgo(v.published_at ?? v.created_at)}
          </div>
        </div>
      </div>
    </div>
  );
}
