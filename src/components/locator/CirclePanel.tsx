"use client";

import { useCallback, useEffect, useState } from "react";
import { toast, useApp } from "@/store/app";
import { supabase } from "@/lib/supabase";
import { getDeviceLocation } from "@/lib/location";
import type { Handset } from "@/lib/handset";
import {
  circleFriends,
  circlePins,
  inviteCircle,
  myCircleGrants,
  myCircleSharing,
  pingCircle,
  respondCircle,
  revokeCircle,
  setCircleSharing,
  type CircleGrant,
  type CirclePin,
} from "@/lib/circle";
import PinMap from "@/components/maps/PinMap";

export default function CirclePanel({ devices }: { devices: Handset[] }) {
  const me = useApp((s) => s.userId);
  const profiles = useApp((s) => s.profiles);
  const [sharing, setSharing] = useState(false);
  const [grants, setGrants] = useState<CircleGrant[]>([]);
  const [pins, setPins] = useState<CirclePin[]>([]);
  const [friends, setFriends] = useState<string[]>([]);
  const [viewer, setViewer] = useState("");
  const [subject, setSubject] = useState("self");
  const [hours, setHours] = useState(8);

  const refresh = useCallback(async () => {
    const [on, rows, visible, people] = await Promise.all([myCircleSharing(), myCircleGrants(), circlePins(), circleFriends()]);
    setSharing(on);
    setGrants(rows.filter((row) => !row.revoked && new Date(row.expires_at).getTime() > Date.now()));
    setPins(visible);
    setFriends(people);
  }, []);

  useEffect(() => {
    void refresh();
    const channel = supabase
      .channel("nexus-circle-grants")
      .on("postgres_changes", { event: "*", schema: "public", table: "nexus_circle_grants" }, () => void refresh())
      .subscribe();
    const timer = window.setInterval(() => void refresh(), 20_000);
    return () => {
      window.clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, [refresh]);

  useEffect(() => {
    if (!sharing) return;
    let stop = false;
    const tick = () => {
      if (stop || document.hidden) return;
      void getDeviceLocation({ highAccuracy: true })
        .then((loc) => pingCircle(loc.lat, loc.lng, loc.accuracy))
        .catch(() => undefined);
    };
    tick();
    const timer = window.setInterval(tick, 30_000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [sharing]);

  if (!me) return null;
  const name = (id: string) => profiles[id]?.display_name || profiles[id]?.username || "Friend";
  const mine = grants.filter((row) => row.owner_id === me);
  const incoming = grants.filter((row) => row.viewer_id === me && row.status === "pending");
  const located = pins.filter((pin) => pin.fresh && pin.lat != null && pin.lng != null);
  const optedDevices = devices.filter((row) => row.share_location);

  return (
    <section className="mt-8">
      <h2 className="font-serif text-2xl">Trusted circle</h2>
      <p className="mt-1 text-sm text-[#a39e96]">
        This is not Find My and it does not use iCloud. A person sees a pin only after you invite them and they accept, and only until the invite expires or either of you revokes it. A device pin also requires location sharing to be on for that device. Nothing here is public.
      </p>
      <label className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-[#141414] px-4 py-3 text-sm">
        <span>Share my personal location with people I invite</span>
        <input
          type="checkbox"
          checked={sharing}
          onChange={(event) => {
            void setCircleSharing(event.target.checked).then(() => {
              setSharing(event.target.checked);
              if (event.target.checked) {
                return getDeviceLocation({ highAccuracy: true }).then((loc) => pingCircle(loc.lat, loc.lng, loc.accuracy));
              }
            }).catch((err: Error) => toast(err.message, "error"));
          }}
        />
      </label>
      <p className="mt-1 text-xs text-[#8d8880]">The personal pin updates while this page is open. On the installed app, a device with location sharing on can keep updating in the background when the system allows it.</p>
      <form
        className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          const deviceId = subject === "self" ? null : subject;
          void inviteCircle(viewer, deviceId ? "device" : "self", deviceId, hours)
            .then(() => {
              toast("Invite sent", "success");
              return refresh();
            })
            .catch((err: Error) => toast(err.message, "error"));
        }}
      >
        <select value={viewer} onChange={(event) => setViewer(event.target.value)} className="rounded-xl bg-[#141414] px-2 py-2 text-sm">
          <option value="">Friend</option>
          {friends.map((id) => (
            <option key={id} value={id}>{name(id)}</option>
          ))}
        </select>
        <select value={subject} onChange={(event) => setSubject(event.target.value)} className="rounded-xl bg-[#141414] px-2 py-2 text-sm">
          <option value="self">My personal location</option>
          {optedDevices.map((device) => (
            <option key={device.device_id} value={device.device_id}>{device.label}</option>
          ))}
        </select>
        <select value={hours} onChange={(event) => setHours(Number(event.target.value))} className="rounded-xl bg-[#141414] px-2 py-2 text-sm">
          {[1, 4, 8, 24, 72, 168].map((n) => (
            <option key={n} value={n}>{n < 24 ? `${n}h` : `${n / 24}d`}</option>
          ))}
        </select>
        <button type="submit" disabled={!viewer} className="rounded-full bg-[#7ee0c6] px-3 py-2 text-sm font-bold text-[#06241c] disabled:opacity-40">Invite</button>
      </form>
      {incoming.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm">
          {incoming.map((row) => (
            <li key={row.id} className="flex items-center gap-2">
              <span className="min-w-0 flex-1">{name(row.owner_id)} invited you to see their {row.subject === "self" ? "location" : "device"}</span>
              <button type="button" className="text-[#7ee0c6]" onClick={() => void respondCircle(row.id, true).then(refresh).catch((err: Error) => toast(err.message, "error"))}>Accept</button>
              <button type="button" className="text-[#8d8880]" onClick={() => void respondCircle(row.id, false).then(refresh).catch((err: Error) => toast(err.message, "error"))}>Decline</button>
            </li>
          ))}
        </ul>
      )}
      <ul className="mt-3 space-y-1 text-xs text-[#a39e96]">
        {mine.map((row) => (
          <li key={row.id} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate">{name(row.viewer_id)} · {row.subject === "self" ? "personal" : "device"} · {row.status} · until {new Date(row.expires_at).toLocaleString()}</span>
            <button type="button" className="text-[#d4653a]" onClick={() => void revokeCircle(row.id).then(refresh).catch((err: Error) => toast(err.message, "error"))}>Revoke</button>
          </li>
        ))}
      </ul>
      <div className="mt-4">
        <PinMap
          pins={located.map((pin) => ({
            id: pin.grant_id,
            lat: pin.lat as number,
            lng: pin.lng as number,
            label: pin.subject === "device" ? `${pin.name} · ${pin.label || "device"}` : pin.name,
            accuracy: pin.accuracy_m,
          }))}
        />
        {pins.some((pin) => !pin.fresh) && <p className="mt-2 text-xs text-[#8d8880]">A shared pin older than 20 minutes is hidden until it updates. You are not seeing a stale location as if it were live.</p>}
      </div>
    </section>
  );
}
