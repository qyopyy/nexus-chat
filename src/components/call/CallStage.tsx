"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronUp,
  Headphones,
  HeadphoneOff,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  MonitorOff,
  MonitorUp,
  PhoneOff,
  Settings,
  Video,
  VideoOff,
  X,
} from "lucide-react";
import { useApp, openModal } from "@/store/app";
import {
  useCall,
  clearCallError,
  leaveCall,
  setFocused,
  toggleDeafen,
  toggleMute,
  toggleScreen,
  toggleVideo,
  updateSettings,
  canScreenShare,
  type ScreenQuality,
} from "@/lib/call";
import { cn } from "@/lib/utils";
import Avatar from "@/components/ui/Avatar";
import VideoTile, { type Tile } from "./VideoTile";
import { SoundboardButton, SoundToast } from "./Soundboard";
import { ReactButton, ReactionsOverlay } from "./Reactions";
import AvatarButton from "@/components/vavatar/AvatarButton";

export default function CallStage({
  conversationId,
  expanded,
  onToggleExpand,
}: {
  conversationId: string;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const me = useApp((s) => s.userId)!;
  const participants = useCall((s) => s.participants);
  const localCam = useCall((s) => s.localCam);
  const localScreen = useCall((s) => s.localScreen);
  const speaking = useCall((s) => s.speaking);
  const muted = useCall((s) => s.muted);
  const deafened = useCall((s) => s.deafened);
  const focused = useCall((s) => s.focused);
  const status = useCall((s) => s.status);
  const error = useCall((s) => s.error);
  const ringing = useCall((s) => s.outgoingRing === conversationId);
  const members = useApp((s) => s.convMembers[conversationId]);
  const dmPartner = useApp((s) => s.chatList.find((c) => c.id === conversationId)?.other_user_id ?? null);

  const tiles: Tile[] = useMemo(() => {
    const list: Tile[] = [
      { key: `${me}:cam`, userId: me, kind: "cam", stream: localCam, isMe: true, speaking, muted, deafened },
    ];
    if (localScreen) list.push({ key: `${me}:screen`, userId: me, kind: "screen", stream: localScreen, isMe: true, speaking: false, muted, deafened });
    for (const p of Object.values(participants)) {
      list.push({
        key: `${p.id}:cam`,
        userId: p.id,
        kind: "cam",
        stream: p.video ? p.camStream : null,
        isMe: false,
        speaking: p.speaking,
        muted: p.muted,
        deafened: p.deafened,
        connecting: p.connection === "new" || p.connection === "connecting",
      });
      if (p.screen && p.screenStream)
        list.push({ key: `${p.id}:screen`, userId: p.id, kind: "screen", stream: p.screenStream, isMe: false, speaking: false, muted: p.muted, deafened: p.deafened });
    }
    return list;
  }, [me, localCam, localScreen, speaking, muted, deafened, participants]);

  // auto-focus a new remote screenshare (Discord does this)
  const seenScreens = useRef(new Set<string>());
  useEffect(() => {
    for (const t of tiles) {
      if (t.kind === "screen" && !t.isMe && !seenScreens.current.has(t.key)) {
        seenScreens.current.add(t.key);
        if (!useCall.getState().focused) setFocused(t.key);
      }
    }
  }, [tiles]);

  const focusedTile = tiles.find((t) => t.key === focused);
  const others = focusedTile ? tiles.filter((t) => t !== focusedTile) : tiles;
  const n = tiles.length;
  const cols = n === 1 ? 1 : n <= 4 ? 2 : n <= 9 ? 3 : 4;
  const alone = Object.keys(participants).length === 0;
  const waitingFor = members ? members.filter((id) => id !== me) : dmPartner ? [dmPartner] : [];

  return (
    <section className={cn("relative flex shrink-0 flex-col bg-black", expanded ? "min-h-0 flex-1" : "h-[46vh] min-h-[280px]")}>
      <SoundToast />
      <ReactionsOverlay />
      {/* top bar */}
      <div className="flex items-center gap-2 px-4 pt-3 text-sm text-white/80">
        <span className={cn("size-2 rounded-full", status === "connected" ? "bg-ok" : "bg-idle")} />
        <CallTimer />
        <span className="text-white/50">· {Object.keys(participants).length + 1} in call</span>
        <button onClick={onToggleExpand} className="ml-auto rounded-md p-1.5 text-white/70 hover:bg-white/10 hover:text-white" title={expanded ? "Collapse" : "Expand"}>
          {expanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
        </button>
      </div>

      {error && (
        <div className="mx-4 mt-2 flex items-center gap-2 rounded-md bg-dnd/20 px-3 py-1.5 text-sm text-white">
          {error}
          <button onClick={clearCallError} className="ml-auto" aria-label="Dismiss">
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* tiles */}
      <div className="min-h-0 flex-1 p-3">
        {alone && ringing && !localCam ? (
          <div className="flex h-full flex-col items-center justify-center gap-4">
            <div className="flex -space-x-4">
              {waitingFor.slice(0, 3).map((id) => (
                <div key={id} className="animate-ring rounded-full">
                  <Avatar userId={id} size={88} className="rounded-full ring-4 ring-black" />
                </div>
              ))}
            </div>
            <p className="text-lg text-white/80">Calling…</p>
          </div>
        ) : focusedTile ? (
          <div className="flex h-full flex-col gap-3">
            <div className="min-h-0 flex-1">
              <VideoTile tile={focusedTile} focused onClick={() => setFocused(focusedTile.key)} />
            </div>
            {others.length > 0 && (
              <div className="flex h-24 shrink-0 justify-center gap-2 overflow-x-auto sm:h-28">
                {others.map((t) => (
                  <div key={t.key} className="aspect-video h-full shrink-0">
                    <VideoTile tile={t} compact onClick={() => setFocused(t.key)} />
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="grid h-full gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridAutoRows: "minmax(0, 1fr)" }}>
            {tiles.map((t) => (
              <VideoTile key={t.key} tile={t} onClick={() => setFocused(t.key)} />
            ))}
          </div>
        )}
      </div>

      <CallControls />
    </section>
  );
}

function CallTimer() {
  const startedAt = useCall((s) => s.startedAt);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!startedAt) return null;
  const s = Math.max(0, Math.floor((now - startedAt) / 1000));
  const hh = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return <span className="font-mono tabular-nums">{hh ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`}</span>;
}

const QUALITIES: { id: ScreenQuality; label: string }[] = [
  { id: "720p30", label: "720p · 30fps" },
  { id: "1080p30", label: "1080p · 30fps" },
  { id: "1080p60", label: "1080p · 60fps" },
  { id: "source", label: "Source" },
];

function CallControls() {
  const muted = useCall((s) => s.muted);
  const deafened = useCall((s) => s.deafened);
  const video = useCall((s) => !!s.localCam);
  const screen = useCall((s) => !!s.localScreen);
  const quality = useCall((s) => s.settings.screenQuality);
  const ptt = useCall((s) => s.settings.mode === "ptt");
  const pttActive = useCall((s) => s.pttActive);
  const [qMenu, setQMenu] = useState(false);
  const [screenOk, setScreenOk] = useState(true);
  useEffect(() => setScreenOk(canScreenShare()), []);

  return (
    <div className="flex shrink-0 items-center justify-center gap-2 pt-1 pb-4 sm:gap-3">
      <CtlBtn label={video ? "Turn off camera" : "Turn on camera"} on={video} onClick={() => void toggleVideo()}>
        {video ? <Video className="size-6" /> : <VideoOff className="size-6" />}
      </CtlBtn>

      <div className={cn("relative flex", !screenOk && "hidden")}>
        <CtlBtn label={screen ? "Stop streaming" : "Share your screen"} on={screen} onClick={() => void toggleScreen()} className="rounded-r-none pr-2">
          {screen ? <MonitorOff className="size-6" /> : <MonitorUp className="size-6" />}
        </CtlBtn>
        <button
          onClick={() => setQMenu((v) => !v)}
          className={cn("grid w-6 place-items-center rounded-r-full transition", screen ? "bg-ok text-white" : "bg-[#2b2d31] text-white hover:bg-[#3a3c42]")}
          title="Stream quality"
        >
          <ChevronUp className="size-4" />
        </button>
        {qMenu && (
          <div className="absolute bottom-16 left-1/2 z-30 w-48 -translate-x-1/2 animate-pop rounded-lg bg-menu p-1.5 text-sm shadow-2xl">
            <div className="px-2 py-1 text-xs font-bold tracking-wide text-sub uppercase">Stream quality</div>
            {QUALITIES.map((q) => (
              <button
                key={q.id}
                onClick={() => {
                  void updateSettings({ screenQuality: q.id });
                  setQMenu(false);
                }}
                className={cn("flex w-full items-center justify-between rounded px-2 py-1.5 hover:bg-accent hover:text-white", quality === q.id && "text-accent")}
              >
                {q.label}
                {quality === q.id && <span>●</span>}
              </button>
            ))}
            <div className="px-2 pt-1 text-[11px] text-sub">Applies to your next share.</div>
          </div>
        )}
      </div>

      <AvatarButton />
      <SoundboardButton />
      <ReactButton />
      <CtlBtn label={muted ? "Unmute" : "Mute"} off={muted || deafened} onClick={toggleMute}>
        {muted || deafened ? <MicOff className="size-6" /> : <Mic className="size-6" />}
      </CtlBtn>
      <CtlBtn label={deafened ? "Undeafen" : "Deafen"} off={deafened} onClick={toggleDeafen}>
        {deafened ? <HeadphoneOff className="size-6" /> : <Headphones className="size-6" />}
      </CtlBtn>
      <CtlBtn label="Voice settings" onClick={() => openModal("settings", "voice")} className="hidden sm:grid">
        <Settings className="size-6" />
      </CtlBtn>
      <button
        onClick={() => void leaveCall()}
        title="Leave call"
        className="grid h-14 w-16 place-items-center rounded-full bg-dnd text-white transition hover:bg-dnd/85"
      >
        <PhoneOff className="size-6" />
      </button>
      {ptt && (
        <span className={cn("ml-2 hidden rounded-md px-2 py-1 text-xs font-semibold sm:inline", pttActive ? "bg-ok text-white" : "bg-white/10 text-white/60")}>
          PTT {pttActive ? "ON" : "idle"}
        </span>
      )}
    </div>
  );
}

function CtlBtn({
  children,
  label,
  onClick,
  on,
  off,
  className,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  on?: boolean;
  off?: boolean;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        "grid size-14 place-items-center rounded-full transition",
        on ? "bg-ok text-white hover:bg-ok/85" : off ? "bg-white text-dnd hover:bg-white/90" : "bg-[#2b2d31] text-white hover:bg-[#3a3c42]",
        className,
      )}
    >
      {children}
    </button>
  );
}
