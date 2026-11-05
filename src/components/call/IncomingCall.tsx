"use client";

import { Phone, PhoneOff, Video } from "lucide-react";
import { useApp, conversationTitle } from "@/store/app";
import { useCall, dismissIncoming, joinCall, unlockCallAudio } from "@/lib/call";
import { openConversation } from "@/lib/data";
import Avatar from "@/components/ui/Avatar";

export default function IncomingCall() {
  const incoming = useCall((s) => s.incoming);
  const caller = useApp((s) => (incoming ? s.profiles[incoming.callerId] : undefined));
  const kind = useApp((s) => (incoming ? s.convKinds[incoming.conversationId] : undefined));
  const title = useApp((s) => (incoming ? conversationTitle(s, incoming.conversationId) : ""));
  if (!incoming) return null;

  const accept = async (video: boolean) => {
    // must unlock AudioContext under the same click that accepts, before awaits
    unlockCallAudio();
    const conv = incoming.conversationId;
    openConversation(conv, null);
    await joinCall(conv, { video });
  };

  return (
    <div className="fixed top-6 left-1/2 z-[80] w-[320px] -translate-x-1/2 animate-pop rounded-2xl bg-menu p-5 text-center shadow-2xl ring-1 ring-white/10">
      <div className="mx-auto w-fit animate-ring rounded-full">
        <Avatar userId={incoming.callerId} size={80} />
      </div>
      <div className="mt-3 text-lg font-bold">{caller?.display_name ?? "Someone"}</div>
      <div className="text-sm text-sub">{kind === "group" ? `Incoming group call · ${title}` : "Incoming call…"}</div>
      <div className="mt-5 flex justify-center gap-4">
        <button onClick={() => dismissIncoming(true)} className="grid size-14 place-items-center rounded-full bg-dnd text-white transition hover:scale-105" title="Decline">
          <PhoneOff className="size-6" />
        </button>
        <button onClick={() => void accept(true)} className="grid size-14 place-items-center rounded-full bg-accent text-white transition hover:scale-105" title="Accept with video">
          <Video className="size-6" />
        </button>
        <button onClick={() => void accept(false)} className="grid size-14 place-items-center rounded-full bg-ok text-white transition hover:scale-105" title="Accept">
          <Phone className="size-6" />
        </button>
      </div>
    </div>
  );
}
