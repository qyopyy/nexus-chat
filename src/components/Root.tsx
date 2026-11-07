"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, isConfigured } from "@/lib/supabase";
import { startLiveUpdates } from "@/lib/liveUpdate";
import { startCapgo } from "@/lib/capgo";
import { mfaNeedsChallenge } from "@/lib/mfa";
import AuthScreen, { ResetPasswordScreen, type AuthMode } from "@/components/AuthScreen";
import AppShell from "@/components/AppShell";
import SetupScreen from "@/components/SetupScreen";
import HomeLanding from "@/components/site/HomeLanding";

export default function Root({ mode, initialVideo, initialRelease, initialGram, initialGramPost, initialGramContent, initialUntitled }: { mode?: AuthMode; initialVideo?: string; initialRelease?: string; initialGram?: string; initialGramPost?: string; initialGramContent?: string; initialUntitled?: string }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [recovering, setRecovering] = useState(false);
  const [needsMfa, setNeedsMfa] = useState(false);

  // Capacitor APK/IPA load the live site — reload when a new web deploy lands
  useEffect(() => startLiveUpdates(), []);
  // Capgo OTA: ready ping + background channel check
  useEffect(() => startCapgo(), []);

  // Standalone Wump IPA (UA BumpApp) always uses the slim /wump/app shell
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!/BumpApp/i.test(navigator.userAgent)) return;
    const p = window.location.pathname;
    if (p.startsWith("/wump/app") || p.startsWith("/bump/app")) return;
    window.location.replace("/wump/app" + window.location.search);
  }, []);

  // Standalone Nexus Link IPA stays on /bio/app (never the main chat shell)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!/LinkBioApp|NexusLink/i.test(navigator.userAgent)) return;
    const p = window.location.pathname;
    if (p.startsWith("/bio/app") || p.startsWith("/bio/admin") || p.startsWith("/bio/")) return;
    window.location.replace("/bio/app" + window.location.search);
  }, []);

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
  // logged-out visitors on "/" in a normal browser see the homepage; the iPhone/Android/desktop apps and installed PWA go straight to sign-in
  if (!session && !mode && showLanding()) return <HomeLanding />;
  if (!session) return <AuthScreen initialMode={mode ?? "login"} />;
  if (needsMfa) return <AuthScreen initialMode="mfa" />;
  return <AppShell key={session.user.id} userId={session.user.id} initialVideo={initialVideo} initialRelease={initialRelease} initialGram={initialGram} initialGramPost={initialGramPost} initialGramContent={initialGramContent} initialUntitled={initialUntitled} />;
}

function showLanding() {
  if (typeof window === "undefined") return false;
  if (window.location.pathname !== "/") return false;
  if (/NexusApp|NexusDesktop|Electron|BumpApp|WumpApp|LinkBioApp|NexusLink/i.test(navigator.userAgent)) return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  if (cap?.isNativePlatform?.()) return false;
  try {
    if (window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone) return false;
  } catch {
    /* ignore */
  }
  // deep links (?c=…, invites, OAuth returns) still go to sign-in
  if (window.location.search || window.location.hash) return false;
  return true;
}
