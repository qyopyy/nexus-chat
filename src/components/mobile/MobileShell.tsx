"use client";

import { useRef, useState } from "react";
import { useApp } from "@/store/app";
import { useCall } from "@/lib/call";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import ChatView from "@/components/chat/ChatView";
import FriendsView from "@/components/chat/FriendsView";
import TabBar from "./TabBar";
import MobileChats from "./MobileChats";
import MobileSpaces from "./MobileSpaces";
import MobileMe from "./MobileMe";
import MobileCallBar from "./MobileCallBar";
import GamesHub from "@/components/games/GamesHub";
import AppsHub from "@/components/apps/AppsHub";
import MusicHub from "@/components/music/MusicHub";
import VideosHub from "@/components/videos/VideosHub";
import NexusGram from "@/components/gram/NexusGram";
import UntitledHub from "@/components/untitled/UntitledHub";
import RadioHub from "@/components/radio/RadioHub";
import LiveHub from "@/components/live/LiveHub";
import PulseHub from "@/components/pulse/PulseHub";
import StaffDesk from "@/components/staff/StaffDesk";
import SiteNoticeBanner from "@/components/staff/SiteNoticeBanner";

/** Phone layout: bottom tabs + push-style chat screen with swipe-from-edge to go back */
export default function MobileShell() {
  const tab = useApp((s) => s.mobileTab);
  const hub = useApp((s) => s.hub);
  const conversationId = useApp((s) => s.conversationId);
  const mobileSidebar = useApp((s) => s.mobileSidebar);
  const callConv = useCall((s) => (s.status !== "idle" ? s.conversationId : null));
  const inChat = !!conversationId && !mobileSidebar;
  const [dx, setDx] = useState(0);
  const drag = useRef<{ x: number; y: number; active: boolean } | null>(null);

  const back = () => {
    haptic.light();
    useApp.setState({ mobileSidebar: true });
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-rail">
      <SiteNoticeBanner />
      <div className="relative min-h-0 flex-1">
        {/* tab content stays mounted so scroll position survives opening a chat */}
        <div className={cn("absolute inset-0 transition-transform duration-300", inChat && !dx && "-translate-x-[22%]")} style={dx ? { transform: `translateX(${-22 + (dx / window.innerWidth) * 22}%)` } : undefined} aria-hidden={inChat}>
          {tab === "chats" && <MobileChats />}
          {tab === "spaces" && <MobileSpaces />}
          {tab === "friends" && (
            <div className="flex h-full flex-col bg-chat pt-1">
              <FriendsView />
            </div>
          )}
          {tab === "gram" && (hub === "pulse" ? <PulseHub mobile /> : <NexusGram mobile />)}
          {tab === "videos" && (hub === "live" ? <LiveHub mobile /> : <VideosHub mobile />)}
          {tab === "music" && (hub === "cutroom" || hub === "untitled" ? <UntitledHub mobile /> : hub === "radio" ? <RadioHub mobile /> : <MusicHub mobile />)}
          {tab === "games" && <GamesHub mobile />}
          {tab === "apps" && <AppsHub mobile />}
          {tab === "me" && (hub === "staff" ? <StaffDesk mobile /> : <MobileMe />)}
          {inChat && <div className="absolute inset-0 bg-black/40" style={{ opacity: dx ? 1 - dx / window.innerWidth : 1 }} />}
        </div>

        {inChat && conversationId && (
          <div
            key={conversationId}
            className={cn("absolute inset-0 flex flex-col bg-chat shadow-[-20px_0_40px_rgba(0,0,0,.35)]", !dx && "animate-push")}
            style={{ transform: dx ? `translateX(${dx}px)` : undefined, transition: drag.current ? "none" : "transform .25s cubic-bezier(.2,.9,.3,1)" }}
            onPointerDown={(e) => {
              if (e.pointerType === "mouse") return;
              if (e.clientX < 28) drag.current = { x: e.clientX, y: e.clientY, active: false };
            }}
            onPointerMove={(e) => {
              const d = drag.current;
              if (!d) return;
              const mx = e.clientX - d.x;
              if (!d.active) {
                if (Math.abs(e.clientY - d.y) > 14) {
                  drag.current = null;
                  return;
                }
                if (mx > 10) {
                  d.active = true;
                  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                }
              }
              if (d.active) setDx(Math.max(0, mx));
            }}
            onPointerUp={() => {
              const d = drag.current;
              drag.current = null;
              if (d?.active && dx > window.innerWidth * 0.33) {
                setDx(window.innerWidth);
                setTimeout(() => {
                  setDx(0);
                  back();
                }, 180);
              } else setDx(0);
            }}
            onPointerCancel={() => {
              drag.current = null;
              setDx(0);
            }}
          >
            {callConv && callConv !== conversationId && <MobileCallBar className="absolute inset-x-0 top-14 z-30" />}
            <ChatView conversationId={conversationId} />
          </div>
        )}

        {!inChat && <MobileCallBar className="absolute inset-x-0 bottom-0" />}
      </div>
      {!inChat && <TabBar />}
    </div>
  );
}
