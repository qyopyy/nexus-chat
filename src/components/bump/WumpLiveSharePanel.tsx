"use client";

import { useEffect, useRef, useState } from "react";
import { etaMinutes, metersBetween } from "@/lib/syncMath";
import { getDeviceLocation } from "@/lib/location";
import {
  endHeading,
  headingState,
  myLiveShares,
  pingHeading,
  pingLiveShare,
  revokeLiveShare,
  startHeading,
  startLiveShare,
  subscribeHeading,
  type HeadingState,
  type LiveShare,
} from "@/lib/wumpLive";
import type { WumpSavedPlace } from "@/lib/wumpPlaces";
import { toast } from "@/store/app";

export default function WumpLiveSharePanel({
  lat,
  lng,
  places,
  onHeadingPath,
}: {
  lat: number | null;
  lng: number | null;
  places: WumpSavedPlace[];
  onHeadingPath?: (points: { lat: number; lng: number }[]) => void;
}) {
  const [shares, setShares] = useState<LiveShare[]>([]);
  const [minutes, setMinutes] = useState(60);
  const [heading, setHeading] = useState<HeadingState | null>(null);
  const [placeId, setPlaceId] = useState("");
  const pathRef = useRef<{ lat: number; lng: number }[]>([]);

  async function refreshShares() {
    setShares(await myLiveShares());
  }

  useEffect(() => {
    void refreshShares();
  }, []);

  useEffect(() => {
    pathRef.current = [];
    onHeadingPath?.([]);
  }, [heading?.id, onHeadingPath]);

  useEffect(() => {
    if (!heading?.id || lat == null || lng == null) return;
    const last = pathRef.current[pathRef.current.length - 1];
    if (!last || metersBetween(last.lat, last.lng, lat, lng) > 25) {
      pathRef.current = [...pathRef.current, { lat, lng }].slice(-300);
      onHeadingPath?.(pathRef.current);
    }
    const destLat = heading.dest_lat ?? lat;
    const destLng = heading.dest_lng ?? lng;
    const eta = etaMinutes(metersBetween(lat, lng, destLat, destLng), null);
    void pingHeading(heading.id, lat, lng, null, eta).catch(() => undefined);
    const stop = subscribeHeading(heading.id, () => {
      void headingState(heading.id!).then(setHeading).catch(() => undefined);
    });
    return stop;
  }, [heading?.id, lat, lng, heading?.dest_lat, heading?.dest_lng]);

  const link = (token: string, path: string) => `${window.location.origin}${path}/${token}`;

  return (
    <section className="overflow-hidden rounded-2xl bg-side ring-1 ring-white/5">
      <div className="border-b border-white/5 px-4 py-3">
        <div className="text-sm font-bold">Live share</div>
        <p className="text-[11px] text-sub">A link shows your pin until it expires. It is not your normal friend map.</p>
      </div>
      <div className="space-y-2 px-4 py-3">
        <div className="flex flex-wrap gap-2">
          {[15, 60, 240].map((n) => (
            <button key={n} type="button" onClick={() => setMinutes(n)} className={`rounded-full px-2 py-1 text-[11px] font-semibold ${minutes === n ? "bg-white text-black" : "bg-white/5 text-sub"}`}>
              {n < 60 ? `${n} min` : `${n / 60} h`}
            </button>
          ))}
          <button
            type="button"
            disabled={lat == null || lng == null}
            className="rounded-full bg-sky-400 px-3 py-1 text-[11px] font-bold text-sky-950 disabled:opacity-40"
            onClick={() => {
              if (lat == null || lng == null) return;
              void startLiveShare({ minutes, lat, lng })
                .then(async (row) => {
                  await navigator.clipboard.writeText(link(row.token, "/wump/live"));
                  toast("Live link copied", "success");
                  await refreshShares();
                })
                .catch((e: Error) => toast(e.message, "error"));
            }}
          >
            Copy live link
          </button>
        </div>
        <ul className="space-y-1 text-[11px]">
          {shares.map((share) => (
            <li key={share.id} className="flex items-center justify-between gap-2">
              <span className="truncate">Until {new Date(share.expires_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
              <button
                type="button"
                className="text-dnd"
                onClick={() => {
                  if (lat != null && lng != null) void pingLiveShare(share.id, lat, lng);
                  void revokeLiveShare(share.id).then(refreshShares);
                }}
              >
                Revoke
              </button>
            </li>
          ))}
        </ul>
        <div className="border-t border-white/5 pt-3">
          <div className="text-sm font-bold">Heading there</div>
          <p className="text-[11px] text-sub">Up to 8 people. Each pin updates while this page is open, with a walking ETA.</p>
          <select value={placeId} onChange={(e) => setPlaceId(e.target.value)} className="mt-2 w-full rounded-xl bg-black/30 px-2 py-1.5 text-xs">
            <option value="">Current location</option>
            {places.map((place) => (
              <option key={place.id} value={place.id}>{place.name}</option>
            ))}
          </select>
          <button
            type="button"
            className="mt-2 rounded-full bg-amber-400 px-3 py-1 text-[11px] font-bold text-amber-950"
            onClick={() => {
              const place = places.find((row) => row.id === placeId);
              const destLat = place?.lat ?? lat;
              const destLng = place?.lng ?? lng;
              if (destLat == null || destLng == null) return toast("Go Live or pick a saved place", "error");
              void startHeading({ title: place?.name || "Heading there", lat: destLat, lng: destLng, name: place?.name })
                .then(async (row) => {
                  await navigator.clipboard.writeText(link(row.token, "/wump/go"));
                  toast("Heading link copied", "success");
                  setHeading(await headingState(row.id));
                })
                .catch((e: Error) => toast(e.message, "error"));
            }}
          >
            Start and copy link
          </button>
          {heading?.ok && (
            <div className="mt-2 space-y-1 text-[11px]">
              <div className="font-semibold">{heading.title} → {heading.dest_name || "pin"}</div>
              {(heading.members ?? []).map((member) => (
                <div key={member.user_id}>
                  {member.display_name || member.username || "Someone"}
                  {member.eta_min != null ? ` · ${member.eta_min} min` : ""}
                  {member.lat != null ? ` · ${member.lat.toFixed(3)}, ${member.lng?.toFixed(3)}` : ""}
                </div>
              ))}
              <button type="button" className="text-dnd" onClick={() => heading.id && void endHeading(heading.id).then(() => setHeading(null))}>
                End session
              </button>
            </div>
          )}
          <button
            type="button"
            className="mt-2 text-[11px] text-sub"
            onClick={() => {
              void getDeviceLocation({ highAccuracy: false }).then((loc) => {
                if (heading?.id) {
                  const eta = heading.dest_lat != null && heading.dest_lng != null ? etaMinutes(metersBetween(loc.lat, loc.lng, heading.dest_lat, heading.dest_lng), loc.speed) : 1;
                  return pingHeading(heading.id, loc.lat, loc.lng, loc.accuracy, eta);
                }
              }).catch((e: Error) => toast(e.message, "error"));
            }}
          >
            Update my pin
          </button>
        </div>
      </div>
    </section>
  );
}
