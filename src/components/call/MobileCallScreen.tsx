"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Headphones, HeadphoneOff, Mic, MicOff, MonitorUp, PhoneOff, Video, VideoOff } from "lucide-react";
import { useApp, conversationTitle } from "@/store/app";
import { useCall, canScreenShare, leaveCall, setFocused, toggleDeafen, toggleMute, toggleScreen, toggleVideo } from "@/lib/call";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import Avatar from "@/components/ui/Avatar";
import VideoTile, { type Tile } from "./VideoTile";

/** Full-screen phone call UI. Swipe down / chevron minimizes to the floating call bar. */
export default function MobileCallScreen({ conversationId }: { conversationId: string }) {
  const me = useApp((s) => s.userId)!;
  const title = useApp((s) => conversationTitle(s, conversationId));
  const profiles = useApp((s) => s.profiles);
  const participants = useCall((s) => s.participants);
  const localCam = useCall((s) => s.localCam);
  const localScreen = useCall((s) => s.localScreen);
  const speaking = useCall((s) => s.speaking);
  const muted = useCall((s) => s.muted);
  const deafened = useCall((s) => s.deafened);
  const focused = useCall((s) => s.focused);
  const status = useCall((s) => s.status);
  const ringing = useCall((s) => s.outgoingRing === conversationId);
  const startedAt = useCall((s) => s.startedAt);
  const members = useApp((s) => s.convMembers[conversationId]);
  const dmPartner = useApp((s) => s.chatList.find((c) => c.id === conversationId)?.other_user_id ?? null);
  const [now, setNow] = useState(() => Date.now());
  const [screenOk, setScreenOk] = useState(false);
  const [drag, setDrag] = useState<{ y0: number; dy: number } | null>(null);

  useEffect(() => {
    setScreenOk(canScreenShare());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const remote = Object.values(participants);
  const tiles: Tile[] = useMemo(() => {
    const list: Tile[] = [];
    for (const p of remote) {
      if (p.screen && p.screenStream) list.push({ key: `${p.id}:screen`, userId: p.id, kind: "screen", stream: p.screenStream, isMe: false, speaking: false, muted: p.muted, deafened: p.deafened });
      list.push({ key: `${p.id}:cam`, userId: p.id, kind: "cam", stream: p.video ? p.camStream : null, isMe: false, speaking: p.speaking, muted: p.muted, deafened: p.deafened, connecting: p.connection === "new" || p.connection === "connecting" });
    }
    if (localScreen) list.push({ key: `${me}:screen`, userId: me, kind: "screen", stream: localScreen, isMe: true, speaking: false, muted, deafened });
    return list;
  }, [remote, localScreen, me, muted, deafened]); // eslint-disable-line react-hooks/exhaustive-deps

  const anyVideo = tiles.some((t) => t.stream) || !!localCam;
  const waiting = remote.length === 0;
  const waitingFor = members ? members.filter((id) => id !== me) : dmPartner ? [dmPartner] : [];
  const secs = startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;
  const time = `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;
  const statusText = status === "connecting" ? "Connecting…" : waiting ? (ringing ? "Ringing…" : "Waiting for others…") : time;
  const minimize = () => {
    haptic.light();
    useApp.setState({ callMinimized: true });
  };
  const focusedTile = tiles.find((t) => t.key === focused) ?? tiles.find((t) => t.kind === "screen");
  const selfTile: Tile = { key: `${me}:cam`, userId: me, kind: "cam", stream: localCam, isMe: true, speaking, muted, deafened };

  // backdrop gradient from the other person's color
  const hero = waiting ? waitingFor[0] : remote[0]?.id;
  const heroColor = (hero && profiles[hero]?.avatar_color) || "#5865f2";

  return (
    <div
      className="fixed inset-0 z-[60] flex animate-sheet flex-col overflow-hidden text-white"
      style={{
        background: `radial-gradient(120% 70% at 50% 0%, ${heroColor}88, transparent 60%), radial-gradient(90% 60% at 50% 100%, #5865f244, transparent 60%), #08090c`,
        transform: drag?.dy ? `translateY(${drag.dy}px)` : undefined,
        transition: drag ? "none" : "transform .25s",
      }}
    >
      {/* header — drag down to minimize */}
      <div
        className="flex touch-none items-center gap-3 px-3 pt-safe-3 pb-2"
        onPointerDown={(e) => {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          setDrag({ y0: e.clientY, dy: 0 });
        }}
        onPointerMove={(e) => drag && setDrag({ ...drag, dy: Math.max(0, e.clientY - drag.y0) })}
        onPointerUp={() => {
          if (drag && drag.dy > 110) minimize();
          setDrag(null);
        }}
      >
        <button onClick={minimize} className="grid size-10 place-items-center rounded-full bg-white/10 backdrop-blur active:scale-90" aria-label="Minimize call">
          <ChevronDown className="size-6" />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <div className="truncate text-[17px] font-bold">{title || "Call"}</div>
          <div className="text-[13px] text-white/70 tabular-nums">{statusText}</div>
        </div>
        <span className="w-10" />
      </div>

      {/* stage */}
      <div className="relative min-h-0 flex-1 px-3">
        {!anyVideo || waiting ? (
          <div className="flex h-full flex-col items-center justify-center gap-6 pb-10">
            <div className={cn("flex flex-wrap items-center justify-center", (waiting ? waitingFor : remote.map((p) => p.id)).length > 1 ? "gap-5" : "")}>
              {(waiting ? waitingFor.slice(0, 4) : remote.slice(0, 6).map((p) => p.id)).map((id) => {
                const p = participants[id];
                const big = (waiting ? waitingFor.length : remote.length) === 1;
                return (
                  <div key={id} className="flex flex-col items-center gap-3">
                    <div className={cn("relative rounded-full", waiting && "animate-ring", p?.speaking && "voice-pulse")}>
                      <Avatar userId={id} size={big ? 148 : 96} plain />
                      {p?.muted && (
                        <span className="absolute right-1 bottom-1 grid size-8 place-items-center rounded-full bg-black/70 ring-2 ring-black">
                          <MicOff className="size-4 text-dnd" />
                        </span>
                      )}
                    </div>
                    <div className="text-center">
                      <div className={cn("font-bold", big ? "text-2xl" : "text-base")}>{profiles[id]?.display_name ?? "…"}</div>
                      {p?.connection && p.connection !== "connected" && <div className="text-xs text-idle">connecting…</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : focusedTile ? (
          <div className="flex h-full flex-col gap-2 pb-2">
            <div className="min-h-0 flex-1">
              <VideoTile tile={focusedTile} focused onClick={() => setFocused(focusedTile.key)} />
            </div>
            {tiles.length > 1 && (
              <div className="no-scrollbar flex h-28 shrink-0 gap-2 overflow-x-auto">
                {tiles
                  .filter((t) => t !== focusedTile)
                  .map((t) => (
                    <div key={t.key} className="aspect-[3/4] h-full shrink-0">
                      <VideoTile tile={t} compact onClick={() => setFocused(t.key)} />
                    </div>
                  ))}
              </div>
            )}
          </div>
        ) : (
          <div className={cn("grid h-full gap-2 pb-2", tiles.length > 2 ? "grid-cols-2" : "grid-cols-1")} style={{ gridAutoRows: "minmax(0, 1fr)" }}>
            {tiles.map((t) => (
              <VideoTile key={t.key} tile={t} onClick={() => setFocused(t.key)} />
            ))}
          </div>
        )}

        {/* self view (picture-in-picture) */}
        {localCam && (
          <div className="absolute top-2 right-5 z-10 aspect-[3/4] w-[28vw] max-w-[130px] overflow-hidden rounded-2xl shadow-2xl ring-1 ring-white/20">
            <VideoTile tile={selfTile} compact />
          </div>
        )}
      </div>

      {/* controls */}
      <div className="mx-3 mb-safe-3 rounded-[30px] bg-white/[.08] p-3 backdrop-blur-2xl">
        <div className="flex items-center justify-around">
          <Ctl label={localCam ? "Camera off" : "Camera"} on={!!localCam} onClick={() => void toggleVideo()}>
            {localCam ? <Video className="size-6" /> : <VideoOff className="size-6" />}
          </Ctl>
          <Ctl label={muted || deafened ? "Unmute" : "Mute"} on={!(muted || deafened)} invert onClick={toggleMute}>
            {muted || deafened ? <MicOff className="size-6" /> : <Mic className="size-6" />}
          </Ctl>
          <Ctl label={deafened ? "Undeafen" : "Deafen"} on={!deafened} invert onClick={toggleDeafen}>
            {deafened ? <HeadphoneOff className="size-6" /> : <Headphones className="size-6" />}
          </Ctl>
          {screenOk && (
            <Ctl label="Share" on={!!localScreen} onClick={() => void toggleScreen()}>
              <MonitorUp className="size-6" />
            </Ctl>
          )}
          <button
            onClick={() => {
              haptic.heavy();
              void leaveCall();
            }}
            className="flex flex-col items-center gap-1.5"
            aria-label="End call"
          >
            <span className="grid size-[60px] place-items-center rounded-full bg-dnd shadow-lg shadow-dnd/40 active:scale-90">
              <PhoneOff className="size-7" />
            </span>
            <span className="text-[11px] font-medium text-white/80">End</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function Ctl({ children, label, on, invert, onClick }: { children: React.ReactNode; label: string; on: boolean; invert?: boolean; onClick: () => void }) {
  // invert: "on" is the normal state (white glass); off = solid white with dark icon (iOS style)
  const active = invert ? !on : on;
  return (
    <button
      onClick={() => {
        haptic.light();
        onClick();
      }}
      className="flex flex-col items-center gap-1.5"
      aria-label={label}
    >
      <span className={cn("grid size-[60px] place-items-center rounded-full transition active:scale-90", active ? "bg-white text-black" : "bg-white/15 text-white")}>{children}</span>
      <span className="text-[11px] font-medium text-white/80">{label}</span>
    </button>
  );
}
