"use client";

import { useEffect, useState } from "react";
import { Ban } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/types";

export default function BannedScreen({ profile }: { profile: Profile }) {
  const perma = profile.banned_until === "infinity";
  const until = perma ? null : new Date(profile.banned_until!);
  const [, tick] = useState(0);

  useEffect(() => {
    if (perma) return;
    const t = setInterval(() => {
      tick((n) => n + 1);
      if (until && until.getTime() <= Date.now()) window.location.reload();
    }, 1000);
    return () => clearInterval(t);
  }, [perma, profile.banned_until]); // eslint-disable-line react-hooks/exhaustive-deps

  const left = until ? Math.max(0, until.getTime() - Date.now()) : 0;
  const mins = Math.floor(left / 60000);
  const secs = Math.floor((left % 60000) / 1000);

  return (
    <div className="auth-bg grid h-full place-items-center p-4">
      <div className="w-full max-w-md animate-pop rounded-3xl border border-white/10 bg-black/50 p-8 text-center backdrop-blur-xl">
        <div className="mx-auto mb-4 grid size-16 place-items-center rounded-2xl bg-dnd/20">
          <Ban className="size-8 text-dnd" />
        </div>
        <h1 className="text-2xl font-bold text-white">{perma ? "Your account is banned" : "You're timed out"}</h1>
        {profile.ban_reason && <p className="mt-2 text-white/70">Reason: {profile.ban_reason}</p>}
        {!perma && (
          <p className="mt-4 font-mono text-3xl text-white tabular-nums">
            {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
          </p>
        )}
        <p className="mt-4 text-sm text-white/50">{perma ? "Contact a site admin if you think this is a mistake." : "You'll be let back in automatically."}</p>
        <button onClick={() => void supabase.auth.signOut()} className="mt-6 rounded-xl bg-white/10 px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/20">
          Log out
        </button>
      </div>
    </div>
  );
}
