"use client";

import { useEffect, useRef, useState } from "react";
import { HeadphoneOff, Maximize, MicOff, Monitor, Volume2, VolumeX } from "lucide-react";
import { useApp } from "@/store/app";
import { useCall } from "@/lib/call";
import { cn } from "@/lib/utils";
import Avatar from "@/components/ui/Avatar";
import VolumeMenu from "./VolumeMenu";

export type Tile = {
  key: string;
  userId: string;
  kind: "cam" | "screen";
  stream: MediaStream | null;
  isMe: boolean;
  speaking: boolean;
  muted: boolean;
  deafened: boolean;
  connecting?: boolean;
};

export default function VideoTile({
  tile,
  focused,
  compact,
  onClick,
}: {
  tile: Tile;
  focused?: boolean;
  compact?: boolean;
  onClick?: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const profile = useApp((s) => s.profiles[tile.userId]);
  const localMuted = useCall((s) => !!s.localMutes[tile.userId]);
  const volume = useCall((s) => s.userVolumes[tile.userId] ?? 1);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const el = video.current;
    if (!el) return;
    if (el.srcObject !== tile.stream) el.srcObject = tile.stream;
    if (tile.stream) void el.play().catch(() => {});
  }, [tile.stream]);

  const hasVideo = !!tile.stream;
  const mirror = tile.isMe && tile.kind === "cam";
  const name = tile.isMe ? `${profile?.display_name ?? "You"}` : profile?.display_name ?? "…";

  return (
    <div
      ref={box}
      onClick={onClick}
      onContextMenu={(e) => {
        if (tile.isMe) return;
        e.preventDefault();
        setMenu({ x: e.clientX, y: e.clientY });
      }}
      className={cn(
        "group relative flex h-full w-full cursor-pointer items-center justify-center overflow-hidden rounded-xl bg-[#232428] transition-shadow",
        tile.speaking && tile.kind === "cam" ? "ring-[3px] ring-ok" : "ring-0",
        compact && "rounded-lg",
      )}
      style={!hasVideo ? { background: `radial-gradient(circle at 50% 40%, ${profile?.avatar_color ?? "#5865f2"}55, #1e1f22 70%)` } : undefined}
    >
      {hasVideo ? (
        <video
          ref={video}
          autoPlay
          playsInline
          muted
          className={cn("h-full w-full", tile.kind === "screen" || focused ? "object-contain" : "object-cover", mirror && "-scale-x-100")}
        />
      ) : (
        <>
          <video ref={video} className="hidden" muted />
          <Avatar userId={tile.userId} size={compact ? 44 : 84} speaking={tile.speaking} />
        </>
      )}

      {/* name tag */}
      <div className={cn("absolute bottom-2 left-2 flex max-w-[85%] items-center gap-1.5 rounded-md bg-black/60 px-2 py-1 text-white backdrop-blur", compact ? "text-[11px]" : "text-xs sm:text-sm")}>
        {tile.kind === "screen" && <Monitor className="size-3.5 shrink-0" />}
        <span className="truncate font-medium">{tile.kind === "screen" ? `${name}'s screen` : name}</span>
        {tile.kind === "cam" && tile.deafened && <HeadphoneOff className="size-3.5 shrink-0 text-dnd" />}
        {tile.kind === "cam" && !tile.deafened && tile.muted && <MicOff className="size-3.5 shrink-0 text-dnd" />}
        {!tile.isMe && localMuted && <VolumeX className="size-3.5 shrink-0 text-dnd" />}
      </div>

      {tile.kind === "screen" && (
        <span className="absolute top-2 left-2 rounded bg-dnd px-1.5 py-0.5 text-[10px] font-bold text-white">LIVE</span>
      )}
      {tile.connecting && (
        <span className="absolute top-2 left-2 rounded bg-black/60 px-2 py-0.5 text-[11px] text-idle">connecting…</span>
      )}

      {/* hover actions */}
      <div className="absolute top-2 right-2 hidden gap-1 group-hover:flex">
        {!tile.isMe && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
              setMenu({ x: r.right, y: r.bottom + 4 });
            }}
            className="flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-xs text-white hover:bg-black/80"
            title="User volume"
          >
            {localMuted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
            {Math.round(volume * 100)}%
          </button>
        )}
        {hasVideo && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              void box.current?.requestFullscreen?.();
            }}
            className="rounded-md bg-black/60 p-1.5 text-white hover:bg-black/80"
            title="Fullscreen"
          >
            <Maximize className="size-4" />
          </button>
        )}
      </div>

      {menu && <VolumeMenu userId={tile.userId} x={menu.x} y={menu.y} onClose={() => setMenu(null)} />}
    </div>
  );
}
