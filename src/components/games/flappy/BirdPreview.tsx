"use client";

import { cn } from "@/lib/utils";
import { accById, birdById, type Equipped } from "./catalog";

/** Painted bird preview — matches the original Flappy Happy canvas bird. */
export default function BirdPreview({ birdId, equipped, size = "lg" }: { birdId: string; equipped: Equipped; size?: "sm" | "md" | "lg" }) {
  const bird = birdById(birdId);
  const hat = accById(equipped.hat);
  const face = accById(equipped.face);
  const neck = accById(equipped.neck);
  const back = accById(equipped.back);
  const trail = accById(equipped.trail);
  const box = size === "lg" ? "size-40" : size === "md" ? "size-20" : "size-11";
  const chip = size === "lg" ? "text-xl" : size === "md" ? "text-base" : "text-[10px]";
  const svg = size === "lg" ? 96 : size === "md" ? 48 : 28;

  return (
    <div className="relative inline-flex flex-col items-center">
      {trail && size !== "sm" && <span className={cn("absolute -bottom-1 left-1/2 -translate-x-1/2 opacity-70", chip)}>{trail.emoji}</span>}
      <div className={cn("relative grid place-items-center", box)}>
        {back && <span className={cn("absolute -left-1 top-1/2 z-[1] -translate-y-1/2", chip)}>{back.emoji}</span>}
        <svg width={svg} height={svg} viewBox="0 0 64 64" aria-hidden className="relative z-[2] drop-shadow-lg">
          <defs>
            <radialGradient id={`fh-${birdId}`} cx="35%" cy="30%" r="70%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.35" />
              <stop offset="55%" stopColor={bird.color} />
              <stop offset="100%" stopColor={bird.color} stopOpacity="0.85" />
            </radialGradient>
          </defs>
          <ellipse cx="32" cy="34" rx="18" ry="16" fill={`url(#fh-${birdId})`} />
          <ellipse cx="26" cy="38" rx="8" ry="6" fill="#ffffff" opacity="0.35" />
          <circle cx="40" cy="28" r="5.5" fill="#ffffff" />
          <circle cx="41.5" cy="28" r="2.4" fill="#0f172a" />
          <path d="M46 30 L58 33 L46 37 Z" fill="#f97316" />
          <path d="M18 34 Q10 28 14 36 Q18 40 22 36 Z" fill={bird.color} opacity="0.9" />
        </svg>
        {hat && <span className={cn("absolute top-0 left-1/2 z-[3] -translate-x-1/2", chip)}>{hat.emoji}</span>}
        {face && <span className={cn("absolute top-[42%] right-0 z-[3]", chip)}>{face.emoji}</span>}
        {neck && <span className={cn("absolute bottom-1 left-1/2 z-[3] -translate-x-1/2", chip)}>{neck.emoji}</span>}
      </div>
    </div>
  );
}
