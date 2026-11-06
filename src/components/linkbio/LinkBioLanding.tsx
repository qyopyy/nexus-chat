"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Link2, Shield, Sparkles, Star } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { supabase, isConfigured } from "@/lib/supabase";
import { loadProfiles } from "@/lib/data";
import { roleRank } from "@/lib/theme";
import { useApp } from "@/store/app";
import { cn } from "@/lib/utils";

/** Public Nexus Link landing at `/bio` with staff admin entry. */
export default function LinkBioLanding() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const me = useApp((s) => (s.userId ? s.profiles[s.userId] : null));
  const canAdmin = roleRank(me?.site_role) >= 2;

  useEffect(() => {
    if (!isConfigured) {
      setSession(null);
      return;
    }
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const id = session?.user?.id;
    if (!id) {
      useApp.setState({ userId: null });
      return;
    }
    useApp.setState({ userId: id });
    void loadProfiles([id]);
  }, [session?.user?.id]);

  return (
    <div className="relative min-h-dvh overflow-hidden bg-[#07060f] text-white">
      <div
        className="pointer-events-none absolute inset-0 opacity-90"
        style={{
          background:
            "radial-gradient(ellipse at 50% -10%, #3b0a5c 0%, transparent 55%), radial-gradient(ellipse at 80% 80%, #1a053333, transparent 45%), #050208",
        }}
      />
      <div className="pointer-events-none absolute inset-0 opacity-[0.07]" aria-hidden>
        <div className="grid h-full place-items-center font-[900] text-[22vw] tracking-widest text-[#a855f7]" style={{ fontFamily: "Bebas Neue, sans-serif" }}>
          999
        </div>
      </div>

      <div className="relative z-10 mx-auto flex min-h-dvh max-w-3xl flex-col px-5 py-8 sm:py-12">
        <header className="flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-[#a855f7] to-[#7c3aed] shadow-lg shadow-[#a855f7]/30">
            <Link2 className="size-5" />
          </div>
          <div>
            <div className="text-sm font-bold tracking-[0.14em] text-white/55 uppercase">Nexus</div>
            <div className="text-xl font-extrabold tracking-tight">Link</div>
          </div>
          <span className="flex-1" />
          {canAdmin && (
            <Link
              href="/bio/admin"
              className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold ring-1 ring-white/15 hover:bg-white/15"
            >
              <Shield className="size-3.5 text-[#c084fc]" /> Admin
            </Link>
          )}
        </header>

        <main className="flex flex-1 flex-col justify-center py-16">
          <div className="inline-flex items-center gap-2 self-start rounded-full bg-[#a855f7]/15 px-3 py-1 text-xs font-bold text-[#e9d5ff] ring-1 ring-[#a855f7]/35">
            <Sparkles className="size-3.5" /> Link in bio · themes · 999
          </div>
          <h1 className="mt-5 max-w-xl text-4xl font-black tracking-tight sm:text-5xl">
            Your links.
            <span className="block bg-gradient-to-r from-[#e9d5ff] via-[#c084fc] to-[#a855f7] bg-clip-text text-transparent">One glow page.</span>
          </h1>
          <p className="mt-4 max-w-lg text-base text-white/60 sm:text-lg">
            Nexus Link is the invite-only link-in-bio for the crew — Juice 999 themes, Premium, verified checkmarks, and badges. Eligible as Website on TikTok, Snapchat & Facebook verification.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/bio/app"
              className="inline-flex items-center gap-2 rounded-full bg-[#a855f7] px-5 py-3 text-sm font-bold shadow-lg shadow-[#a855f7]/30 hover:bg-[#9333ea]"
            >
              <Sparkles className="size-4" /> {session ? "Open editor" : "Log in · Edit"}
            </Link>
            <a
              href="/bio/qyopy"
              className="inline-flex items-center gap-2 rounded-full bg-white/10 px-5 py-3 text-sm font-bold ring-1 ring-white/10 hover:bg-white/15"
            >
              <Star className="size-4 text-amber-300" /> See example
            </a>
            {canAdmin && (
              <Link
                href="/bio/admin"
                className={cn(
                  "inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-bold",
                  "bg-[#2AABEE]/20 text-[#7dd3fc] ring-1 ring-[#2AABEE]/35 hover:bg-[#2AABEE]/30",
                )}
              >
                <Shield className="size-4" /> Admin panel
              </Link>
            )}
          </div>

          <ul className="mt-12 grid gap-3 text-sm text-white/70 sm:grid-cols-3">
            {[
              ["✓ Verified", "Blue check for notable pages"],
              ["🏅 Badges", "Creator, VIP, Legend & more"],
              ["⭐ Premium", "999 themes & glow effects"],
            ].map(([t, d]) => (
              <li key={t} className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
                <div className="font-bold text-white">{t}</div>
                <div className="mt-1 text-xs text-white/50">{d}</div>
              </li>
            ))}
          </ul>
        </main>

        <footer className="text-center text-xs text-white/40">
          Made with ❤️ by Nexus Project · <a href="https://nexusproject.cc" className="text-[#c084fc] hover:underline">nexusproject.cc</a>
        </footer>
      </div>
    </div>
  );
}
