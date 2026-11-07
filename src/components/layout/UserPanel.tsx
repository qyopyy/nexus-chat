"use client";

import { useEffect, useRef, useState } from "react";
import { Crown, Headphones, HeadphoneOff, Link2, LogOut, Mic, MicOff, MonitorOff, MonitorUp, PhoneOff, Settings, Signal, UserPen, Video, VideoOff, Volume2, VolumeX } from "lucide-react";
import { useApp, openModal, conversationTitle, findChannel } from "@/store/app";
import { useCall, canScreenShare, leaveCall, toggleDeafen, toggleMute, toggleScreen, toggleVideo } from "@/lib/call";
import { openConversation } from "@/lib/data";
import { can, openStaffDesk } from "@/lib/privileges";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { setPref, usePrefs } from "@/lib/prefs";
import Avatar, { statusLabel } from "@/components/ui/Avatar";
import NameTag from "@/components/ui/NameTag";
import { NexusCredit, copyNexusAppLink } from "@/components/ui/NexusCredit";
import MenuMusic from "./MenuMusic";
import type { UserStatus } from "@/lib/types";

export default function UserPanel() {
  return (
    <div className="bg-panel">
      <VoicePanel />
      <MeRow />
    </div>
  );
}

function VoicePanel() {
  const status = useCall((s) => s.status);
  const convId = useCall((s) => s.conversationId);
  const video = useCall((s) => !!s.localCam);
  const screen = useCall((s) => !!s.localScreen);
  const connections = useCall((s) => s.participants);
  const title = useApp((s) => conversationTitle(s, convId));
  const channel = useApp((s) => findChannel(s, convId));
  const spaceName = useApp((s) => (channel?.space_id ? s.spaces.find((x) => x.id === channel.space_id)?.name : null));
  const [screenOk, setScreenOk] = useState(true);
  useEffect(() => setScreenOk(canScreenShare()), []);

  if (status === "idle" || !convId) return null;

  const failing = Object.values(connections).some((p) => p.connection === "failed" || p.connection === "disconnected");
  const label = status === "connecting" ? "Connecting…" : failing ? "Reconnecting…" : "Voice Connected";
  const color = status === "connecting" || failing ? "text-idle" : "text-ok";

  return (
    <div className="border-b border-line/60 px-2 pt-2 pb-2">
      <div className="flex items-center gap-2 px-1">
        <Signal className={cn("size-4", color)} />
        <div className="min-w-0 flex-1">
          <div className={cn("text-sm font-semibold", color)}>{label}</div>
          <button
            onClick={() => openConversation(convId, channel?.space_id ?? null)}
            className="block max-w-full truncate text-xs text-sub hover:underline"
          >
            {channel ? `${channel.name} / ${spaceName ?? ""}` : title || "Call"}
          </button>
        </div>
        <button onClick={() => void leaveCall()} className="rounded p-1.5 text-txt hover:bg-hover" title="Disconnect">
          <PhoneOff className="size-5" />
        </button>
      </div>
      <div className={cn("mt-2 grid gap-2", screenOk ? "grid-cols-2" : "grid-cols-1")}>
        <button
          onClick={() => void toggleVideo()}
          className={cn("flex items-center justify-center gap-2 rounded-md py-1.5 text-sm transition", video ? "bg-ok text-white" : "bg-side hover:bg-hover")}
        >
          {video ? <Video className="size-4" /> : <VideoOff className="size-4" />} Video
        </button>
        <button
          hidden={!screenOk}
          onClick={() => void toggleScreen()}
          className={cn("flex items-center justify-center gap-2 rounded-md py-1.5 text-sm transition", screen ? "bg-ok text-white" : "bg-side hover:bg-hover")}
        >
          {screen ? <MonitorOff className="size-4" /> : <MonitorUp className="size-4" />} Screen
        </button>
      </div>
    </div>
  );
}

const STATUSES: { id: UserStatus; label: string; dot: string; hint?: string }[] = [
  { id: "online", label: "Online", dot: "bg-ok" },
  { id: "idle", label: "Idle", dot: "bg-idle" },
  { id: "dnd", label: "Do Not Disturb", dot: "bg-dnd", hint: "Mutes notifications and incoming calls" },
  { id: "invisible", label: "Invisible", dot: "bg-faint", hint: "You'll appear offline" },
];

function MeRow() {
  const me = useApp((s) => (s.userId ? s.profiles[s.userId] : undefined));
  const myStatus = useApp((s) => s.myStatus);
  const muted = useCall((s) => s.muted);
  const deafened = useCall((s) => s.deafened);
  const speaking = useCall((s) => s.speaking);
  const buttonFx = usePrefs((s) => s.buttonFx !== false);
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setMenu(false);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [menu]);

  const dotClass = STATUSES.find((s) => s.id === myStatus)?.dot ?? "bg-ok";

  return (
    <div ref={ref} className="relative flex h-[60px] items-center gap-1 px-2">
      {menu && (
        <div className="absolute bottom-[64px] left-2 z-40 w-64 animate-pop overflow-hidden rounded-xl bg-menu shadow-2xl">
          <div className="h-14" style={{ background: me?.avatar_color }} />
          <div className="-mt-8 px-4">
            <Avatar userId={me?.id} size={64} className="rounded-full ring-[6px] ring-menu" />
            <div className="mt-2 text-lg font-bold">{me && <NameTag userId={me.id} badgeSize="md" />}</div>
            <div className="text-sm text-sub">@{me?.username}</div>
            {me?.custom_status && <div className="mt-1 text-sm">{me.custom_status}</div>}
          </div>
          <div className="m-3 rounded-lg bg-side p-1.5 text-sm">
            {STATUSES.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  useApp.setState({ myStatus: s.id });
                  setMenu(false);
                }}
                className="flex w-full items-start gap-3 rounded px-2 py-1.5 text-left hover:bg-accent hover:text-white"
              >
                <span className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", s.dot)} />
                <span>
                  <span className="block">{s.label}</span>
                  {s.hint && <span className="block text-xs opacity-70">{s.hint}</span>}
                </span>
              </button>
            ))}
            <div className="my-1 h-px bg-line" />
            <button
              onClick={() => {
                setMenu(false);
                openModal("settings", "account");
              }}
              className="flex w-full items-center gap-3 rounded px-2 py-1.5 hover:bg-accent hover:text-white"
            >
              <UserPen className="size-4" /> Edit Profile
            </button>
            {can.staffDesk() && (
              <button
                onClick={() => {
                  setMenu(false);
                  openStaffDesk();
                }}
                className="flex w-full items-center gap-3 rounded px-2 py-1.5 hover:bg-accent hover:text-white"
              >
                <Crown className="size-4 text-[#eb459e]" /> Staff Desk
              </button>
            )}
            <button
              onClick={() => {
                setMenu(false);
                void copyNexusAppLink();
              }}
              className="flex w-full items-center gap-3 rounded px-2 py-1.5 hover:bg-accent hover:text-white"
            >
              <Link2 className="size-4" /> Share Nexus app link
            </button>
            <button
              onClick={() => setPref("buttonFx", !buttonFx)}
              className="flex w-full items-center gap-3 rounded px-2 py-1.5 hover:bg-accent hover:text-white"
            >
              {buttonFx ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
              Button FX {buttonFx ? "on" : "off"}
            </button>
            <MenuMusic />
            <button
              onClick={async () => {
                await leaveCall();
                await supabase.auth.signOut();
              }}
              className="flex w-full items-center gap-3 rounded px-2 py-1.5 text-dnd hover:bg-dnd hover:text-white"
            >
              <LogOut className="size-4" /> Log Out
            </button>
            <NexusCredit compact className="px-2 py-2 text-[11px]" />
          </div>
        </div>
      )}

      <button onClick={() => setMenu((v) => !v)} className="flex min-w-0 flex-1 items-center gap-2 rounded-md py-1 pr-2 pl-0.5 text-left hover:bg-hover">
        <div className="relative">
          <Avatar userId={me?.id} size={34} speaking={speaking} />
          <span className={cn("absolute right-0 bottom-0 size-3 rounded-full ring-[3px] ring-panel", dotClass)} />
        </div>
        <div className="min-w-0 leading-tight">
          <div className="truncate text-sm font-semibold">{me && <NameTag userId={me.id} />}</div>
          <div className="truncate text-xs text-sub">{me?.custom_status || statusLabel(myStatus === "invisible" ? "offline" : myStatus)}</div>
        </div>
      </button>
      <IconBtn label={muted ? "Unmute" : "Mute"} active={muted || deafened} onClick={toggleMute}>
        {muted || deafened ? <MicOff className="size-5" /> : <Mic className="size-5" />}
      </IconBtn>
      <IconBtn label={deafened ? "Undeafen" : "Deafen"} active={deafened} onClick={toggleDeafen}>
        {deafened ? <HeadphoneOff className="size-5" /> : <Headphones className="size-5" />}
      </IconBtn>
      <IconBtn label="User Settings" onClick={() => openModal("settings")}>
        <Settings className="size-5" />
      </IconBtn>
    </div>
  );
}

function IconBtn({ children, label, onClick, active }: { children: React.ReactNode; label: string; onClick: () => void; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn("grid size-8 shrink-0 place-items-center rounded-md transition hover:bg-hover", active ? "text-dnd" : "text-sub hover:text-txt")}
    >
      {children}
    </button>
  );
}
