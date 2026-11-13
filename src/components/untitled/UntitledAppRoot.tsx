"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, isConfigured } from "@/lib/supabase";
import { mfaNeedsChallenge } from "@/lib/mfa";
import { useApp } from "@/store/app";
import { loadProfiles } from "@/lib/data";
import AuthScreen, { ResetPasswordScreen } from "@/components/AuthScreen";
import SetupScreen from "@/components/SetupScreen";
import Toasts from "@/components/ui/Toasts";
import UntitledHub from "./UntitledHub";

/** Standalone Untitled IPA entry at /untitled/app. */
export default function UntitledAppRoot() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [recovering, setRecovering] = useState(false);
  const [needsMfa, setNeedsMfa] = useState(false);
  const userId = session?.user.id ?? null;

  useEffect(() => {
    if (!isConfigured) return;
    void supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
      setSession(next);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setNeedsMfa(false);
      return;
    }
    let live = true;
    void mfaNeedsChallenge().then((needed) => {
      if (live) setNeedsMfa(needed);
    });
    return () => {
      live = false;
    };
  }, [session]);

  useEffect(() => {
    if (!userId || needsMfa) return;
    useApp.setState({ userId, hub: "cutroom" });
    void loadProfiles([userId]);
  }, [userId, needsMfa]);

  if (!isConfigured) return <SetupScreen />;
  if (session === undefined) {
    return (
      <div className="grid h-full place-items-center bg-[#070709]">
        <div className="size-10 animate-spin rounded-full border-4 border-[#c4a574] border-t-transparent" />
      </div>
    );
  }
  if (recovering && session) return <ResetPasswordScreen onDone={() => setRecovering(false)} />;
  if (!session) return <AuthScreen initialMode="login" />;
  if (needsMfa) return <AuthScreen initialMode="mfa" />;

  return (
    <div className="h-full bg-[#070709]">
      <UntitledHub mobile standalone />
      <Toasts />
    </div>
  );
}
