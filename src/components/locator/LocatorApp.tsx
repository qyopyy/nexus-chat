"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useApp, toast } from "@/store/app";
import { thisDeviceId, platformLabel, type Handset } from "@/lib/handset";
import {
  clearDeviceHistory,
  deviceHistory,
  locatorAlerts,
  locatorOptIn,
  myDevices,
  renameDevice,
  setDeviceFlags,
  setLocatorOptIn,
  setPlaceAlerts,
  startDeviceShare,
  subscribeDevices,
} from "@/lib/locator";
import { freshIso } from "@/lib/syncMath";
import PinMap from "@/components/maps/PinMap";

export default function LocatorApp() {
  const [rows, setRows] = useState<Handset[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [history, setHistory] = useState<{ id: number; lat: number; lng: number; recorded_at: string }[]>([]);
  const [alerts, setAlerts] = useState<{ id: number; place_name: string; kind: string; created_at: string }[]>([]);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("This phone is lost. Please call me.");
  const [optIn, setOptIn] = useState(false);
  const mine = thisDeviceId();

  async function refresh() {
    const list = await myDevices();
    setRows(list);
    setAlerts(await locatorAlerts());
    const id = picked || list[0]?.device_id || null;
    setPicked(id);
    if (id) setHistory(await deviceHistory(id));
  }

  useEffect(() => {
    setOptIn(locatorOptIn());
    let stop = () => {};
    void supabase.auth.getSession().then(({ data }) => {
      const id = data.session?.user.id;
      if (!id) return;
      useApp.setState({ userId: id });
      void refresh();
      stop = subscribeDevices(id, () => void refresh());
    });
    return () => stop();
    // refresh reads the latest picked device
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const device = rows.find((row) => row.device_id === picked) ?? null;
  const pins = rows
    .filter((row) => row.share_location && row.lat != null && row.lng != null)
    .map((row) => ({ id: row.device_id, lat: row.lat as number, lng: row.lng as number, label: row.label, accuracy: row.accuracy_m }));

  return (
    <div className="h-full overflow-y-auto bg-[#070709] text-[#f4f1ea]">
      <main className="mx-auto max-w-3xl px-5 py-8 pb-24">
        <Link href="/" className="text-sm text-[#8d8880]">Nexus</Link>
        <p className="mt-4 text-[11px] font-semibold tracking-[0.22em] text-[#7ee0c6] uppercase">Locator</p>
        <h1 className="mt-1 font-serif text-4xl">Your Nexus devices</h1>
        <p className="mt-2 max-w-xl text-sm text-[#a39e96]">
          This is not Apple Find My and it does not use iCloud. Nexus can only see a device where the Nexus app or this signed-in site is open, and only after you turn location on for that device. The installed iPhone or Android app is the accurate one, and it can keep updating in the background when the system location permission allows it. Safari and desktop browsers update only while the tab is open.
        </p>
        <label className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-[#141414] px-4 py-3 text-sm">
          <span>Share this device&apos;s location with my account</span>
          <input
            type="checkbox"
            checked={optIn}
            onChange={(e) => {
              void setLocatorOptIn(e.target.checked).then(() => {
                setOptIn(e.target.checked);
                return refresh();
              }).catch((err: Error) => toast(err.message, "error"));
            }}
          />
        </label>
        <label className="mt-2 flex items-center justify-between gap-3 rounded-2xl bg-[#141414] px-4 py-3 text-sm">
          <span>Tell me when this device arrives at or leaves a saved Wump place</span>
          <input
            type="checkbox"
            checked={!!rows.find((row) => row.device_id === mine)?.place_alerts}
            onChange={(e) => void setPlaceAlerts(e.target.checked).then(refresh)}
          />
        </label>
        <div className="mt-4">
          <PinMap pins={pins} />
        </div>
        <ul className="mt-4 space-y-2">
          {rows.map((row) => (
            <li key={row.device_id}>
              <button type="button" onClick={() => { setPicked(row.device_id); void deviceHistory(row.device_id).then(setHistory); }} className={`w-full rounded-2xl border px-3 py-3 text-left ${picked === row.device_id ? "border-[#7ee0c6]" : "border-white/10"}`}>
                <div className="font-semibold">{row.label}{row.device_id === mine ? " · this device" : ""}</div>
                <div className="text-xs text-[#8d8880]">
                  {platformLabel(row.platform)}{row.model ? ` · ${row.model}` : ""}{row.os_name ? ` · ${row.os_name}` : ""}
                  {" · "}{freshIso(row.last_seen, 90_000) ? "Online" : `Last seen ${new Date(row.last_seen).toLocaleString()}`}
                  {row.battery != null ? ` · ${row.battery}%${row.charging ? " charging" : ""}` : ""}
                  {row.share_location && row.accuracy_m != null ? ` · ±${Math.round(row.accuracy_m)} m` : row.share_location ? "" : " · location off"}
                  {row.lost ? " · lost" : ""}{row.trusted ? " · trusted" : ""}
                </div>
              </button>
            </li>
          ))}
        </ul>
        {device && (
          <div className="mt-4 space-y-2 rounded-3xl border border-white/10 p-3">
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void renameDevice(device.device_id, name || device.label).then(refresh);
              }}
            >
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder={device.label} className="min-w-0 flex-1 rounded-xl bg-[#141414] px-3 py-2 text-sm outline-none" />
              <button type="submit" className="rounded-full border border-white/15 px-3 text-sm">Rename</button>
            </form>
            <div className="flex flex-wrap gap-2 text-sm">
              <button type="button" className="rounded-full bg-white/10 px-3 py-1" onClick={() => void setDeviceFlags(device.device_id, { trusted: !device.trusted }).then(refresh)}>{device.trusted ? "Trusted" : "Mark trusted"}</button>
              <button type="button" className="rounded-full bg-white/10 px-3 py-1" onClick={() => void setDeviceFlags(device.device_id, { lost: !device.lost, lost_message: message }).then(refresh)}>{device.lost ? "Clear lost" : "Mark lost"}</button>
              <button
                type="button"
                className="rounded-full bg-white/10 px-3 py-1"
                onClick={() => {
                  void startDeviceShare(device.device_id, 60).then(async (row) => {
                    await navigator.clipboard.writeText(`${window.location.origin}/locator/s/${row.token}`);
                    toast("One-hour location link copied", "success");
                  }).catch((e: Error) => toast(e.message, "error"));
                }}
              >
                Share live location
              </button>
              <button type="button" className="rounded-full px-3 py-1 text-[#e07a5f]" onClick={() => void clearDeviceHistory(device.device_id).then(refresh)}>Clear location</button>
            </div>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={280} className="w-full rounded-xl bg-[#141414] px-3 py-2 text-sm outline-none" />
            <h2 className="font-serif text-xl">Recent points</h2>
            <ul className="space-y-1 text-xs text-[#a39e96]">
              {history.map((point) => (
                <li key={point.id}>{new Date(point.recorded_at).toLocaleString()} · {point.lat.toFixed(4)}, {point.lng.toFixed(4)}</li>
              ))}
            </ul>
          </div>
        )}
        {alerts.length > 0 && (
          <section className="mt-4">
            <h2 className="font-serif text-xl">Place alerts</h2>
            <ul className="mt-2 space-y-1 text-sm text-[#a39e96]">
              {alerts.map((alert) => (
                <li key={alert.id}>{alert.kind === "arrive" ? "Arrived at" : "Left"} {alert.place_name} · {new Date(alert.created_at).toLocaleString()}</li>
              ))}
            </ul>
          </section>
        )}
        <p className="mt-6 text-sm"><Link href="/phone" className="text-[#7ee0c6]">Open Phone Link</Link></p>
      </main>
    </div>
  );
}
