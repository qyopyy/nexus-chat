"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, isConfigured } from "@/lib/supabase";
import { startLiveUpdates } from "@/lib/liveUpdate";
import { mfaNeedsChallenge } from "@/lib/mfa";
import AuthScreen, { ResetPasswordScreen, type AuthMode } from "@/components/AuthScreen";
import AppShell from "@/components/AppShell";
import SetupScreen from "@/components/SetupScreen";

export default function Root({ mode, initialVideo, initialRelease, initialGram, initialGramPost, initialGramContent, initialUntitled }: { mode?: AuthMode; initialVideo?: string; initialRelease?: string; initialGram?: string; initialGramPost?: string; initialGramContent?: string; initialUntitled?: string }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [recovering, setRecovering] = useState(false);
  const [needsMfa, setNeedsMfa] = useState(false);

  // Capacitor APK/IPA load the live site — reload when a new web deploy lands
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

  // logged in on /login or /register → go home (unless MFA still required)
  useEffect(() => {
    if (session && mode && !needsMfa) window.history.replaceState(null, "", "/");
  }, [session, mode, needsMfa]);

  if (!isConfigured) return <SetupScreen />;
  if (session === undefined) {
    return (
      <div className="grid h-full place-items-center bg-rail">
        <div className="size-10 animate-spin rounded-full border-4 border-accent border-t-transparent" />
      </div>
    );
  }
  if (recovering && session) return <ResetPasswordScreen onDone={() => setRecovering(false)} />;
  if (!session) return <AuthScreen initialMode={mode ?? "login"} />;
  if (needsMfa) return <AuthScreen initialMode="mfa" />;
  return <AppShell key={session.user.id} userId={session.user.id} initialVideo={initialVideo} initialRelease={initialRelease} initialGram={initialGram} initialGramPost={initialGramPost} initialGramContent={initialGramContent} initialUntitled={initialUntitled} />;
}
