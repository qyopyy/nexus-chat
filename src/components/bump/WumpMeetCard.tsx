"use client";

import { useState } from "react";
import { Compass, MapPin, Users } from "lucide-react";
import { formatMeters } from "@/lib/location";
import { compassFromHeading } from "@/lib/hundred";
import { bearingDegrees, distanceMeters, geographicMidpoint, type LatLng } from "@/lib/wumpMeet";
import { wumpCreateMeetup } from "@/lib/wumpTogether";
import type { WumpOpenPin } from "@/lib/wumpOpen";

export default function WumpMeetCard({
  me,
  friend,
  friendId,
  friendName,
  onDropPin,
}: {
  me: LatLng | null;
  friend: LatLng | null;
  friendId: string | null;
  friendName: string;
  onDropPin: (pin: WumpOpenPin) => void;
}) {
  const [busy, setBusy] = useState(false);
  if (!me || !friend || !friendId) return null;
  const mid = geographicMidpoint(me, friend);
  const mine = distanceMeters(me, mid);
  const theirs = distanceMeters(friend, mid);
  const toward = compassFromHeading(bearingDegrees(me, friend));
  const apart = distanceMeters(me, friend);

  return (
    <section className="rounded-2xl bg-side px-4 py-3 ring-1 ring-white/5">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-500/15 text-emerald-200">
          <Compass className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-txt">Meet in the middle</h3>
          <p className="mt-0.5 text-[11px] leading-relaxed text-sub">
            {friendName} is {formatMeters(apart)}
            {toward ? ` ${toward}` : ""}. The halfway point is {formatMeters(mine)} from you and {formatMeters(theirs)} from them.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-100"
              onClick={() => onDropPin({ lat: mid.lat, lng: mid.lng, name: `Meet ${friendName}` })}
            >
              <MapPin className="size-3.5" /> Show on the map
            </button>
            <button
              type="button"
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-full bg-white/8 px-3 py-1.5 text-xs font-semibold text-txt disabled:opacity-50"
              onClick={() => {
                setBusy(true);
                void wumpCreateMeetup({
                  title: `Meet ${friendName}`,
                  lat: mid.lat,
                  lng: mid.lng,
                  placeName: "Halfway",
                  note: "Halfway between your pins.",
                  invite: [friendId],
                }).finally(() => setBusy(false));
              }}
            >
              <Users className="size-3.5" /> Invite them
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
