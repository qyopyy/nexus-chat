"use client";

import { useEffect, useState } from "react";
import { Music2 } from "lucide-react";
import { getSounds } from "@/lib/snapSoundsNet";
import { embedUrl, timeLeftLabel, type Sound } from "@/lib/snapSounds";

/** The Spotify sound someone put on their profile in Nexus Snap (disappears after 24 hours, 48 for VIP and staff). */
export default function ProfileSound({ userId }: { userId: string }) {
  const [s, setS] = useState<Sound | null>(null);
  useEffect(() => {
    let live = true;
    setS(null);
    void getSounds([userId]).then((m) => live && setS(m[userId] ?? null));
    return () => {
      live = false;
    };
  }, [userId]);
  const embed = s ? embedUrl(s.track_id) : null;
  if (!s || !embed) return null;
  return (
    <div className="mb-3">
      <div className="mb-1 flex items-center gap-1 text-xs font-bold tracking-wide text-sub uppercase">
        <Music2 className="size-3.5" /> Sound · {timeLeftLabel(s.expires_at, Date.now())}
      </div>
      <iframe src={embed} title={`${s.title} on Spotify`} loading="lazy" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" className="h-[80px] w-full rounded-xl border-0" />
    </div>
  );
}
