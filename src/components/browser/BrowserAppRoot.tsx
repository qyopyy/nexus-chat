"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, isConfigured } from "@/lib/supabase";
import { startLiveUpdates } from "@/lib/liveUpdate";
import { mfaNeedsChallenge } from "@/lib/mfa";
import { useApp } from "@/store/app";
import { loadProfiles, refreshFriends } from "@/lib/data";
import AuthScreen, { ResetPasswordScreen } from "@/components/AuthScreen";
import SetupScreen from "@/components/SetupScreen";
import BrowserHub from "@/components/browser/BrowserHub";
import Toasts from "@/components/ui/Toasts";
import { ExternalLink, LogOut } from "lucide-react";

/** Slim shell for the standalone Nexus Browser IPA (`/browser/app`). */
export default function BrowserAppRoot() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [recovering, setRecovering] = useState(false);
  const [needsMfa, setNeedsMfa] = useState(false);
  const bootstrapped = useApp((s) => s.bootstrapped);
  const userId = session?.user?.id ?? null;

  useEffect(() => startLiveUpdates(), []);

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
    useApp.setState({ userId, hub: "apps", appsTool: "browser", bootstrapped: false });
    void (async () => {
      await Promise.all([loadProfiles([userId]), refreshFriends()]);
      if (!cancelled) useApp.setState({ bootstrapped: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, needsMfa]);

  if (!isConfigured) return <SetupScreen />;
  if (session === undefined) {
    return (
      <div className="grid h-full place-items-center bg-[#0b1220]">
        <div className="size-10 animate-spin rounded-full border-4 border-[#60a5fa] border-t-transparent" />
      </div>
    );
  }
  if (recovering && session) return <ResetPasswordScreen onDone={() => setRecovering(false)} />;
  if (!session) return <AuthScreen initialMode="login" />;
  if (needsMfa) return <AuthScreen initialMode="mfa" />;
  if (!bootstrapped) {
    return (
      <div className="grid h-full place-items-center bg-[#0b1220]">
        <div className="size-10 animate-spin rounded-full border-4 border-[#60a5fa] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#0b1220] text-white">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 bg-[#111827] px-3 pt-safe-3 pb-2">
        <div className="flex min-w-0 items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/browser-icon.png" alt="" className="size-9 rounded-xl object-cover ring-1 ring-white/15" width={36} height={36} />
          <div className="min-w-0">
            <div className="text-[11px] font-bold tracking-[0.14em] text-[#93c5fd] uppercase">Nexus · Browser</div>
            <div className="truncate text-sm font-semibold text-white/80">Standalone search · same account</div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <a
            href="https://nexusproject.cc"
            className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/15"
          >
            Open Nexus <ExternalLink className="size-3" />
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
      </div>
      <div className="min-h-0 flex-1">
        <BrowserHub standalone />
      </div>
      <Toasts />
    </div>
  );
}
