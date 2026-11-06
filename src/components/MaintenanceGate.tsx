"use client";

import { useCallback, useEffect, useState } from "react";
import { Construction, Sparkles } from "lucide-react";
import { useApp } from "@/store/app";
import { can, fetchMaintenance, setMaintenance, type SiteNotice } from "@/lib/privileges";
import { roleRank } from "@/lib/theme";
import { cn } from "@/lib/utils";

/**
 * When admins enable development / updating mode, non-staff members see this
 * full-screen “we'll be back soon” gate instead of the app chrome.
 */
export default function MaintenanceGate({ children }: { children: React.ReactNode }) {
  const userId = useApp((s) => s.userId);
  const role = useApp((s) => (s.userId ? s.profiles[s.userId]?.site_role : null));
  const staff = roleRank(role) >= 2;
  const [maint, setMaint] = useState<SiteNotice | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(() => {
    void fetchMaintenance().then((n) => {
      setMaint(n);
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    load();
    const on = () => load();
    window.addEventListener("nexus:maintenance", on);
    const t = setInterval(load, 30_000);
    return () => {
      window.removeEventListener("nexus:maintenance", on);
      clearInterval(t);
    };
  }, [load]);

  const active = !!maint?.active;
  // Staff always get through; guests / members see the gate
  if (!loaded) return <>{children}</>;
  if (!active || staff) {
    return (
      <>
        {active && staff && (
          <div className="flex shrink-0 items-center gap-2 border-b border-amber-400/30 bg-amber-400/15 px-3 py-1.5 text-xs font-semibold text-amber-100">
            <Construction className="size-3.5 shrink-0" />
            Development mode is ON — members see “we&apos;ll be back soon”
            {can.maintenance() && (
              <button
                type="button"
                className="ml-auto rounded-full bg-white/15 px-2.5 py-0.5 font-bold hover:bg-white/25"
                onClick={() => void setMaintenance(false)}
              >
                Turn off
              </button>
            )}
          </div>
        )}
        {children}
      </>
    );
  }

  return (
    <div className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden bg-[#07060f] px-6 text-center text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,rgba(168,85,247,.35),transparent_55%),radial-gradient(ellipse_at_80%_80%,rgba(0,168,252,.2),transparent_50%)]" />
      <div className="relative max-w-md">
        <div className="mx-auto mb-5 grid size-16 place-items-center rounded-3xl bg-white/10 ring-1 ring-white/15">
          <Sparkles className="size-8 text-[#c084fc]" />
        </div>
        <p className="mb-2 text-[11px] font-black tracking-[0.18em] text-[#c084fc] uppercase">Updating</p>
        <h1 className="text-3xl font-black tracking-tight">We&apos;ll be back soon</h1>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-white/70">
          {maint?.body?.trim() || "Nexus is updating. Hang tight — thanks for your patience."}
        </p>
        <p className="mt-6 text-[11px] font-semibold tracking-[0.14em] text-white/35 uppercase">Nexus · we&apos;ll be back soon</p>
        {userId && (
          <p className={cn("mt-8 text-xs text-white/40")}>Signed in — staff can still open the app once development mode is off.</p>
        )}
      </div>
    </div>
  );
}
