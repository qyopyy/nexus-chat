"use client";

import { useCallback, useEffect, useState } from "react";
import { Route } from "lucide-react";
import { toast } from "@/store/app";
import { wumpMyTrail } from "@/lib/wumpTogether";
import {
  deleteRoute,
  myRouteLinks,
  myRoutes,
  revokeRouteLink,
  saveRoute,
  shareRoute,
  type RouteLink,
  type SavedRoute,
} from "@/lib/wumpRoutes";

export default function WumpRoutesPanel({ headingPoints }: { headingPoints: { lat: number; lng: number }[] }) {
  const [routes, setRoutes] = useState<SavedRoute[]>([]);
  const [links, setLinks] = useState<RouteLink[]>([]);
  const [title, setTitle] = useState("");

  const refresh = useCallback(async () => {
    const [saved, shared] = await Promise.all([myRoutes(), myRouteLinks()]);
    setRoutes(saved);
    setLinks(shared);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function keep(source: "trail" | "heading", points: { lat: number; lng: number }[]) {
    try {
      await saveRoute({ title: title || (source === "trail" ? "My trail" : "Heading there"), source, points });
      setTitle("");
      toast("Path saved", "success");
      await refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't save that path", "error");
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl bg-side ring-1 ring-white/5">
      <div className="flex items-center gap-3 border-b border-white/5 px-4 py-3">
        <div className="grid size-9 place-items-center rounded-xl bg-sky-500/15 text-sky-200 ring-1 ring-sky-400/20">
          <Route className="size-4" />
        </div>
        <div>
          <div className="text-sm font-bold">Saved paths</div>
          <p className="text-[11px] text-sub">Keep a trail or the path from this heading-there session, then share a link you can revoke.</p>
        </div>
      </div>
      <div className="space-y-2 px-4 py-3">
        <input value={title} maxLength={80} onChange={(event) => setTitle(event.target.value)} placeholder="Path name" className="w-full rounded-xl bg-black/30 px-3 py-1.5 text-sm outline-none" />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-full bg-white px-3 py-1 text-[11px] font-bold text-black"
            onClick={() => {
              void wumpMyTrail(24).then((points) => keep("trail", points.map((point) => ({ lat: point.lat, lng: point.lng }))));
            }}
          >
            Save my trail
          </button>
          <button
            type="button"
            disabled={headingPoints.length < 2}
            className="rounded-full bg-amber-400 px-3 py-1 text-[11px] font-bold text-amber-950 disabled:opacity-40"
            onClick={() => void keep("heading", headingPoints)}
          >
            Save heading path ({headingPoints.length})
          </button>
        </div>
        <ul className="space-y-2">
          {routes.map((route) => {
            const live = links.filter((link) => link.route_id === route.id);
            return (
              <li key={route.id} className="rounded-xl bg-black/25 px-3 py-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-semibold">{route.title}</span>
                  <span className="text-sub">{route.source === "trail" ? "Trail" : "Heading"} · {route.points.length} pts</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-2">
                  {([60, 1440, 10080] as const).map((minutes) => (
                    <button
                      key={minutes}
                      type="button"
                      className="text-sky-200"
                      onClick={() => {
                        void shareRoute(route.id, minutes).then(async (link) => {
                          const url = `${window.location.origin}/wump/route/${link.token}`;
                          await navigator.clipboard.writeText(url);
                          toast("Path link copied", "success");
                          await refresh();
                        }).catch((err: Error) => toast(err.message, "error"));
                      }}
                    >
                      {minutes === 60 ? "1 hour" : minutes === 1440 ? "1 day" : "7 days"}
                    </button>
                  ))}
                  <button type="button" className="text-dnd" onClick={() => void deleteRoute(route.id).then(refresh).catch((err: Error) => toast(err.message, "error"))}>Delete</button>
                </div>
                {live.map((link) => (
                  <div key={link.id} className="mt-1 flex items-center justify-between gap-2 text-sub">
                    <span>Link until {new Date(link.expires_at).toLocaleString()}</span>
                    <button type="button" className="text-dnd" onClick={() => void revokeRouteLink(link.id).then(refresh).catch((err: Error) => toast(err.message, "error"))}>Revoke</button>
                  </div>
                ))}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
