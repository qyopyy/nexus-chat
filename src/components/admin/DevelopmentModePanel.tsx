"use client";

import { useEffect, useState } from "react";
import { Construction } from "lucide-react";
import { can, fetchMaintenance, setMaintenance, type SiteNotice } from "@/lib/privileges";
import { Toggle } from "@/components/modals/settingsUi";
import { cn } from "@/lib/utils";

const DEFAULT_BODY = "We'll be back soon — Nexus is updating.\nHang tight while we ship improvements.";

/** Admin-only development / updating mode — Settings toggle + message. */
export default function DevelopmentModePanel({ variant = "settings" }: { variant?: "settings" | "admin" | "staff" }) {
  const [maint, setMaint] = useState<SiteNotice | null>(null);
  const [body, setBody] = useState(DEFAULT_BODY);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetchMaintenance().then((n) => {
      setMaint(n);
      setBody(n?.body?.trim() || DEFAULT_BODY);
    });
    const on = () =>
      void fetchMaintenance().then((n) => {
        setMaint(n);
        if (n?.body?.trim()) setBody(n.body);
      });
    window.addEventListener("nexus:maintenance", on);
    return () => window.removeEventListener("nexus:maintenance", on);
  }, []);

  if (!can.maintenance()) {
    return <p className="text-sm text-sub">Only admins can enable development / updating mode.</p>;
  }

  const on = !!maint?.active;
  const staffish = variant === "staff";

  async function toggle(next: boolean) {
    if (busy) return;
    setBusy(true);
    const ok = await setMaintenance(next, body);
    if (ok) setMaint((n) => (n ? { ...n, body, active: next } : { id: "maintenance", body, active: next, author_id: null, updated_at: new Date().toISOString() }));
    setBusy(false);
  }

  return (
    <div className="space-y-4">
      <div
        className={cn(
          "rounded-xl border p-4",
          on
            ? staffish
              ? "border-amber-400/40 bg-amber-400/15"
              : "border-amber-400/30 bg-amber-400/10"
            : staffish
              ? "border-white/10 bg-white/5"
              : "border-line bg-side/50",
        )}
      >
        <div className={cn("flex items-center gap-2 font-bold", staffish || on ? "text-amber-100" : "text-txt")}>
          <Construction className="size-5 shrink-0" />
          Development / updating mode
        </div>
        <p className={cn("mt-1 text-sm", staffish ? "text-white/60" : "text-sub")}>
          When enabled, everyone except staff sees a full-screen <b>We&apos;ll be back soon</b> page that says Nexus is updating. Admins and mods can still use the app and turn this off.
        </p>
      </div>

      <Toggle
        label={on ? "Development mode is ON" : "Development mode is OFF"}
        hint={on ? "Members are blocked with “we'll be back soon / updating”." : "Turn on while you ship updates."}
        checked={on}
        onChange={(v) => void toggle(v)}
      />

      <div>
        <label className={cn("mb-2 block text-xs font-bold tracking-wide uppercase", staffish ? "text-white/45" : "text-sub")}>
          Message members see
        </label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, 280))}
          rows={4}
          disabled={busy}
          placeholder={DEFAULT_BODY}
          className={cn(
            "w-full resize-none rounded-xl px-3 py-2.5 text-sm outline-none",
            staffish
              ? "border border-white/10 bg-white/5 focus:border-white/25"
              : "border border-line bg-side focus:border-accent",
          )}
        />
        <p className={cn("mt-1 text-[11px]", staffish ? "text-white/35" : "text-faint")}>{body.length}/280</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || on}
          className="rounded-full bg-amber-500 px-4 py-2 text-sm font-bold text-black disabled:opacity-40"
          onClick={() => void toggle(true)}
        >
          Enable updating mode
        </button>
        <button
          type="button"
          disabled={busy || !on}
          className={cn("rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-40", staffish ? "bg-white/10" : "bg-hover")}
          onClick={() => void toggle(false)}
        >
          Turn off
        </button>
        <button
          type="button"
          disabled={busy}
          className={cn("rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-40", staffish ? "bg-white/10" : "bg-hover")}
          onClick={async () => {
            setBusy(true);
            if (await setMaintenance(on, body)) setMaint((n) => (n ? { ...n, body } : n));
            setBusy(false);
          }}
        >
          Save message
        </button>
      </div>
    </div>
  );
}
