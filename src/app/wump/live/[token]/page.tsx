"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { openLiveShare } from "@/lib/wumpLive";
import PinMap from "@/components/maps/PinMap";

export default function WumpLivePage() {
  const params = useParams<{ token: string }>();
  const [row, setRow] = useState<Awaited<ReturnType<typeof openLiveShare>> | null>(null);

  useEffect(() => {
    const token = params.token || "";
    const load = () => void openLiveShare(token).then(setRow).catch(() => setRow({ ok: false }));
    load();
    const timer = window.setInterval(load, 15000);
    return () => window.clearInterval(timer);
  }, [params.token]);

  const pins = row?.ok && row.lat != null && row.lng != null
    ? [{ id: "live", lat: row.lat, lng: row.lng, label: row.name || "Live", accuracy: row.accuracy_m }]
    : [];

  return (
    <div className="h-full overflow-y-auto bg-[#070709] px-5 py-8 text-[#f4f1ea]">
      <Link href="/wump" className="text-sm text-[#8d8880]">Wump</Link>
      <h1 className="mt-4 font-serif text-4xl">{row?.ok ? row.name || "Live location" : "Live location"}</h1>
      <p className="mt-2 text-sm text-[#a39e96]">{row?.label || "A temporary Wump pin. It disappears when the link expires."}</p>
      {row && !row.ok && <p className="mt-4">This link has expired.</p>}
      <div className="mt-4"><PinMap pins={pins} /></div>
    </div>
  );
}
