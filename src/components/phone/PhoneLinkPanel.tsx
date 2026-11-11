"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useApp, toast } from "@/store/app";
import { isPhoneDevice, platformLabel, sendHandsetNote, thisDeviceId, type Handset } from "@/lib/handset";
import { myDevices } from "@/lib/locator";
import { freshIso } from "@/lib/syncMath";
import { incomingDrops, openDrop, sendDrop, type NexusDrop } from "@/lib/nexusDrop";
import { listInbox, listNotices, markNoticeSeen, sendCommand, sendToComputers, setControlEnabled, type DeviceNotice, type HandsetInbox } from "@/lib/phoneLink";
import { fmtBytes } from "@/lib/acetateAudio";

export default function PhoneLinkPanel() {
  const [rows, setRows] = useState<Handset[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [link, setLink] = useState("");
  const [clip, setClip] = useState("");
  const [inbox, setInbox] = useState<HandsetInbox[]>([]);
  const [notices, setNotices] = useState<DeviceNotice[]>([]);
  const [drops, setDrops] = useState<NexusDrop[]>([]);
  const phone = isPhoneDevice();
  const mine = thisDeviceId();

  async function refresh() {
    const list = await myDevices();
    setRows(list);
    setInbox(await listInbox());
    setNotices(await listNotices());
    setDrops(await incomingDrops());
    setPicked((current) => current || list.find((row) => row.kind === "phone" && row.device_id !== mine)?.device_id || list[0]?.device_id || null);
  }

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    void supabase.auth.getSession().then(({ data }) => {
      const id = data.session?.user.id;
      if (!id) return;
      useApp.setState({ userId: id });
      void refresh();
      channel = supabase
        .channel(`phone-panel:${id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "nexus_handsets", filter: `user_id=eq.${id}` }, () => void refresh())
        .on("postgres_changes", { event: "*", schema: "public", table: "nexus_handset_inbox", filter: `user_id=eq.${id}` }, () => void refresh())
        .on("postgres_changes", { event: "*", schema: "public", table: "nexus_device_notices", filter: `user_id=eq.${id}` }, () => void refresh())
        .on("postgres_changes", { event: "*", schema: "public", table: "nexus_drops" }, () => void refresh())
        .subscribe();
    });
    return () => {
      if (channel) void supabase.removeChannel(channel);
    };
    // refresh is stable enough for the session
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const device = rows.find((row) => row.device_id === picked) ?? null;
  const self = rows.find((row) => row.device_id === mine);

  function act(kind: Parameters<typeof sendCommand>[1], payload?: Parameters<typeof sendCommand>[2]) {
    if (!device) return;
    void sendCommand(device.device_id, kind, payload).then(() => toast("Sent to the phone", "success")).catch((e: Error) => toast(e.message, "error"));
  }

  return (
    <div className="h-full overflow-y-auto bg-[#070709] text-[#f4f1ea]">
      <main className="mx-auto max-w-3xl px-5 py-8 pb-24">
        <Link href="/" className="text-sm text-[#8d8880]">Nexus</Link>
        <p className="mt-4 text-[11px] font-semibold tracking-[0.22em] text-[#7ee0c6] uppercase">Phone Link</p>
        <h1 className="mt-1 font-serif text-4xl">Your phone, from this computer</h1>
        <p className="mt-2 max-w-xl text-sm text-[#a39e96]">
          This is not iCloud or Windows Phone Link. It cannot mirror the screen, read SMS or iMessage, or show the iOS notification shade. Ring, links, and files work while Nexus is open on the phone. The installed iOS and Android apps can keep that session in the background when you allow location or notifications. Safari on iPhone updates only while the tab is open, hides the battery percentage, and cannot toggle the flashlight. Camera, voice memos, and sign-out always ask on the phone first. Nothing is captured silently.
        </p>
        {phone && (
          <label className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-[#141414] px-4 py-3 text-sm">
            <span>Allow my signed-in computers to control this phone</span>
            <input type="checkbox" checked={!!self?.control_enabled} onChange={(e) => void setControlEnabled(e.target.checked).then(refresh).catch((err: Error) => toast(err.message, "error"))} />
          </label>
        )}
        <ul className="mt-4 space-y-2">
          {rows.filter((row) => row.kind === "phone" || row.device_id === mine).map((row) => (
            <li key={row.device_id}>
              <button type="button" onClick={() => setPicked(row.device_id)} className={`w-full rounded-2xl border px-3 py-3 text-left ${picked === row.device_id ? "border-[#7ee0c6]" : "border-white/10"}`}>
                <div className="font-semibold">{row.label}{row.device_id === mine ? " · this device" : ""}</div>
                <div className="text-xs text-[#8d8880]">
                  {platformLabel(row.platform)}{row.model ? ` · ${row.model}` : ""}{row.os_name ? ` · ${row.os_name}` : ""}
                  {" · "}{freshIso(row.last_seen, 90_000) ? "Online" : `Last seen ${new Date(row.last_seen).toLocaleString()}`}
                  {row.battery != null ? ` · ${row.battery}%${row.charging ? " charging" : ""}` : " · battery hidden"}
                  {row.storage_bytes != null ? ` · Nexus data ${fmtBytes(row.storage_bytes)}` : ""}
                  {row.share_location && row.lat != null ? ` · ${row.lat.toFixed(3)}, ${row.lng?.toFixed(3)}` : " · location off"}
                  {row.control_enabled ? " · Phone Link on" : " · Phone Link off"}
                  {row.lost ? " · lost" : ""}
                </div>
              </button>
            </li>
          ))}
        </ul>
        {device && device.device_id !== mine && (
          <section className="mt-4 space-y-3 rounded-3xl border border-white/10 p-3">
            {!device.control_enabled && <p className="text-sm text-[#e4a15a]">Turn Phone Link on in the Nexus app on that phone. Commands wait until it is on.</p>}
            <div className="flex flex-wrap gap-2 text-sm">
              <button type="button" className="rounded-full bg-[#f4f1ea] px-3 py-1 font-semibold text-[#070709]" onClick={() => act("ring")}>Ring</button>
              <button type="button" className="rounded-full bg-white/10 px-3 py-1" onClick={() => act("vibrate")}>Vibrate</button>
              <button type="button" className="rounded-full bg-white/10 px-3 py-1" onClick={() => act("torch")}>Flashlight</button>
              <button type="button" className="rounded-full bg-white/10 px-3 py-1" onClick={() => act("find_stop")}>Stop</button>
            </div>
            <div className="flex flex-wrap gap-2 text-sm">
              <button type="button" className="rounded-full bg-white/10 px-3 py-1" onClick={() => act("play")}>Play</button>
              <button type="button" className="rounded-full bg-white/10 px-3 py-1" onClick={() => act("pause")}>Pause</button>
              <button type="button" className="rounded-full bg-white/10 px-3 py-1" onClick={() => act("prev")}>Previous</button>
              <button type="button" className="rounded-full bg-white/10 px-3 py-1" onClick={() => act("next")}>Next</button>
              <button type="button" className="rounded-full bg-white/10 px-3 py-1" onClick={() => act("volume", { delta: -0.1 })}>Acetate quieter</button>
              <button type="button" className="rounded-full bg-white/10 px-3 py-1" onClick={() => act("volume", { delta: 0.1 })}>Acetate louder</button>
            </div>
            <p className="text-[11px] text-[#8d8880]">Play and volume change Acetate on the phone, not the system volume. The system volume is not available to a website.</p>
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); act("note", { text: note }); setNote(""); }}>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note for the phone" className="min-w-0 flex-1 rounded-xl bg-[#141414] px-3 py-2 text-sm outline-none" />
              <button className="rounded-full bg-white/10 px-3 text-sm">Send</button>
            </form>
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); act("open_url", { url: link }); setLink(""); }}>
              <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https:// link to open on the phone" className="min-w-0 flex-1 rounded-xl bg-[#141414] px-3 py-2 text-sm outline-none" />
              <button className="rounded-full bg-white/10 px-3 text-sm">Open</button>
            </form>
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); act("clipboard", { text: clip }); setClip(""); }}>
              <input value={clip} onChange={(e) => setClip(e.target.value)} placeholder="Clipboard text for the phone" className="min-w-0 flex-1 rounded-xl bg-[#141414] px-3 py-2 text-sm outline-none" />
              <button className="rounded-full bg-white/10 px-3 text-sm">Send</button>
            </form>
            <div className="flex flex-wrap gap-2 text-sm">
              <button type="button" className="rounded-full bg-white/10 px-3 py-1" onClick={() => act("camera")}>Ask for a photo</button>
              <button type="button" className="rounded-full bg-white/10 px-3 py-1" onClick={() => act("voice")}>Ask for a voice memo</button>
              <button type="button" className="rounded-full bg-white/10 px-3 py-1" onClick={() => act("sign_out")}>Ask the phone to sign out</button>
            </div>
            <p className="text-[11px] text-[#8d8880]">Photo, memo, and sign-out stay pending until someone on the phone taps Allow. A lost phone can still show a message without that tap.</p>
            <form
              className="text-sm"
              onSubmit={(e) => {
                e.preventDefault();
                const input = (e.currentTarget.elements.namedItem("file") as HTMLInputElement).files?.[0];
                if (!input) return;
                void sendDrop(input).then(() => toast("File sent to your other screens", "success")).catch((err: Error) => toast(err.message, "error"));
                e.currentTarget.reset();
              }}
            >
              <input name="file" type="file" className="text-xs" />
              <button className="ml-2 rounded-full bg-[#f4f1ea] px-3 py-1 font-semibold text-[#070709]">Send this file to my phone</button>
            </form>
          </section>
        )}
        {phone && (
          <form
            className="mt-4 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void sendToComputers("clipboard", clip).then(() => sendHandsetNote(clip.slice(0, 280))).then(() => setClip("")).catch((err: Error) => toast(err.message, "error"));
            }}
          >
            <input value={clip} onChange={(e) => setClip(e.target.value)} placeholder="Send clipboard text to your computer" className="min-w-0 flex-1 rounded-xl bg-[#141414] px-3 py-2 text-sm outline-none" />
            <button className="rounded-full bg-white/10 px-3 text-sm">Send</button>
          </form>
        )}
        <section className="mt-6">
          <h2 className="font-serif text-2xl">From your phone</h2>
          <ul className="mt-2 space-y-2 text-sm">
            {inbox.map((row) => (
              <li key={row.id} className="rounded-2xl bg-[#141414] px-3 py-2">
                <div className="text-[10px] tracking-wide text-[#7ee0c6] uppercase">{row.kind}</div>
                {row.kind === "link" ? <a href={row.body} className="break-all text-[#7ee0c6]" target="_blank" rel="noreferrer">{row.body}</a> : <p className="whitespace-pre-wrap">{row.body}</p>}
                <button type="button" className="text-xs text-[#8d8880]" onClick={() => void navigator.clipboard.writeText(row.body)}>Copy</button>
              </li>
            ))}
            {rows.filter((row) => row.note || row.link_url).map((row) => (
              <li key={`${row.device_id}-live`} className="rounded-2xl bg-[#141414] px-3 py-2">
                {row.note && <p>{row.note}</p>}
                {row.link_url && <a href={row.link_url} className="break-all text-[#7ee0c6]" target="_blank" rel="noreferrer">{row.link_url}</a>}
              </li>
            ))}
          </ul>
        </section>
        <section className="mt-6">
          <h2 className="font-serif text-2xl">Nexus notifications</h2>
          <p className="text-xs text-[#8d8880]">Messages Nexus already showed on your phone. Not the iOS notification shade.</p>
          <ul className="mt-2 space-y-2 text-sm">
            {notices.map((row) => (
              <li key={row.id} className="rounded-2xl bg-[#141414] px-3 py-2">
                <div className="font-semibold">{row.title}</div>
                <p className="text-[#a39e96]">{row.body}</p>
                {device && row.href && (
                  <button type="button" className="text-xs text-[#7ee0c6]" onClick={() => { void markNoticeSeen(row.id); act("open_url", { url: row.href || "/" }); }}>
                    Open on the phone
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
        <section className="mt-6">
          <h2 className="font-serif text-2xl">Files</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {drops.map((drop) => (
              <li key={drop.id}>
                <button type="button" className="text-[#7ee0c6]" onClick={() => void openDrop(drop).then((url) => window.open(url, "_blank", "noopener")).then(refresh)}>
                  {drop.name}
                </button>
              </li>
            ))}
          </ul>
        </section>
        <p className="mt-6 text-sm"><Link href="/locator" className="text-[#7ee0c6]">Open Locator</Link></p>
      </main>
    </div>
  );
}
