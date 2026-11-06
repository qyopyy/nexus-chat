"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, isConfigured } from "@/lib/supabase";
import { mfaNeedsChallenge } from "@/lib/mfa";
import { useApp } from "@/store/app";
import { loadProfiles } from "@/lib/data";
import AuthScreen, { ResetPasswordScreen } from "@/components/AuthScreen";
import SetupScreen from "@/components/SetupScreen";
import LinkBioHub from "@/components/linkbio/LinkBioHub";
import Toasts from "@/components/ui/Toasts";

/** Standalone Nexus Link shell (`/bio/app`) — Nexus login, then editor. */
export default function LinkBioAppRoot() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [recovering, setRecovering] = useState(false);
  const [needsMfa, setNeedsMfa] = useState(false);
  const bootstrapped = useApp((s) => s.bootstrapped);
  const userId = session?.user?.id ?? null;

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
    useApp.setState({ userId, hub: "apps", appsTool: "linkbio", bootstrapped: false });
    void (async () => {
      await loadProfiles([userId]);
      if (!cancelled) useApp.setState({ bootstrapped: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, needsMfa]);

  if (!isConfigured) return <SetupScreen />;
  if (session === undefined) {
    return (
      <div className="grid h-full min-h-dvh place-items-center bg-[#0a0214]">
        <div className="size-10 animate-spin rounded-full border-4 border-[#a855f7] border-t-transparent" />
      </div>
    );
  }
  if (recovering && session) return <ResetPasswordScreen onDone={() => setRecovering(false)} />;
  if (!session) return <AuthScreen initialMode="login" />;
  if (needsMfa) return <AuthScreen initialMode="mfa" />;
  if (!bootstrapped) {
    return (
      <div className="grid h-full min-h-dvh place-items-center bg-[#0a0214]">
        <div className="size-10 animate-spin rounded-full border-4 border-[#a855f7] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-dvh min-h-0 flex-col bg-[#07060f] text-white">
      <LinkBioHub standalone />
      <Toasts />
    </div>
  );
}
