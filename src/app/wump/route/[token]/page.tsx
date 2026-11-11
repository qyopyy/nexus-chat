"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { openRoute, type RoutePoint } from "@/lib/wumpRoutes";
import PinMap from "@/components/maps/PinMap";

export default function WumpRoutePage() {
  const params = useParams<{ token: string }>();
  const [row, setRow] = useState<{ ok: boolean; title?: string; points: RoutePoint[]; expires_at?: string } | null>(null);

  useEffect(() => {
    void openRoute(params.token || "").then(setRow).catch(() => setRow({ ok: false, points: [] }));
  }, [params.token]);

  const points = row?.ok ? row.points : [];
  const pins = points.length
    ? [
        { id: "start", lat: points[0].lat, lng: points[0].lng, label: "Start" },
        { id: "end", lat: points[points.length - 1].lat, lng: points[points.length - 1].lng, label: "End" },
      ]
    : [];

  return (
    <div className="h-full overflow-y-auto bg-[#070709] px-5 py-8 text-[#f4f1ea]">
      <Link href="/wump" className="text-sm text-[#8d8880]">Wump</Link>
      <h1 className="mt-4 font-serif text-4xl">{row?.ok ? row.title || "Saved path" : "Saved path"}</h1>
      <p className="mt-2 text-sm text-[#a39e96]">
        {row?.ok
          ? `A temporary path. The link stops working ${row.expires_at ? new Date(row.expires_at).toLocaleString() : "when it expires"}, or sooner if the owner revokes it.`
          : "This link has expired or was revoked."}
      </p>
      <div className="mt-4">
        <PinMap pins={pins} path={points} />
      </div>
    </div>
  );
}
