"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { openDeviceShare } from "@/lib/locator";
import PinMap from "@/components/maps/PinMap";

export default function LocatorSharePage() {
  const params = useParams<{ token: string }>();
  const [row, setRow] = useState<Awaited<ReturnType<typeof openDeviceShare>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void openDeviceShare(params.token || "")
      .then(setRow)
      .catch((e: Error) => setError(e.message));
  }, [params.token]);

  const pin = row?.ok && row.lat != null && row.lng != null
    ? [{ id: "device", lat: row.lat, lng: row.lng, label: row.label || "Device", accuracy: row.accuracy_m }]
    : [];

  return (
    <div className="h-full overflow-y-auto bg-[#070709] px-5 py-8 text-[#f4f1ea]">
      <Link href="/" className="text-sm text-[#8d8880]">Nexus</Link>
      <h1 className="mt-4 font-serif text-4xl">Shared device location</h1>
      <p className="mt-2 max-w-xl text-sm text-[#a39e96]">This link expires. It is a Nexus share, not Apple Find My.</p>
      {error && <p className="mt-4 text-[#e07a5f]">{error}</p>}
      {row && !row.ok && <p className="mt-4">This link is closed.</p>}
      {row?.ok && (
        <>
          <p className="mt-4 text-sm">{row.label}{row.model ? ` · ${row.model}` : ""}{row.accuracy_m != null ? ` · ±${Math.round(row.accuracy_m)} m` : ""}</p>
          <div className="mt-4"><PinMap pins={pin} /></div>
        </>
      )}
    </div>
  );
}
