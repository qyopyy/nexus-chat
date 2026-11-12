"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useApp, toast } from "@/store/app";
import { isPhoneDevice, platformLabel, thisDeviceId, type Handset } from "@/lib/handset";
import { deviceHistory, myDevices, setDeviceFlags } from "@/lib/locator";
import { freshIso } from "@/lib/syncMath";
import { incomingDrops, openAndClaimDrop, sendDrop, type NexusDrop } from "@/lib/nexusDrop";
import {
  DEFAULT_GRANT,
  listClipboard,
  listInbox,
  listNotices,
  loadGrant,
  markNoticeSeen,
  saveClipboard,
  sendCommand,
  sendToComputers,
  setControlEnabled,
  setDeviceFocus,
  type ClipboardItem,
  type DeviceNotice,
  type HandsetGrant,
  type HandsetInbox,
  type PhoneCommandKind,
} from "@/lib/phoneLink";
import { refreshChatList, sendMessage } from "@/lib/data";
import { loadFeatureFlags, featureFlags } from "@/lib/featureFlags";
import { fmtBytes } from "@/lib/acetateAudio";
import { useAcetatePlayer } from "@/lib/acetatePlayer";

type Ping = { id: string; status: string; created_at: string } | null;

export default function PhoneLinkPanel() {
  const [rows, setRows] = useState<Handset[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [link, setLink] = useState("");
  const [clip, setClip] = useState("");
  const [reply, setReply] = useState("");
  const [chatId, setChatId] = useState<string | null>(null);
  const [inbox, setInbox] = useState<HandsetInbox[]>([]);
  const [clips, setClips] = useState<ClipboardItem[]>([]);
  const [notices, setNotices] = useState<DeviceNotice[]>([]);
  const [drops, setDrops] = useState<NexusDrop[]>([]);
  const [grant, setGrant] = useState<HandsetGrant | null>(null);
  const [lostNote, setLostNote] = useState("");
  const [focusMin, setFocusMin] = useState(60);
  const [dragging, setDragging] = useState(false);
  const [ping, setPing] = useState<Ping>(null);
  const [flagsOn, setFlagsOn] = useState(true);
  const phone = isPhoneDevice();
  const mine = thisDeviceId();
  const chats = useApp((s) => s.chatList);
  const profiles = useApp((s) => s.profiles);

  async function refresh() {
    const list = await myDevices();
    setRows(list);
    setInbox(await listInbox());
    setNotices(await listNotices());
    setDrops(await incomingDrops());
    setClips(await listClipboard());
    const next = list.find((row) => row.kind === "phone" && row.device_id !== mine)?.device_id || list.find((row) => row.device_id !== mine)?.device_id || null;
    setPicked((current) => current || next);
  }

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    void supabase.auth.getSession().then(({ data }) => {
      const id = data.session?.user.id;
      if (!id) return;
      useApp.setState({ userId: id });
      void refresh();
      void refreshChatList();
      void loadFeatureFlags().then((flags) => setFlagsOn(flags.phone_link));
      channel = supabase
        .channel(`phone-panel:${id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "nexus_handsets", filter: `user_id=eq.${id}` }, () => void refresh())
        .on("postgres_changes", { event: "*", schema: "public", table: "nexus_handset_inbox", filter: `user_id=eq.${id}` }, () => void refresh())
        .on("postgres_changes", { event: "*", schema: "public", table: "nexus_clipboard", filter: `user_id=eq.${id}` }, () => void refresh())
        .on("postgres_changes", { event: "*", schema: "public", table: "nexus_device_notices", filter: `user_id=eq.${id}` }, () => void refresh())
        .on("postgres_changes", { event: "*", schema: "public", table: "nexus_handset_commands", filter: `user_id=eq.${id}` }, () => {
          void supabase.from("nexus_handset_commands").select("id, status, kind, created_at").eq("user_id", id).eq("kind", "ping").order("created_at", { ascending: false }).limit(1).maybeSingle().then(({ data: row }) => setPing((row as Ping) ?? null));
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "nexus_drops" }, () => void refresh())
        .subscribe();
    });
    return () => {
      if (channel) void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const device = rows.find((row) => row.device_id === picked) ?? null;
  const self = rows.find((row) => row.device_id === mine);
  const rules = { ...DEFAULT_GRANT, ...grant };

  useEffect(() => {
    if (!device) return;
    void loadGrant(device.device_id).then(setGrant);
    setLostNote(device.lost_message || "");
  }, [device?.device_id, device?.lost_message]);

  function act(kind: PhoneCommandKind, payload?: Parameters<typeof sendCommand>[2]) {
    if (!device || !flagsOn) return;
    void sendCommand(device.device_id, kind, payload).then(() => toast("Sent to the phone", "success")).catch((e: Error) => toast(e.message, "error"));
  }

  async function sendFiles(files: File[]) {
    if (!rules.files) {
      toast("File sending is off for this phone", "error");
      return;
    }
    for (const file of files.slice(0, 8)) await sendDrop(file);
    toast(files.length > 1 ? "Files sent to your other screens" : "File sent to your other screens", "success");
  }

  const online = device ? freshIso(device.last_seen, 90_000) : false;
  const player = useAcetatePlayer.getState();

  return (
    <div className="h-full overflow-y-auto bg-[#070709] text-[#f4f1ea]">
      <main className="mx-auto max-w-5xl px-5 py-8 pb-24">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="text-sm text-[#8d8880]">Nexus</Link>
          <Link href="/phone/permissions" className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold">Permissions</Link>
        </div>
        <p className="mt-4 text-[11px] font-semibold tracking-[0.22em] text-[#7ee0c6] uppercase">Phone Link</p>
        <h1 className="mt-1 font-serif text-4xl">Your phone, from this computer</h1>
        <p className="mt-2 max-w-2xl text-sm text-[#a39e96]">
          Owner-only and opt-in. This is not screen mirroring, SMS, iMessage, call logs, or iCloud. The installed Nexus app can ring, open links, and take files you choose while it is open or backgrounded. Safari on iPhone updates only while the tab is open, hides the battery percentage, and cannot toggle the flashlight. Photos, screenshots, clipboard reads, and sign-out wait for a tap on the phone. Nothing is captured silently.
        </p>
        {!flagsOn && <p className="mt-3 rounded-2xl bg-[#3a2418] px-4 py-3 text-sm text-[#e4a15a]">Phone Link is turned off by an admin.</p>}
        {featureFlags().phone_link === false ? null : null}

        <div className="mt-5 grid gap-3 md:grid-cols-[280px_1fr]">
          <section className="space-y-2">
            {rows.filter((row) => row.kind === "phone" || row.device_id === mine).map((row) => {
              const live = freshIso(row.last_seen, 90_000);
              return (
                <button key={row.device_id} type="button" onClick={() => setPicked(row.device_id)} className={`w-full rounded-3xl border px-4 py-3 text-left ${picked === row.device_id ? "border-[#7ee0c6] bg-[#101614]" : "border-white/10 bg-[#121212]"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{row.label}{row.device_id === mine ? " · this device" : ""}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${live ? "bg-[#143028] text-[#7ee0c6]" : "bg-white/10 text-[#8d8880]"}`}>{live ? "Online" : "Offline"}</span>
                  </div>
                  <p className="mt-1 text-xs text-[#8d8880]">
                    {platformLabel(row.platform)}{row.model ? ` · ${row.model}` : ""}
                    {row.battery != null ? ` · ${row.battery}%${row.charging ? " charging" : ""}` : " · battery hidden"}
                    {row.control_enabled ? " · control on" : " · control off"}
                    {row.focus_until && Date.parse(row.focus_until) > Date.now() ? " · focus" : ""}
                    {row.lost ? " · lost" : ""}
                  </p>
                </button>
              );
            })}
            {rows.length === 0 && <p className="rounded-3xl bg-[#141414] px-4 py-6 text-sm text-[#8d8880]">Sign in on the Nexus app, then open Phone Link there and allow this computer.</p>}
          </section>

          <section
            className={`rounded-3xl border p-4 ${dragging ? "border-[#7ee0c6]" : "border-white/10"}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const files = [...e.dataTransfer.files];
              if (files.length) void sendFiles(files).catch((err: Error) => toast(err.message, "error"));
            }}
          >
            {phone && (
              <label className="mb-3 flex items-center justify-between gap-3 rounded-2xl bg-[#141414] px-4 py-3 text-sm">
                <span>Allow my signed-in computers to control this phone</span>
                <input type="checkbox" checked={!!self?.control_enabled} onChange={(e) => void setControlEnabled(e.target.checked).then(refresh).catch((err: Error) => toast(err.message, "error"))} />
              </label>
            )}
            {device && device.device_id !== mine && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{online ? "Connected" : "Not answering"}</p>
                    <p className="text-xs text-[#8d8880]">{online ? "Nexus is open on the phone, or the installed app is backgrounded." : `Last seen ${new Date(device.last_seen).toLocaleString()}. A closed Safari tab cannot be woken.`}</p>
                  </div>
                  <button type="button" className="rounded-full bg-[#f4f1ea] px-3 py-1.5 text-sm font-semibold text-[#070709]" onClick={() => act("ping")}>Reconnect</button>
                </div>
                {ping && <p className="text-xs text-[#8d8880]">Last check: {ping.status === "done" ? "the phone answered" : ping.status === "pending" ? "waiting for the phone" : "the phone did not answer"}.</p>}
                {!device.control_enabled && <p className="text-sm text-[#e4a15a]">Turn Phone Link on in the Nexus app on that phone. Commands wait until it is on.</p>}

                <div>
                  <p className="text-[11px] font-semibold tracking-wide text-[#8d8880] uppercase">Quick actions</p>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Quick label="Ring" onClick={() => act("ring")} disabled={!rules.find} />
                    <Quick label="Vibrate" onClick={() => act("vibrate")} disabled={!rules.find} />
                    <Quick label="Flashlight" onClick={() => act("torch")} disabled={!rules.find} />
                    <Quick label="Stop" onClick={() => act("find_stop")} disabled={!rules.find} />
                    <Quick label="Play" onClick={() => act("play")} disabled={!rules.acetate} />
                    <Quick label="Pause" onClick={() => act("pause")} disabled={!rules.acetate} />
                    <Quick label="Next" onClick={() => act("next")} disabled={!rules.acetate} />
                    <Quick label="Focus" onClick={() => device && void setDeviceFocus(device.device_id, focusMin).then(() => toast("Focus sent", "success")).catch((e: Error) => toast(e.message, "error"))} disabled={!rules.focus} />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Card title="Find">
                    <p className="text-xs text-[#8d8880]">Ring flashes the screen and plays a tone for 30 seconds. iOS Safari may ignore vibrate and the flashlight. The installed Android app can use both when Nexus is open.</p>
                    {device.share_location && device.lat != null && device.lng != null && (
                      <a className="mt-2 inline-block text-sm text-[#7ee0c6]" href={`https://maps.apple.com/?ll=${device.lat},${device.lng}`} target="_blank" rel="noreferrer">Open last shared location</a>
                    )}
                    {!device.share_location && <p className="mt-2 text-xs text-[#8d8880]">Location is off on that phone. Phone Link does not turn it on by itself.</p>}
                    <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); void setDeviceFlags(device.device_id, { lost: true, lost_message: lostNote || null }).then(() => toast("Marked lost", "success")).catch((err: Error) => toast(err.message, "error")); }}>
                      <input value={lostNote} onChange={(e) => setLostNote(e.target.value)} placeholder="Lost-phone message" className="min-w-0 flex-1 rounded-xl bg-[#141414] px-3 py-2 text-sm outline-none" />
                      <button className="rounded-full bg-white/10 px-3 text-sm">Mark lost</button>
                    </form>
                    {device.lost && <button type="button" className="mt-2 text-xs text-[#7ee0c6]" onClick={() => void setDeviceFlags(device.device_id, { lost: false }).then(refresh)}>Clear lost mode</button>}
                  </Card>
                  <Card title="Acetate on the phone">
                    <p className="text-xs text-[#8d8880]">Play, seek, sleep, and crossfade change Acetate in Nexus. They do not change the system volume. This computer's player is at {Math.round(player.volume * 100)}%.</p>
                    <div className="mt-2 flex flex-wrap gap-2 text-sm">
                      <button type="button" className="rounded-full bg-white/10 px-3 py-1" onClick={() => act("volume", { delta: -0.1 })}>Quieter</button>
                      <button type="button" className="rounded-full bg-white/10 px-3 py-1" onClick={() => act("volume", { delta: 0.1 })}>Louder</button>
                      <button type="button" className="rounded-full bg-white/10 px-3 py-1" onClick={() => act("seek", { seconds: 0 })}>Restart track</button>
                      <button type="button" className="rounded-full bg-white/10 px-3 py-1" onClick={() => act("sleep", { minutes: 20 })}>Sleep 20m</button>
                      <button type="button" className="rounded-full bg-white/10 px-3 py-1" onClick={() => act("crossfade", { ms: 4000 })}>Crossfade</button>
                    </div>
                  </Card>
                </div>

                <Card title="Clipboard">
                  <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (!rules.clipboard) return; act("clipboard", { text: clip }); setClip(""); }}>
                    <input value={clip} onChange={(e) => setClip(e.target.value)} placeholder="Text for the phone clipboard" className="min-w-0 flex-1 rounded-xl bg-[#141414] px-3 py-2 text-sm outline-none" />
                    <button className="rounded-full bg-white/10 px-3 text-sm" disabled={!rules.clipboard}>Send</button>
                  </form>
                  <button type="button" className="mt-2 text-xs text-[#7ee0c6]" disabled={!rules.clipboard} onClick={() => act("clipboard_pull")}>Ask the phone for its clipboard</button>
                  <p className="mt-1 text-[11px] text-[#8d8880]">The phone must confirm a read. iOS will not hand over the clipboard silently.</p>
                </Card>

                <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); act("note", { text: note }); setNote(""); }}>
                  <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note for the phone" className="min-w-0 flex-1 rounded-xl bg-[#141414] px-3 py-2 text-sm outline-none" />
                  <button className="rounded-full bg-white/10 px-3 text-sm">Send</button>
                </form>
                <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); act("open_url", { url: link }); setLink(""); }}>
                  <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https:// link or a Nexus page" className="min-w-0 flex-1 rounded-xl bg-[#141414] px-3 py-2 text-sm outline-none" />
                  <button className="rounded-full bg-white/10 px-3 text-sm">Open</button>
                </form>

                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <label className="text-xs text-[#8d8880]">Focus for</label>
                  <select value={focusMin} onChange={(e) => setFocusMin(Number(e.target.value))} className="rounded-full bg-[#141414] px-3 py-1 text-sm">
                    <option value={30}>30 min</option>
                    <option value={60}>1 hour</option>
                    <option value={480}>8 hours</option>
                  </select>
                  <button type="button" className="text-xs text-[#8d8880]" onClick={() => device && void setDeviceFocus(device.device_id, 0).then(() => toast("Focus cleared", "success")).catch((e: Error) => toast(e.message, "error"))}>Clear focus</button>
                </div>
                <p className="text-[11px] text-[#8d8880]">Focus silences Nexus notifications on that phone. It does not change iOS Focus or the system Do Not Disturb switch.</p>

                <div className="flex flex-wrap gap-2 text-sm">
                  <button type="button" className="rounded-full bg-white/10 px-3 py-1" onClick={() => act("camera")}>Ask for a photo</button>
                  <button type="button" className="rounded-full bg-white/10 px-3 py-1" disabled={!rules.gallery} onClick={() => act("gallery")}>Ask for gallery photos</button>
                  <button type="button" className="rounded-full bg-white/10 px-3 py-1" disabled={!rules.screenshot} onClick={() => act("screenshot")}>Ask for a screenshot</button>
                  <button type="button" className="rounded-full bg-white/10 px-3 py-1" onClick={() => act("voice")}>Ask for a voice memo</button>
                  <button type="button" className="rounded-full bg-white/10 px-3 py-1" onClick={() => { if (window.confirm("Ask this phone to sign out of Nexus?")) act("sign_out"); }}>Ask to sign out</button>
                </div>
                <p className="text-[11px] text-[#8d8880]">Screenshot means the person on the phone takes one and picks the image. Gallery means they pick photos. Neither reads the camera roll by itself. Turn screenshot and gallery on in Permissions first.</p>

                <form className="text-sm" onSubmit={(e) => {
                  e.preventDefault();
                  const input = (e.currentTarget.elements.namedItem("file") as HTMLInputElement).files;
                  if (!input?.length) return;
                  void sendFiles([...input]).catch((err: Error) => toast(err.message, "error"));
                  e.currentTarget.reset();
                }}>
                  <input name="file" type="file" multiple className="text-xs" disabled={!rules.files} />
                  <button className="ml-2 rounded-full bg-[#f4f1ea] px-3 py-1 font-semibold text-[#070709]" disabled={!rules.files}>Send files</button>
                  <p className="mt-1 text-[11px] text-[#8d8880]">Drop files anywhere on this card. Drops are limited to 100 MB and show up on your other signed-in screens.</p>
                </form>
              </div>
            )}

            {phone && (
              <div className="mt-4 space-y-3">
                <h2 className="font-serif text-2xl">From this phone</h2>
                <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void sendToComputers("clipboard", clip).then(() => setClip("")).catch((err: Error) => toast(err.message, "error")); }}>
                  <input value={clip} onChange={(e) => setClip(e.target.value)} placeholder="Send clipboard text to your computer" className="min-w-0 flex-1 rounded-xl bg-[#141414] px-3 py-2 text-sm outline-none" />
                  <button className="rounded-full bg-white/10 px-3 text-sm">Send</button>
                </form>
                <form className="space-y-2 text-sm" onSubmit={(e) => {
                  e.preventDefault();
                  const text = (e.currentTarget.elements.namedItem("share") as HTMLInputElement).value;
                  const file = (e.currentTarget.elements.namedItem("file") as HTMLInputElement).files?.[0];
                  const task = async () => {
                    if (text.trim()) await sendToComputers("share", text);
                    if (file) await sendDrop(file);
                  };
                  void task().then(() => { toast("Sent to your computer", "success"); e.currentTarget.reset(); }).catch((err: Error) => toast(err.message, "error"));
                }}>
                  <input name="share" placeholder="Share text or a link to your computer" className="w-full rounded-xl bg-[#141414] px-3 py-2 text-sm outline-none" />
                  <input name="file" type="file" accept="image/*,*/*" className="text-xs" />
                  <button className="rounded-full bg-[#f4f1ea] px-3 py-1 font-semibold text-[#070709]">Share to my computer</button>
                  <p className="text-[11px] text-[#8d8880]">This is the in-app share. Nexus is not an iOS share extension, so the system share sheet of other apps cannot target it. You pick the file. The camera roll is not read in the background.</p>
                </form>
              </div>
            )}
          </section>
        </div>

        <section className="mt-8 grid gap-4 lg:grid-cols-2">
          <Card title="Clipboard history">
            <ul className="space-y-2 text-sm">
              {clips.map((row) => (
                <li key={row.id} className="rounded-2xl bg-[#141414] px-3 py-2">
                  <div className="text-[10px] tracking-wide text-[#7ee0c6] uppercase">{row.direction === "to_phone" ? "To phone" : "From phone"}</div>
                  <p className="whitespace-pre-wrap">{row.body}</p>
                  <button type="button" className="text-xs text-[#8d8880]" onClick={() => void navigator.clipboard.writeText(row.body).then(() => toast("Copied", "success"))}>Copy</button>
                </li>
              ))}
              {clips.length === 0 && <p className="text-sm text-[#8d8880]">Nothing copied between your devices yet.</p>}
            </ul>
          </Card>
          <Card title="From your phone">
            <ul className="space-y-2 text-sm">
              {inbox.map((row) => (
                <li key={row.id} className="rounded-2xl bg-[#141414] px-3 py-2">
                  <div className="text-[10px] tracking-wide text-[#7ee0c6] uppercase">{row.kind}</div>
                  {row.kind === "link" ? <a href={row.body} className="break-all text-[#7ee0c6]" target="_blank" rel="noreferrer">{row.body}</a> : <p className="whitespace-pre-wrap">{row.body}</p>}
                  <button type="button" className="text-xs text-[#8d8880]" onClick={() => void navigator.clipboard.writeText(row.body).then(() => saveClipboard("to_computer", row.body))}>Copy</button>
                </li>
              ))}
              {inbox.length === 0 && <p className="text-sm text-[#8d8880]">Notes, links, and shares from the phone land here.</p>}
            </ul>
          </Card>
        </section>

        <section className="mt-4">
          <Card title="Reply to Nexus chats">
            <p className="text-xs text-[#8d8880]">These are Nexus messages, not the iOS notification shade. A reply is sent in the chat, so it shows on the phone the same way any other message does.</p>
            {!rules.chats && <p className="mt-2 text-sm text-[#e4a15a]">Chat reply is off for the selected phone.</p>}
            <ul className="mt-2 space-y-2 text-sm">
              {notices.slice(0, 8).map((row) => (
                <li key={row.id} className="rounded-2xl bg-[#141414] px-3 py-2">
                  <div className="font-semibold">{row.title}</div>
                  <p className="text-[#a39e96]">{row.body}</p>
                  {row.href?.includes("conv=") && (
                    <button type="button" className="text-xs text-[#7ee0c6]" onClick={() => { setChatId(new URL(row.href || "/", "https://nexusproject.cc").searchParams.get("conv")); void markNoticeSeen(row.id); }}>Reply to this</button>
                  )}
                </li>
              ))}
            </ul>
            <label className="mt-3 block text-xs text-[#8d8880]">Chat</label>
            <select value={chatId ?? ""} onChange={(e) => setChatId(e.target.value || null)} className="mt-1 w-full rounded-xl bg-[#141414] px-3 py-2 text-sm">
              <option value="">Pick a chat</option>
              {chats.map((chat) => (
                <option key={chat.id} value={chat.id}>{chat.name || profiles[chat.other_user_id || ""]?.display_name || "Chat"}</option>
              ))}
            </select>
            <form className="mt-2 flex gap-2" onSubmit={(e) => {
              e.preventDefault();
              if (!chatId || !reply.trim() || !rules.chats) return;
              void sendMessage(chatId, reply.trim());
              setReply("");
              toast("Reply sent in Nexus", "success");
            }}>
              <input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply" className="min-w-0 flex-1 rounded-xl bg-[#141414] px-3 py-2 text-sm outline-none" />
              <button className="rounded-full bg-[#f4f1ea] px-3 text-sm font-semibold text-[#070709]">Send</button>
            </form>
          </Card>
        </section>

        <section className="mt-4">
          <Card title="Files waiting">
            <ul className="space-y-1 text-sm">
              {drops.map((drop) => (
                <li key={drop.id}>
                  <button type="button" className="text-[#7ee0c6]" onClick={() => void openAndClaimDrop(drop).then(refresh).catch((error: Error) => toast(error.message, "error"))}>
                    {drop.name} · {fmtBytes(drop.bytes)}
                  </button>
                </li>
              ))}
              {drops.length === 0 && <p className="text-sm text-[#8d8880]">No unopened drops.</p>}
            </ul>
          </Card>
        </section>
        <p className="mt-6 text-sm"><Link href="/locator" className="text-[#7ee0c6]">Open Locator</Link></p>
        <HistoryHint deviceId={device && device.device_id !== mine ? device.device_id : null} />
      </main>
    </div>
  );
}

function Quick({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className="rounded-2xl bg-[#f4f1ea] px-3 py-3 text-sm font-semibold text-[#070709] disabled:opacity-40">{label}</button>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-white/10 p-4">
      <h2 className="font-serif text-2xl">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function HistoryHint({ deviceId }: { deviceId: string | null }) {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    if (!deviceId) return;
    void deviceHistory(deviceId).then((rows) => setN(rows.length));
  }, [deviceId]);
  if (!deviceId || n == null) return null;
  return <p className="mt-2 text-xs text-[#8d8880]">Locator has {n} saved points for this phone. Phone Link does not add points on its own.</p>;
}
