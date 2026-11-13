"use client";

import { useEffect, useRef, useState } from "react";
import { BatteryCharging, BatteryMedium, MonitorSmartphone } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useApp, toast } from "@/store/app";
import {
  clearHandsetLink,
  forgetHandset,
  isPhoneDevice,
  pingOtherComputers,
  sendHandsetLink,
  sendHandsetNote,
  thisDeviceId,
  type Handset,
} from "@/lib/handset";
import { incomingDrops, openAndClaimDrop, sendDrop, type NexusDrop } from "@/lib/nexusDrop";

function fresh(row: Handset) {
  return Date.now() - new Date(row.last_seen).getTime() < 3 * 60_000;
}

function mins(sec: number | null) {
  if (sec == null) return null;
  const m = Math.round(sec / 60);
  if (m < 1) return "full soon";
  return `${m} min to full`;
}

/** Your other signed-in browsers. A phone reports battery only for this account. */
export default function PhoneLink() {
  const userId = useApp((s) => s.userId);
  const [rows, setRows] = useState<Handset[]>([]);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [link, setLink] = useState("");
  const [drops, setDrops] = useState<NexusDrop[]>([]);
  const [dropUser, setDropUser] = useState("");
  const mine = thisDeviceId();
  const seenPing = useRef<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let live = true;
    const load = async () => {
      const { data } = await supabase.from("nexus_handsets").select("*").eq("user_id", userId).order("last_seen", { ascending: false });
      if (live) setRows((data ?? []) as Handset[]);
    };
    void load();
    void incomingDrops().then(setDrops);
    const channel = supabase
      .channel(`handset:${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "nexus_handsets", filter: `user_id=eq.${userId}` }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "nexus_drops", filter: `to_user=eq.${userId}` }, () => void incomingDrops().then(setDrops))
      .subscribe();
    return () => {
      live = false;
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  useEffect(() => {
    const hit = rows.find((row) => row.device_id === mine && row.ping_at && Date.now() - new Date(row.ping_at).getTime() < 15000);
    if (!hit?.ping_at || hit.ping_at === seenPing.current || isPhoneDevice()) return;
    seenPing.current = hit.ping_at;
    const prev = document.title;
    document.title = "● Nexus";
    toast("Your phone is looking for this browser", "info");
    const t = window.setTimeout(() => {
      document.title = prev;
    }, 4000);
    return () => window.clearTimeout(t);
  }, [rows, mine]);

  const phones = rows.filter((row) => row.kind === "phone" && row.device_id !== mine);
  const livePhone = phones.find(fresh) ?? phones[0];
  if (!userId) return null;
  const ago = livePhone ? Math.max(0, Math.round((Date.now() - new Date(livePhone.last_seen).getTime()) / 1000)) : 0;
  const until = livePhone ? mins(livePhone.full_in_sec) : null;
  if (!livePhone && drops.length === 0 && !open) {
    return (
      <div className="border-t border-line px-2 py-1.5">
        <a href="/phone" className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left text-xs text-sub hover:bg-hover">
          <MonitorSmartphone className="size-4" /> Phone Link
        </a>
      </div>
    );
  }

  return (
    <div className="border-t border-line px-2 py-1.5">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left hover:bg-hover">
        {livePhone?.charging ? <BatteryCharging className="size-4 text-ok" /> : <BatteryMedium className="size-4 text-sub" />}
        <span className="min-w-0 flex-1 truncate text-xs">
          {livePhone ? (
            <>
              {livePhone.label}
              {livePhone.battery == null ? " · battery hidden by this phone's browser" : ` · ${livePhone.battery}%`}
              {livePhone.charging ? " · charging" : ""}
              {livePhone.charging && until ? ` · ${until}` : ""}
            </>
          ) : (
            "Drop"
          )}
        </span>
        <MonitorSmartphone className="size-3.5 text-sub" />
      </button>
      {open && (
        <div className="mt-1 space-y-2 rounded-md bg-hover/60 p-2 text-xs">
          {livePhone && <p className="text-sub">{fresh(livePhone) ? `Seen ${ago}s ago` : "The phone tab looks asleep. Keep Nexus open on the phone."}</p>}
          {livePhone.note && <p>{livePhone.note}</p>}
          {livePhone.link_url && (
            <a href={livePhone.link_url} target="_blank" rel="noreferrer" className="block truncate text-accent" onClick={() => void clearHandsetLink()}>
              Open {livePhone.link_url}
            </a>
          )}
          {isPhoneDevice() && (
            <>
              <form
                className="flex gap-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  void sendHandsetNote(note).then(() => setNote(""));
                }}
              >
                <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={280} placeholder="Note for your PC" className="min-w-0 flex-1 rounded bg-panel px-2 py-1 outline-none" />
                <button type="submit" className="rounded bg-accent px-2 text-white">Send</button>
              </form>
              <form
                className="flex gap-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  void sendHandsetLink(link).then(() => setLink("")).catch((err: Error) => toast(err.message, "error"));
                }}
              >
                <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https:// link to open on PC" className="min-w-0 flex-1 rounded bg-panel px-2 py-1 outline-none" />
                <button type="submit" className="rounded bg-panel px-2">Open</button>
              </form>
              <button type="button" className="text-accent" onClick={() => void pingOtherComputers()}>
                Flash my PC browsers
              </button>
            </>
          )}
          {livePhone && (
            <button type="button" className="text-dnd" onClick={() => void forgetHandset(livePhone.device_id)}>
              Forget this phone
            </button>
          )}
          <form
            className="space-y-1"
            onSubmit={(e) => {
              e.preventDefault();
              const input = (e.currentTarget.elements.namedItem("drop") as HTMLInputElement).files?.[0];
              if (!input) return;
              void sendDrop(input, dropUser).then(() => incomingDrops().then(setDrops)).catch((err: Error) => toast(err.message, "error"));
              e.currentTarget.reset();
            }}
          >
            <input name="drop" type="file" className="w-full" />
            <input value={dropUser} onChange={(e) => setDropUser(e.target.value)} placeholder="Friend username, or blank for your other screens" className="w-full rounded bg-panel px-2 py-1 outline-none" />
            <button type="submit" className="rounded bg-accent px-2 py-1 text-white">Drop</button>
          </form>
        </div>
      )}
      {drops.length > 0 && (
        <ul className="mt-1 space-y-1">
          {drops.map((drop) => (
            <li key={drop.id}>
              <button
                type="button"
                className="w-full truncate rounded bg-accent/15 px-2 py-1 text-left text-xs"
                onClick={() => void openAndClaimDrop(drop).then(() => incomingDrops().then(setDrops)).catch((err: Error) => toast(err.message, "error"))}
              >
                Drop · {drop.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
