"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useApp } from "@/store/app";
import { initCallEngine } from "@/lib/call";
import { useRealtime } from "@/lib/realtime";
import { loadProfiles, refreshChatList, refreshFriends, refreshSpaces, refreshUnread } from "@/lib/data";
import { isBanned, refreshBadges } from "@/lib/admin";
import BannedScreen from "./BannedScreen";
import ProfileCard from "./ui/ProfileCard";
import { cn } from "@/lib/utils";
import ServerRail from "./layout/ServerRail";
import HomeSidebar from "./layout/HomeSidebar";
import SpaceSidebar from "./layout/SpaceSidebar";
import UserPanel from "./layout/UserPanel";
import MemberList from "./layout/MemberList";
import ChatView from "./chat/ChatView";
import FriendsView from "./chat/FriendsView";
import IncomingCall from "./call/IncomingCall";
import Toasts from "./ui/Toasts";
import Modals from "./modals/Modals";

export default function AppShell({ userId }: { userId: string }) {
  const spaceId = useApp((s) => s.spaceId);
  const conversationId = useApp((s) => s.conversationId);
  const showMembers = useApp((s) => s.showMembers);
  const mobileSidebar = useApp((s) => s.mobileSidebar);
  const bootstrapped = useApp((s) => s.bootstrapped);
  const me = useApp((s) => s.profiles[userId]);

  useEffect(() => {
    useApp.setState({ userId });
    initCallEngine(userId);
    (async () => {
      await supabase.realtime.setAuth();
      await Promise.all([loadProfiles([userId]), refreshFriends(), refreshChatList(), refreshSpaces(), refreshUnread(), refreshBadges()]);
      useApp.setState({ bootstrapped: true });
    })();
  }, [userId]);

  useRealtime(bootstrapped ? userId : null);

  // keep realtime JWT fresh after token refresh
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "TOKEN_REFRESHED") void supabase.realtime.setAuth();
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (!bootstrapped) {
    return (
      <div className="grid h-full place-items-center bg-rail">
        <div className="flex flex-col items-center gap-4">
          <div className="size-12 animate-spin rounded-full border-4 border-accent border-t-transparent" />
          <p className="text-sm text-sub">Connecting…</p>
        </div>
      </div>
    );
  }

  if (isBanned(me)) return <BannedScreen profile={me!} />;

  return (
    <div className="flex h-full w-full overflow-hidden bg-rail">
      {/* rail + sidebar */}
      <div className={cn("h-full shrink-0 md:flex", mobileSidebar ? "flex w-full md:w-auto" : "hidden")}>
        <ServerRail />
        <aside className="flex h-full w-full flex-col bg-side md:w-[320px]">
          <div className="min-h-0 flex-1">{spaceId ? <SpaceSidebar spaceId={spaceId} /> : <HomeSidebar />}</div>
          <UserPanel />
        </aside>
      </div>

      {/* main */}
      <main className={cn("h-full min-w-0 flex-1 md:flex", mobileSidebar ? "hidden" : "flex")}>
        <div className="flex h-full min-w-0 flex-1 flex-col bg-chat">
          {conversationId ? (
            <ChatView key={conversationId} conversationId={conversationId} />
          ) : spaceId ? (
            <div className="chat-wallpaper grid flex-1 place-items-center text-sub">Pick a channel to start chatting</div>
          ) : (
            <FriendsView />
          )}
        </div>
        {showMembers && conversationId && (
          <div className="hidden h-full w-[260px] shrink-0 border-l border-black/20 bg-side lg:block">
            <MemberList conversationId={conversationId} />
          </div>
        )}
      </main>

      <IncomingCall />
      <ProfileCard />
      <Modals />
      <Toasts />
    </div>
  );
}
