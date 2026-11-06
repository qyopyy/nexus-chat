"use client";

import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  ExternalLink,
  LogOut,
  MapPinned,
  MessageCircle,
  Music2,
  Shield,
  UserPlus,
  UserRound,
  UsersRound,
} from "lucide-react";
import { supabase, isConfigured } from "@/lib/supabase";
import { startLiveUpdates } from "@/lib/liveUpdate";
import { mfaNeedsChallenge } from "@/lib/mfa";
import { useApp } from "@/store/app";
import { loadProfiles, refreshFriends } from "@/lib/data";
import { refreshBadges } from "@/lib/admin";
import { useRealtime } from "@/lib/realtime";
import { useBumpMusic } from "@/lib/bumpMusic";
import { bumpInbox } from "@/lib/bump";
import { WUMP, WUMP_GRADIENT, WUMP_TAGLINE } from "@/lib/wumpBrand";
import AuthScreen, { ResetPasswordScreen } from "@/components/AuthScreen";
import SetupScreen from "@/components/SetupScreen";
import BumpHub from "@/components/bump/BumpHub";
import BumpMiniPlayer from "@/components/bump/BumpMiniPlayer";
import Toasts from "@/components/ui/Toasts";
import EffectsLayer from "@/components/effects/EffectsLayer";
import { cn } from "@/lib/utils";

type Nav = "nearby" | "friends" | "groups" | "music" | "profile" | "messages" | "settings";

/** Standalone Wump IPA shell (`/wump/app` or `/bump/app`). */
export default function BumpAppRoot() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [recovering, setRecovering] = useState(false);
  const [needsMfa, setNeedsMfa] = useState(false);
  const [nav, setNav] = useState<Nav>("nearby");
  const [unreadChat, setUnreadChat] = useState(0);
  const bootstrapped = useApp((s) => s.bootstrapped);
  const friendships = useApp((s) => s.friendships);
  const userId = session?.user?.id ?? null;
  const playing = useBumpMusic((s) => s.playing);

  const pendingFriends = useMemo(
    () => friendships.filter((f) => f.status === "pending" && f.addressee_id === userId).length,
    [friendships, userId],
  );

  useEffect(() => startLiveUpdates(), []);
  useRealtime(bootstrapped && userId && !needsMfa ? userId : null);

  useEffect(() => {
    if (!isConfigured) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setNeedsMfa(false);
      return;
    }
    let cancelled = false;
    void mfaNeedsChallenge().then((n) => {
      if (!cancelled) setNeedsMfa(n);
    });
    return () => {
      cancelled = true;
    };
  }, [session]);

  useEffect(() => {
    if (!userId || needsMfa) return;
    let cancelled = false;
    useApp.setState({ userId, hub: "bump", bootstrapped: false });
    void (async () => {
      await Promise.all([loadProfiles([userId]), refreshFriends(), refreshBadges()]);
      if (!cancelled) useApp.setState({ bootstrapped: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, needsMfa]);

  useEffect(() => {
    if (!userId || needsMfa || !bootstrapped) return;
    let cancelled = false;
    const tick = () => {
      void bumpInbox()
        .then((rows) => {
          if (cancelled) return;
          setUnreadChat(rows.reduce((n, r) => n + (r.unread || 0), 0));
        })
        .catch(() => {
          /* ignore */
        });
    };
    tick();
    const t = setInterval(tick, 20_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [userId, needsMfa, bootstrapped, nav]);

  if (!isConfigured) return <SetupScreen />;
  if (session === undefined) {
    return (
      <div className="grid h-full place-items-center bg-[#0a0610]">
        <div className="size-10 animate-spin rounded-full border-4 border-[#ff4d6d] border-t-transparent" />
      </div>
    );
  }
  if (recovering && session) return <ResetPasswordScreen onDone={() => setRecovering(false)} />;
  if (!session) return <AuthScreen initialMode="login" />;
  if (needsMfa) return <AuthScreen initialMode="mfa" />;
  if (!bootstrapped) {
    return (
      <div className="grid h-full place-items-center bg-[#0a0610]">
        <div className="size-10 animate-spin rounded-full border-4 border-[#ff4d6d] border-t-transparent" />
      </div>
    );
  }

  const items: { id: Nav; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: "nearby", label: "Map", icon: <MapPinned className="size-5" /> },
    { id: "friends", label: "Friends", icon: <UserPlus className="size-5" />, badge: pendingFriends },
    { id: "messages", label: "Chat", icon: <MessageCircle className="size-5" />, badge: unreadChat },
    { id: "groups", label: "Groups", icon: <UsersRound className="size-5" /> },
    { id: "music", label: "Music", icon: <Music2 className="size-5" /> },
    { id: "profile", label: "Me", icon: <UserRound className="size-5" /> },
    { id: "settings", label: "Privacy", icon: <Shield className="size-5" /> },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#0a0610] text-txt">
      <header className="relative shrink-0 overflow-hidden border-b border-white/10 pt-safe-3">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: `${WUMP_GRADIENT}, linear-gradient(180deg,#1a0a14 0%,#0a0610 100%)`,
            backgroundBlendMode: "soft-light, normal",
            opacity: 0.95,
          }}
        />
        <div className="relative flex items-center gap-3 px-4 pb-3 pt-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/wump-icon.png"
            alt=""
            className="size-11 rounded-2xl object-cover shadow-lg shadow-fuchsia-900/40 ring-1 ring-white/15"
            width={44}
            height={44}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-extrabold tracking-tight text-white">{WUMP}</h1>
              {playing && (
                <span className="inline-flex items-center gap-1 rounded-full bg-pink-500/25 px-2 py-0.5 text-[10px] font-bold text-pink-200">
                  <span className="size-1.5 animate-pulse rounded-full bg-pink-300" /> Listening
                </span>
              )}
            </div>
            <p className="truncate text-[12px] text-white/55">{WUMP_TAGLINE} · same Nexus account</p>
          </div>
          <button
            type="button"
            onClick={() => setNav("friends")}
            className="relative hidden items-center gap-1 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/15 sm:inline-flex"
          >
            <UserRound className="size-3.5" /> Friends
            {pendingFriends > 0 && (
              <span className="absolute -top-1 -right-1 grid min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">
                {pendingFriends}
              </span>
            )}
          </button>
          <a
            href="https://nexusproject.cc"
            className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/15"
          >
            Nexus <ExternalLink className="size-3" />
          </a>
          <button
            type="button"
            aria-label="Sign out"
            onClick={() => void supabase.auth.signOut()}
            className="grid size-9 place-items-center rounded-full bg-white/10 text-white hover:bg-white/15"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-hidden">
        <BumpHub
          standalone
          hideChromeTabs
          initialTab={nav}
          onTabChange={(t) => {
            if (t === "social") setNav("friends");
            else if (
              t === "nearby" ||
              t === "friends" ||
              t === "groups" ||
              t === "music" ||
              t === "profile" ||
              t === "messages" ||
              t === "settings"
            ) {
              setNav(t);
            }
          }}
        />
      </div>

      <BumpMiniPlayer onOpen={() => setNav("music")} />

      <nav className="shrink-0 border-t border-white/10 bg-[#071a10]/95 pb-safe backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {items.map((it) => {
            const active = nav === it.id;
            const badge = it.badge && it.badge > 0 ? it.badge : 0;
            return (
              <button
                key={it.id}
                type="button"
                onClick={() => setNav(it.id)}
                className={cn(
                  "relative flex min-h-12 min-w-[3.35rem] flex-1 flex-col items-center justify-center gap-0.5 px-1 pt-1.5 pb-1 transition",
                  active ? "text-[#86efac]" : "text-white/45",
                )}
              >
                <span className="relative">
                  {it.icon}
                  {badge > 0 && (
                    <span className="absolute -top-1.5 -right-2 grid min-w-[1rem] place-items-center rounded-full bg-rose-500 px-1 text-[9px] font-bold leading-none text-white">
                      {badge > 99 ? "99+" : badge}
                    </span>
                  )}
                </span>
                <span className="text-[10px] font-semibold tracking-wide">{it.label}</span>
                {active && <span className="absolute inset-x-5 bottom-0 h-0.5 rounded-full bg-[#86efac]" />}
              </button>
            );
          })}
        </div>
      </nav>

      <Toasts />
      <EffectsLayer />
    </div>
  );
}
