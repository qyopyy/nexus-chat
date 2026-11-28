"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, isConfigured } from "@/lib/supabase";
import { startLiveUpdates } from "@/lib/liveUpdate";
import { useRealtime } from "@/lib/realtime";
import { mfaNeedsChallenge } from "@/lib/mfa";
import { useApp } from "@/store/app";
import { loadProfiles, refreshChatList } from "@/lib/data";
import AuthScreen, { ResetPasswordScreen } from "@/components/AuthScreen";
import SetupScreen from "@/components/SetupScreen";
import Toasts from "@/components/ui/Toasts";
import SnapCamera from "./SnapCamera";
import SnapDropReceiver from "./SnapDropReceiver";
import SnapLock from "./SnapLock";
import { usePrefs } from "@/lib/snapPrefsStore";

/** Standalone Nexus Snap shell (`/snap` and `/snap/app`, the Snap IPA): camera first, same Nexus account and vault. */
export default function SnapAppRoot() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [recovering, setRecovering] = useState(false);
  const [needsMfa, setNeedsMfa] = useState(false);
  const bootstrapped = useApp((s) => s.bootstrapped);
  const userId = session?.user?.id ?? null;
  const prefs = usePrefs();

  useEffect(() => startLiveUpdates(), []);
  // incoming chat messages (voice replies) while Snap is the whole app
  useRealtime(userId && !needsMfa ? userId : null);

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
    useApp.setState({ userId, bootstrapped: false });
    void (async () => {
      await Promise.all([loadProfiles([userId]), refreshChatList()]);
      if (!cancelled) useApp.setState({ bootstrapped: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, needsMfa]);

  const spinner = (
    <div className="grid h-full place-items-center bg-black">
      <div className="size-10 animate-spin rounded-full border-4 border-white/70 border-t-transparent" />
    </div>
  );
  if (!isConfigured) return <SetupScreen />;
  if (session === undefined) return spinner;
  if (recovering && session) return <ResetPasswordScreen onDone={() => setRecovering(false)} />;
  if (!session)
    return (
      <>
        <AuthScreen initialMode="login" />
        <div className="pointer-events-none fixed inset-x-3 z-[60] rounded-2xl bg-black/85 px-4 py-2 text-center text-white shadow-lg" style={{ top: "calc(env(safe-area-inset-top) + 8px)" }}>
          <b className="text-sm tracking-wide">NEXUS SNAP</b>
          <p className="text-[11px] text-white/70">Sign in with your Nexus account or Apple. Photos and videos save to your Nexus Drive.</p>
        </div>
      </>
    );
  if (needsMfa) return <AuthScreen initialMode="mfa" />;
  if (!bootstrapped) return spinner;

  return (
    <>
      <SnapCamera />
      {prefs.receiveDrops && <SnapDropReceiver />}
      <SnapLock lockOn={prefs.appLock} veilOn={prefs.privacyScreen} />
      <Toasts />
    </>
  );
}
