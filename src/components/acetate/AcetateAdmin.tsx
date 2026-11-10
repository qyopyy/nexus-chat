"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import Link from "next/link";
import { supabase, isConfigured } from "@/lib/supabase";
import { mfaNeedsChallenge } from "@/lib/mfa";
import { useApp } from "@/store/app";
import { roleRank } from "@/lib/theme";
import AuthScreen, { ResetPasswordScreen } from "@/components/AuthScreen";
import SetupScreen from "@/components/SetupScreen";
import Toasts from "@/components/ui/Toasts";
import { fmtBytes } from "@/lib/acetateAudio";
import { reportAcetateError, searchAcetateUsers, setAcetatePremium, type AcetateAdminRow } from "@/lib/acetate";
import { AcetateMark } from "./AcetateBits";

export default function AcetateAdmin() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [recovering, setRecovering] = useState(false);
  const [needsMfa, setNeedsMfa] = useState(false);
  const [ready, setReady] = useState(false);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<AcetateAdminRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const userId = session?.user.id ?? null;
  const me = useApp((s) => (userId ? s.profiles[userId] : undefined));
  const admin = roleRank(me?.site_role) >= 3;

  useEffect(() => {
    if (!isConfigured) return;
    const pending = supabase.auth.getSession().then(({ data }) => data.session ?? null);
    const timed = new Promise<null>((resolve) => setTimeout(() => resolve(null), 6000));
    void Promise.race([pending, timed])
      .then((next) => setSession((current) => (current === undefined ? next : current)))
      .catch(() => setSession((current) => (current === undefined ? null : current)));
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
    let live = true;
    useApp.setState({ userId });
    void supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single()
      .then(({ data }) => {
        if (!live || !data) return;
        useApp.setState((s) => ({ profiles: { ...s.profiles, [userId]: data } }));
        setReady(true);
      });
    return () => {
      live = false;
    };
  }, [userId, needsMfa]);

  async function search(event?: React.FormEvent) {
    event?.preventDefault();
    try {
      setRows(await searchAcetateUsers(q));
    } catch (e) {
      reportAcetateError(e);
    }
  }

  async function toggle(row: AcetateAdminRow) {
    setBusy(row.id);
    try {
      await setAcetatePremium(row.id, row.tier !== "premium");
      setRows(await searchAcetateUsers(q));
    } catch (e) {
      reportAcetateError(e);
    } finally {
      setBusy(null);
    }
  }

  if (!isConfigured) return <SetupScreen />;
  if (session === undefined || (session && !needsMfa && !ready)) {
    return <div className="grid h-full place-items-center bg-[#100e0c]"><div className="size-10 animate-spin rounded-full border-4 border-[#e4a15a] border-t-transparent" /></div>;
  }
  if (recovering && session) return <ResetPasswordScreen onDone={() => setRecovering(false)} />;
  if (!session) return <AuthScreen initialMode="login" />;
  if (needsMfa) return <AuthScreen initialMode="mfa" />;

  return (
    <div className="h-full overflow-y-auto bg-[#100e0c] text-[#f3eadf]">
      <Toasts />
      <header className="mx-auto flex max-w-3xl items-center justify-between px-5 py-5">
        <Link href="/acetate/app" className="flex items-center gap-2">
          <AcetateMark size={28} />
          <span className="font-serif text-xl">Acetate admin</span>
        </Link>
        <Link href="/acetate/app" className="text-sm text-[#a3988c]">Library</Link>
      </header>
      <main className="mx-auto max-w-3xl px-5 pb-16">
        {admin ? (
          <>
            <p className="text-sm text-[#a3988c]">
              Granting Premium here is lifetime: no expiry, unlimited storage. The role check runs in the database — Nexus admins and the owner only.
            </p>
            <form onSubmit={(e) => void search(e)} className="mt-4 flex gap-2">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search username or name"
                className="flex-1 rounded-2xl border border-[#3c342c] bg-[#1a1612] px-4 py-3 outline-none focus:border-[#e4a15a]"
              />
              <button type="submit" className="rounded-2xl bg-[#e4a15a] px-4 font-semibold text-[#100e0c]">Search</button>
            </form>
            <ul className="mt-4 space-y-2">
              {rows.map((row) => (
                <li key={row.id} className="flex items-center gap-3 rounded-2xl border border-[#3c342c] bg-[#1a1612] px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{row.display_name}</div>
                    <div className="truncate text-sm text-[#a3988c]">
                      @{row.username} · {fmtBytes(Number(row.bytes))} · {row.tier === "premium" ? (row.lifetime ? "Lifetime Premium" : "Premium") : "Free"}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={busy === row.id}
                    onClick={() => void toggle(row)}
                    className="rounded-full border border-[#e4a15a]/50 px-3 py-1.5 text-sm font-semibold text-[#e4a15a] disabled:opacity-50"
                  >
                    {row.tier === "premium" ? "Revoke" : "Grant lifetime"}
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <div className="rounded-3xl border border-[#3c342c] bg-[#1a1612] p-6">
            <h1 className="font-serif text-3xl">Nexus admins only</h1>
            <p className="mt-2 text-[#a3988c]">
              Your account is signed in, and the server will refuse a grant from anyone below admin. The first Nexus account is the owner — they can promote someone in Nexus Settings → Admin Panel.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
