"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useApp, toast } from "@/store/app";
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
import InvitePopup from "./games/InvitePopup";
import Toasts from "./ui/Toasts";
import MessageBanner from "./ui/MessageBanner";
import Modals from "./modals/Modals";
import MobileShell from "./mobile/MobileShell";
import EffectsLayer from "./effects/EffectsLayer";
import { useIsMobile } from "@/lib/useMobile";
import { startSpotifySync } from "@/lib/spotifyUser";
import { startMediaAudio } from "@/lib/mediaAudio";
import "@/lib/prefs";
import { startPush } from "@/lib/push";
import { joinGame } from "@/store/games";
import GamesHub from "@/components/games/GamesHub";
import AppsHub from "@/components/apps/AppsHub";
import MusicHub from "./music/MusicHub";
import VideosHub from "./videos/VideosHub";
import Studio from "./studio/Studio";
import UntitledHub from "./untitled/UntitledHub";
import RadioHub from "./radio/RadioHub";
import LiveHub from "./live/LiveHub";
import PulseHub from "./pulse/PulseHub";
import StaffDesk from "./staff/StaffDesk";
import SiteNoticeBanner from "./staff/SiteNoticeBanner";
import { useStudio, videosGo } from "@/store/studio";
import { releaseByCode } from "@/lib/protect";
import NexusGram from "./gram/NexusGram";
import { getPost, openGram, useGram } from "@/lib/gram";
import { openUntitled } from "@/lib/untitled";

export default function AppShell({ userId, initialVideo, initialRelease, initialGram, initialGramPost, initialGramContent, initialUntitled }: { userId: string; initialVideo?: string; initialRelease?: string; initialGram?: string; initialGramPost?: string; initialGramContent?: string; initialUntitled?: string }) {
  const spaceId = useApp((s) => s.spaceId);
  const conversationId = useApp((s) => s.conversationId);
  const showMembers = useApp((s) => s.showMembers);
  const mobileSidebar = useApp((s) => s.mobileSidebar);
  const bootstrapped = useApp((s) => s.bootstrapped);
  const me = useApp((s) => s.profiles[userId]);
  const mobile = useIsMobile();
  const hub = useApp((s) => s.hub);

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

  // opening any chat leaves the music hub; Spotify "now playing" sync
  useEffect(() => {
    if (conversationId && useApp.getState().hub !== "studio") useApp.setState({ hub: null });
  }, [conversationId]);
  // /v/<link> opens the video straight away
  useEffect(() => {
    if (!initialVideo) return;
    useApp.setState({ hub: "videos", mobileTab: "videos" });
    videosGo({ view: "watch", key: initialVideo });
  }, [initialVideo]);
  // /gram/<username> opens that NexusGram profile (from the public /u/ page)
  useEffect(() => {
    if (!bootstrapped || initialGram === undefined) return;
    window.history.replaceState(null, "", "/");
    openGram(initialGram ? { view: "profile", username: initialGram } : { view: "home" });
  }, [bootstrapped, initialGram]);
  // /gram/p/<id> or /g/<id> deep-link opens a post
  useEffect(() => {
    if (!bootstrapped || !initialGramPost) return;
    window.history.replaceState(null, "", "/");
    openGram({ view: "post", id: initialGramPost });
  }, [bootstrapped, initialGramPost]);
  // /n/<id> or /gram/c/<id> opens a post or story
  useEffect(() => {
    if (!bootstrapped || !initialGramContent) return;
    window.history.replaceState(null, "", "/");
    void (async () => {
      const post = await getPost(initialGramContent);
      if (post) {
        openGram(post.kind === "short" ? { view: "shorts", start: post.id } : { view: "post", id: post.id });
        return;
      }
      const { data } = await supabase.from("gram_stories").select("id, author_id").eq("id", initialGramContent).gt("expires_at", new Date().toISOString()).maybeSingle();
      if (data) {
        openGram({ view: "home" });
        useGram.setState({ story: { authors: [data.author_id as string], index: 0 } });
        return;
      }
      toast("That NexusGram link wasn't found", "error");
    })();
  }, [bootstrapped, initialGramContent]);
  // /release/<code> opens that release in Studio (owner + reviewers)
  useEffect(() => {
    if (!bootstrapped || !initialRelease) return;
    void releaseByCode(initialRelease).then((id) => {
      window.history.replaceState(null, "", "/");
      if (!id) return toast("That release link isn't yours, or the release was removed", "error");
      useStudio.setState({ section: "releases", releaseId: id });
      useApp.setState({ hub: "studio" });
    });
  }, [bootstrapped, initialRelease]);
  // /m/<username> opens Untitled profile
  useEffect(() => {
    if (!bootstrapped || initialUntitled === undefined) return;
    window.history.replaceState(null, "", "/");
    // /untitled/<username> deep-link into Cutroom
    openUntitled(initialUntitled ? { view: "profile", username: initialUntitled } : { view: "home" });
  }, [bootstrapped, initialUntitled]);
  useEffect(() => {
    if (!bootstrapped) return;
    startSpotifySync();
    startMediaAudio();
    void startPush();
    const q = new URLSearchParams(window.location.search);
    const play = q.get("play");
    const g = q.get("g");
    if (play && /^[A-Za-z2-9]{6}$/.test(play)) {
      joinGame(play, g === "geo" || g === "four" || g === "flappy" ? g : "streets");
      window.history.replaceState(null, "", "/");
    }
  }, [bootstrapped]);

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

  if (hub === "studio") {
    return (
      <>
        <Studio />
        <IncomingCall />
        <InvitePopup />
        <ProfileCard />
        <Modals />
        <Toasts />
        <EffectsLayer />
      </>
    );
  }

  if (mobile) {
    return (
      <>
        <MobileShell />
        <IncomingCall />
        <InvitePopup />
        <ProfileCard />
        <Modals />
        <Toasts />
        <EffectsLayer />
      </>
    );
  }

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
          <SiteNoticeBanner />
          {hub === "gram" ? (
            <NexusGram />
          ) : hub === "games" ? (
            <GamesHub />
          ) : hub === "apps" ? (
            <AppsHub />
          ) : hub === "cutroom" || hub === "untitled" ? (
            <UntitledHub />
          ) : hub === "radio" ? (
            <RadioHub />
          ) : hub === "live" ? (
            <LiveHub />
          ) : hub === "pulse" ? (
            <PulseHub />
          ) : hub === "staff" ? (
            <StaffDesk />
          ) : hub === "music" ? (
            <MusicHub />
          ) : hub === "videos" ? (
            <VideosHub />
          ) : conversationId ? (
            <ChatView key={conversationId} conversationId={conversationId} />
          ) : spaceId ? (
            <div className="chat-wallpaper grid flex-1 place-items-center text-sub">Pick a channel to start chatting</div>
          ) : (
            <FriendsView />
          )}
        </div>
        {showMembers && conversationId && !hub && (
          <div className="hidden h-full w-[260px] shrink-0 border-l border-black/20 bg-side lg:block">
            <MemberList conversationId={conversationId} />
          </div>
        )}
      </main>

      <IncomingCall />
        <InvitePopup />
      <ProfileCard />
      <Modals />
      <MessageBanner />
      <Toasts />
      <EffectsLayer />
    </div>
  );
}
