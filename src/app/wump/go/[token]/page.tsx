"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useApp } from "@/store/app";
import { getDeviceLocation } from "@/lib/location";
import { etaMinutes, metersBetween } from "@/lib/syncMath";
import { headingState, joinHeading, pingHeading, subscribeHeading, type HeadingState } from "@/lib/wumpLive";
import PinMap from "@/components/maps/PinMap";

export default function HeadingPage() {
  const params = useParams<{ token: string }>();
  const [state, setState] = useState<HeadingState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stop = () => {};
    void supabase.auth.getSession().then(async ({ data }) => {
      const id = data.session?.user.id;
      if (!id) {
        setError("Sign in to join this heading.");
        return;
      }
      useApp.setState({ userId: id });
      try {
        const joined = await joinHeading(params.token || "");
        if (!joined.ok || !joined.id) {
          setError("This session is closed.");
          return;
        }
        const full = await headingState(joined.id);
        setState(full);
        stop = subscribeHeading(joined.id, () => {
          void headingState(joined.id!).then(setState);
        });
        const loc = await getDeviceLocation({ highAccuracy: true }).catch(() => null);
        if (loc && full.dest_lat != null && full.dest_lng != null) {
          const eta = etaMinutes(metersBetween(loc.lat, loc.lng, full.dest_lat, full.dest_lng), loc.speed);
          await pingHeading(joined.id, loc.lat, loc.lng, loc.accuracy, eta);
          setState(await headingState(joined.id));
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't join");
      }
    });
    return () => stop();
  }, [params.token]);

  const pins = [
    ...(state?.dest_lat != null && state.dest_lng != null ? [{ id: "dest", lat: state.dest_lat, lng: state.dest_lng, label: state.dest_name || "Destination" }] : []),
    ...((state?.members ?? []).filter((m) => m.lat != null && m.lng != null).map((m) => ({
      id: m.user_id,
      lat: m.lat as number,
      lng: m.lng as number,
      label: `${m.display_name || m.username || "Someone"}${m.eta_min != null ? ` · ${m.eta_min} min` : ""}`,
      accuracy: m.accuracy_m,
    }))),
  ];

  return (
    <div className="h-full overflow-y-auto bg-[#070709] px-5 py-8 text-[#f4f1ea]">
      <Link href="/wump" className="text-sm text-[#8d8880]">Wump</Link>
      <h1 className="mt-4 font-serif text-4xl">{state?.title || "Heading there"}</h1>
      <p className="mt-2 text-sm text-[#a39e96]">Everyone in this small group shares a pin and a simple ETA until the session ends.</p>
      {error && <p className="mt-4 text-[#e07a5f]">{error}</p>}
      <div className="mt-4"><PinMap pins={pins} /></div>
      <ul className="mt-4 space-y-1 text-sm">
        {(state?.members ?? []).map((member) => (
          <li key={member.user_id}>{member.display_name || member.username || "Someone"}{member.eta_min != null ? ` · about ${member.eta_min} min` : ""}</li>
        ))}
      </ul>
    </div>
  );
}
