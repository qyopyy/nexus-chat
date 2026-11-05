"use client";

import { cn } from "@/lib/utils";
import { accById, birdById, type Equipped } from "./catalog";

/** Stacked emoji fit preview for the lobby / shop. */
export default function BirdPreview({ birdId, equipped, size = "lg" }: { birdId: string; equipped: Equipped; size?: "sm" | "md" | "lg" }) {
  const bird = birdById(birdId);
  const hat = accById(equipped.hat);
  const face = accById(equipped.face);
  const neck = accById(equipped.neck);
  const back = accById(equipped.back);
  const trail = accById(equipped.trail);
  const box = size === "lg" ? "size-36 text-7xl" : size === "md" ? "size-20 text-4xl" : "size-12 text-2xl";
  const chip = size === "lg" ? "text-2xl" : size === "md" ? "text-lg" : "text-sm";

  return (
    <div className="relative inline-flex flex-col items-center">
      {trail && size !== "sm" && <span className={cn("absolute -bottom-1 left-1/2 -translate-x-1/2 opacity-80", chip)}>{trail.emoji}</span>}
      <div className={cn("relative grid place-items-center rounded-full shadow-xl", box)} style={{ background: `radial-gradient(circle at 35% 30%, #fff8,#0000), ${bird.color}` }}>
        {back && <span className={cn("absolute -left-2 top-1/2 -translate-y-1/2", chip)}>{back.emoji}</span>}
        <span className="relative z-[1]">🐤</span>
        {hat && <span className={cn("absolute -top-1 left-1/2 z-[2] -translate-x-1/2", chip)}>{hat.emoji}</span>}
        {face && <span className={cn("absolute top-1/2 right-0 z-[2] -translate-y-1/2", chip)}>{face.emoji}</span>}
        {neck && <span className={cn("absolute -bottom-0.5 left-1/2 z-[2] -translate-x-1/2", chip)}>{neck.emoji}</span>}
      </div>
    </div>
  );
}
