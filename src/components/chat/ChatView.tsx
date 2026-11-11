"use client";

import { useEffect, useState } from "react";
import { Phone, Volume2 } from "lucide-react";
import { useApp, conversationTitle, findChannel, toast } from "@/store/app";
import { useCall, joinCall, stepDown, stepOnStage, unlockCallAudio } from "@/lib/call";
import { loadMessages, setChannelStage } from "@/lib/data";
import { useTypingChannel } from "@/lib/realtime";
import ChatHeader from "./ChatHeader";
import MessageList from "./MessageList";
import Composer from "./Composer";
import PinsBar from "./PinsBar";
import CallStage from "@/components/call/CallStage";
import Avatar from "@/components/ui/Avatar";
import MobileCallScreen from "@/components/call/MobileCallScreen";
import MobileCallBar from "@/components/mobile/MobileCallBar";
import { useIsMobile } from "@/lib/useMobile";
import { isMuted } from "@/lib/admin";

export default function ChatView({ conversationId }: { conversationId: string }) {
  const me = useApp((s) => s.userId);
  const kind = useApp((s) => s.convKinds[conversationId]);
  const inThisCall = useCall((s) => s.status !== "idle" && s.conversationId === conversationId);
  const [expanded, setExpanded] = useState(kind === "voice");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [initialUnread] = useState(() => useApp.getState().unread[conversationId] ?? 0);
  const mobile = useIsMobile();
  const callMinimized = useApp((s) => s.callMinimized);
  const myProfile = useApp((s) => (s.userId ? s.profiles[s.userId] : undefined));
  const muted = isMuted(myProfile);

  // a call that starts in this chat opens full screen on phones
  useEffect(() => {
    if (inThisCall) useApp.setState({ callMinimized: false });
  }, [inThisCall]);

  useEffect(() => {
    void loadMessages(conversationId);
  }, [conversationId]);

  useEffect(() => {
    if (kind === "voice") setExpanded(true);
  }, [kind]);

  useTypingChannel(conversationId, me);

  const stage = useApp((s) => !!findChannel(s, conversationId)?.stage);
  const showLobby = kind === "voice" && !inThisCall;
  const showChat = mobile ? !showLobby : !showLobby && !(inThisCall && expanded);

  return (
    <div
      className="relative flex h-full min-h-0 flex-col"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const f = e.dataTransfer.files?.[0];
        if (f) setFile(f);
      }}
    >
      <ChatHeader
        conversationId={conversationId}
        stageExpanded={mobile ? !callMinimized : expanded}
        onToggleStage={() => (mobile ? useApp.setState({ callMinimized: false }) : setExpanded((v) => !v))}
      />

      {!inThisCall && kind !== "voice" && <OngoingCallBanner conversationId={conversationId} />}

      {inThisCall && !mobile && <CallStage conversationId={conversationId} expanded={expanded} onToggleExpand={() => setExpanded((v) => !v)} />}
      {inThisCall && mobile && !callMinimized && <MobileCallScreen conversationId={conversationId} />}
      {inThisCall && mobile && callMinimized && <MobileCallBar className="absolute inset-x-0 top-14 z-30 pt-2" />}

      {stage && inThisCall && <StageBar />}
      {showLobby && <VoiceLobby conversationId={conversationId} />}

      {showChat && (
        <>
          <PinsBar conversationId={conversationId} />
          <MessageList conversationId={conversationId} initialUnread={initialUnread} />
          {muted ? <MutedBar until={myProfile?.muted_until ?? null} reason={myProfile?.mute_reason ?? null} /> : <Composer conversationId={conversationId} file={file} setFile={setFile} />}
        </>
      )}

      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center bg-black/60">
          <div className="rounded-2xl border-2 border-dashed border-accent bg-accent/20 px-10 py-8 text-center">
            <div className="text-xl font-bold">Drop to upload</div>
            <div className="text-sm text-sub">Images, videos, audio, any file up to 1 GB · 5 GB with ⚡ Lighting</div>
          </div>
        </div>
      )}
    </div>
  );
}

function MutedBar({ until, reason }: { until: string | null; reason: string | null }) {
  return (
    <div className="m-3 mb-safe-3 rounded-2xl bg-idle/10 px-4 py-3 text-center text-sm ring-1 ring-idle/30">
      <div className="font-semibold text-idle">You can&apos;t send messages right now</div>
      <div className="text-sub">
        {until === "infinity" || !until ? "Until a moderator lifts it" : `Until ${new Date(until).toLocaleString()}`}
        {reason ? ` — ${reason}` : ""}
      </div>
    </div>
  );
}

function OngoingCallBanner({ conversationId }: { conversationId: string }) {
  const presence = useApp((s) => s.presence);
  const me = useApp((s) => s.userId);
  const inCall = Object.values(presence).filter((p) => p.voice === conversationId && p.user_id !== me);
  if (inCall.length === 0) return null;
  return (
    <div className="flex items-center gap-3 border-b border-black/20 bg-ok/15 px-4 py-2 text-sm">
      <span className="relative flex size-2.5">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-ok opacity-75" />
        <span className="relative inline-flex size-2.5 rounded-full bg-ok" />
      </span>
      <span className="flex -space-x-2">
        {inCall.slice(0, 4).map((p) => (
          <Avatar key={p.user_id} userId={p.user_id} size={22} className="rounded-full ring-2 ring-chat" />
        ))}
      </span>
      <span className="text-txt">Call in progress</span>
      <button
        onClick={() => {
          unlockCallAudio();
          void joinCall(conversationId);
        }}
        className="ml-auto flex items-center gap-1.5 rounded-md bg-ok px-3 py-1 font-semibold text-white hover:bg-ok/85"
      >
        <Phone className="size-4" /> Join
      </button>
    </div>
  );
}

function StageBar() {
  const listening = useCall((s) => s.stageListener);
  return (
    <div className="flex items-center gap-3 border-b border-black/20 bg-accent/10 px-4 py-2 text-sm">
      <span>{listening ? "Listening. Your microphone is off, and you can hear anyone whose mic is on." : "You're on stage. People in this room can hear you while your mic is on."}</span>
      {listening ? (
        <button
          type="button"
          className="ml-auto shrink-0 rounded-full bg-accent px-3 py-1 text-xs font-bold text-white"
          onClick={() => {
            if (!stepOnStage()) toast("Four people are already speaking. You can keep listening.", "info");
          }}
        >
          Step on stage
        </button>
      ) : (
        <button type="button" className="ml-auto shrink-0 rounded-full bg-side px-3 py-1 text-xs font-semibold" onClick={() => stepDown()}>
          Step down
        </button>
      )}
    </div>
  );
}

function VoiceLobby({ conversationId }: { conversationId: string }) {
  const title = useApp((s) => conversationTitle(s, conversationId));
  const presence = useApp((s) => s.presence);
  const profiles = useApp((s) => s.profiles);
  const channel = useApp((s) => findChannel(s, conversationId));
  const me = useApp((s) => s.userId);
  const role = useApp((s) => (channel?.space_id ? s.spaceMembers[channel.space_id]?.find((member) => member.user_id === me)?.role : undefined));
  const users = Object.values(presence).filter((p) => p.voice === conversationId);
  const stage = !!channel?.stage;
  const full = users.length >= 8;
  const speakers = users.filter((user) => !user.muted);
  const listeners = users.filter((user) => user.muted);
  const staff = role === "owner" || role === "admin";

  function enter(listenOnly: boolean) {
    if (stage && full) return;
    unlockCallAudio();
    void joinCall(conversationId, { listenOnly });
  }

  return (
    <div className="grid flex-1 place-items-center bg-black p-6">
      <div className="flex max-w-lg flex-col items-center text-center">
        <div className="mb-4 grid size-20 place-items-center rounded-full bg-side">
          <Volume2 className="size-10 text-sub" />
        </div>
        <h2 className="text-2xl font-bold">{title}</h2>
        {stage ? (
          <>
            <p className="mt-1 text-sub">Live Stage uses the voice room. You hear people only after you join. Up to 8 people, and up to 4 speaking.</p>
            <p className="mt-2 text-sm">{speakers.length ? `${speakers.length} speaking` : "Nobody is speaking"} · {listeners.length} listening</p>
            {full && <p className="mt-2 text-sm text-idle">The room is full. You can see who is inside, but you are not connected and you cannot hear them.</p>}
          </>
        ) : (
          <p className="mt-1 text-sub">{users.length ? `${users.length} in voice` : "No one is currently in voice"}</p>
        )}
        {users.length > 0 && (
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            {users.map((u) => (
              <div key={u.user_id} className="flex flex-col items-center gap-1">
                <Avatar userId={u.user_id} size={48} />
                <span className="text-xs text-sub">{profiles[u.user_id]?.display_name}{stage ? (u.muted ? " · listening" : " · speaking") : ""}</span>
              </div>
            ))}
          </div>
        )}
        {stage ? (
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <button disabled={full} onClick={() => enter(true)} className="rounded-full bg-ok px-6 py-3 font-semibold text-white transition hover:bg-ok/85 disabled:opacity-40">
              Join listening
            </button>
            <button
              disabled={full || speakers.length >= 4}
              onClick={() => enter(false)}
              className="rounded-full bg-accent px-6 py-3 font-semibold text-white transition hover:bg-accent/85 disabled:opacity-40"
            >
              Join speaking
            </button>
            {staff && (
              <button type="button" className="rounded-full px-4 py-3 text-sm text-sub" onClick={() => void setChannelStage(conversationId, false)}>
                Turn stage off
              </button>
            )}
          </div>
        ) : (
          <>
            <button
              onClick={() => enter(false)}
              className="mt-6 rounded-full bg-ok px-8 py-3 font-semibold text-white transition hover:bg-ok/85"
            >
              Join Voice
            </button>
            {staff && kindIsVoice(channel) && (
              <button type="button" className="mt-3 text-sm text-sub" onClick={() => void setChannelStage(conversationId, true)}>
                Make this a Live Stage
              </button>
            )}
          </>
        )}
        {stage && <p className="mt-3 text-xs text-faint">A person listed as speaking has their mic on inside the call. The lobby itself is not playing audio.</p>}
      </div>
    </div>
  );
}

function kindIsVoice(channel: ReturnType<typeof findChannel>) {
  return channel?.kind === "voice";
}
