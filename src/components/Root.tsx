"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, isConfigured } from "@/lib/supabase";
import AuthScreen, { ResetPasswordScreen, type AuthMode } from "@/components/AuthScreen";
import AppShell from "@/components/AppShell";
import SetupScreen from "@/components/SetupScreen";

export default function Root({ mode, initialVideo, initialRelease }: { mode?: AuthMode; initialVideo?: string; initialRelease?: string }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    if (!isConfigured) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // logged in on /login or /register → go home
  useEffect(() => {
    if (session && mode) window.history.replaceState(null, "", "/");
  }, [session, mode]);

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
  return <AppShell key={session.user.id} userId={session.user.id} initialVideo={initialVideo} initialRelease={initialRelease} />;
}
