"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Gauge, MessageCircle, Navigation, User, X } from "lucide-react";
import type { BumpNearby } from "@/lib/bump";
import type { LMap, LeafletNS } from "@/lib/geo";
import { externalMapsUrl, fmtDistance } from "@/lib/wumpMapApi";
import { useApp } from "@/store/app";
import { wumpPresenceBits, type WumpNudgeKind } from "@/lib/wumpTogether";
import { batteryLow, compassFromHeading, freshPin, shortPlace, speedKmh } from "@/lib/hundred";
import WumpNudgeBar from "./WumpNudgeBar";
import Avatar from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";

type Removable = { remove: () => void; setLatLngs?: (c: [number, number][]) => void };

export function metersBetween(a: [number, number], b: [number, number]) {
  const R = 6371000;
  const r = Math.PI / 180;
  const dLat = (b[0] - a[0]) * r;
  const dLng = (b[1] - a[1]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function ageText(sec: number) {
  if (sec < 5) return "just now";
  if (sec < 60) return `${Math.round(sec)}s ago`;
  if (sec < 3600) return `${Math.round(sec / 60)}m ago`;
  return `${Math.round(sec / 3600)}h ago`;
}

/**
 * "Live with" a friend: their pin is tracked in realtime, a live line joins you, the camera keeps you both
 * in view, and the card ticks how fresh their position is.
 */
export default function WumpLiveWith({
  mapRef,
  LRef,
  ready,
  me,
  friendId,
  friend,
  onClose,
  onMessage,
  onProfile,
  onNudge,
}: {
  mapRef: React.RefObject<LMap | null>;
  LRef: React.RefObject<LeafletNS | null>;
  ready: boolean;
  me: [number, number] | null;
  friendId: string;
  friend: (BumpNearby & { battery_pct?: number | null }) | null;
  onClose: () => void;
  onMessage?: (id: string) => void;
  onProfile: (id: string) => void;
  onNudge?: (id: string, kind: WumpNudgeKind) => void;
}) {
  const p = useApp((s) => s.profiles[friendId]);
  const [now, setNow] = useState(() => Date.now());
  const line = useRef<Removable[]>([]);
  const panned = useRef(false);
  const lastFit = useRef(0);

  // tick the "updated Xs ago" label
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // new friend → camera takes over again until the user pans
  useEffect(() => {
    panned.current = false;
    const map = mapRef.current;
    if (!map) return;
    const mark = () => {
      if (Date.now() - lastFit.current > 700) panned.current = true;
    };
    map.on("dragstart", mark);
    return () => {
      map.off?.("dragstart", mark);
    };
  }, [friendId, mapRef]);

  // live line + camera
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!ready || !L || !map) return;
    if (!friend) {
      line.current.forEach((l) => l.remove());
      line.current = [];
      return;
    }
    const f: [number, number] = [friend.lat, friend.lng];
    if (me) {
      const coords: [number, number][] = [me, f];
      if (line.current.length === 2 && line.current[0].setLatLngs) {
        line.current.forEach((l) => l.setLatLngs?.(coords));
      } else {
        line.current.forEach((l) => l.remove());
        line.current = [
          L.polyline(coords, { color: "#0f172a", weight: 7, opacity: 0.18, lineCap: "round" }).addTo(map) as unknown as Removable,
          L.polyline(coords, { color: "#facc15", weight: 3.5, opacity: 0.95, lineCap: "round", dashArray: "2 8" }).addTo(map) as unknown as Removable,
        ];
      }
    } else {
      line.current.forEach((l) => l.remove());
      line.current = [];
    }
    if (!panned.current) {
      lastFit.current = Date.now();
      try {
        if (me) map.fitBounds([me, f], { padding: [90, 90], maxZoom: 17 });
        else map.setView(f, Math.max(map.getZoom?.() ?? 15, 16));
      } catch {
        /* map not sized yet */
      }
    }
  }, [ready, friend, me, LRef, mapRef]);

  useEffect(
    () => () => {
      line.current.forEach((l) => l.remove());
      line.current = [];
    },
    [],
  );

  const name = friend?.display_name || p?.display_name || friend?.username || p?.username || "Friend";
  const username = friend?.username || p?.username || null;
  const age = friend ? Math.max(0, (now - new Date(friend.updated_at).getTime()) / 1000) : null;
  const liveNow = freshPin(age);
  const dist = friend ? (me ? metersBetween(me, [friend.lat, friend.lng]) : friend.meters) : null;
  const kmh = speedKmh(friend?.speed_mps);
  const dir = compassFromHeading(friend?.heading);
  const place = shortPlace(friend?.place_name || friend?.place_locality);
  const lowBattery = batteryLow(friend?.battery_pct);
  const bits = wumpPresenceBits(friend);

  return (
    <div className="absolute inset-x-3 bottom-[7.75rem] z-30 overflow-hidden rounded-2xl bg-white/97 shadow-2xl ring-1 ring-amber-300/60 backdrop-blur-md">
      <div className="flex items-center gap-3 p-3">
        <div className="relative">
          <Avatar userId={friendId} size={44} />
          <span className={cn("absolute -right-0.5 -bottom-0.5 size-3 rounded-full ring-2 ring-white", liveNow ? "animate-pulse bg-emerald-500" : "bg-slate-400")} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-bold text-slate-900">{name}</span>
            <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-black tracking-wide text-amber-700 uppercase">Live with</span>
          </div>
          <div className="truncate text-[11px] text-slate-500">
            {friend ? (
              <>
                <span className={liveNow ? "font-semibold text-emerald-600" : ""}>{liveNow ? "● Live" : "Last seen"}</span> · updated {ageText(age ?? 0)}
                {bits.length ? ` · ${bits.join(" · ")}` : place ? ` · ${place}` : ""}
              </>
            ) : (
              "Not sharing their location with you right now"
            )}
          </div>
        </div>
        <button onClick={onClose} className="grid size-7 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200" aria-label="Stop">
          <X className="size-4" />
        </button>
      </div>

      {onNudge && <WumpNudgeBar onNudge={(kind) => onNudge(friendId, kind)} />}

      {friend && (
        <div className="grid grid-cols-3 gap-px border-t border-slate-100 bg-slate-100 text-center">
          <div className="bg-white px-2 py-2">
            <div className="text-sm font-black text-slate-900">{dist != null ? fmtDistance(dist) : "—"}</div>
            <div className="text-[10px] font-semibold text-slate-400">{me ? "from you" : "away"}</div>
          </div>
          <div className="bg-white px-2 py-2">
            <div className="flex items-center justify-center gap-1 text-sm font-black text-slate-900">
              <Gauge className="size-3.5 text-slate-400" /> {kmh != null ? `${kmh} km/h` : "Still"}
            </div>
            <div className="text-[10px] font-semibold text-slate-400">speed</div>
          </div>
          <div className="bg-white px-2 py-2">
            <div className="flex items-center justify-center gap-1 text-sm font-black text-slate-900">
              {friend.battery_pct != null ? (
                <>
                  <span className="text-xs">🔋</span> <span className={lowBattery ? "text-red-600" : undefined}>{Math.round(friend.battery_pct)}%</span>
                </>
              ) : (
                <>
                  <Navigation className="size-3.5 text-slate-400" style={friend.heading != null ? { transform: `rotate(${friend.heading - 45}deg)` } : undefined} /> {dir ?? "—"}
                </>
              )}
            </div>
            <div className="text-[10px] font-semibold text-slate-400">{friend.battery_pct != null ? "battery" : "heading"}</div>
          </div>
        </div>
      )}

      <div className="flex gap-2 border-t border-slate-100 p-2.5">
        {onMessage && (
          <button onClick={() => onMessage(friendId)} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2.5 text-xs font-bold text-white hover:bg-emerald-500">
            <MessageCircle className="size-3.5" /> Message
          </button>
        )}
        <button onClick={() => onProfile(friendId)} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-slate-100 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-200">
          <User className="size-3.5" /> Profile
        </button>
        {friend && (
          <a href={externalMapsUrl([friend.lat, friend.lng], username ? `@${username}` : name, "walk")} target="_blank" rel="noreferrer" className="grid size-10 place-items-center rounded-xl bg-slate-900 text-white" aria-label="Directions" title="Directions">
            <ArrowUpRight className="size-4" />
          </a>
        )}
      </div>
    </div>
  );
}
