"use client";

import { Shield, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DNS_PROVIDERS,
  SEARCH_ENGINES,
  type BrowserPrefs,
  type BrowserDnsProviderId,
  type BrowserSearchEngineId,
} from "@/lib/browserPrefs";

function Toggle({
  on,
  onChange,
  label,
  hint,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className="flex w-full items-center gap-3 rounded-xl px-1 py-2.5 text-left transition hover:bg-white/5"
    >
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-white">{label}</div>
        {hint && <div className="text-[11px] text-white/45">{hint}</div>}
      </div>
      <span
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full transition",
          on ? "bg-orange-500" : "bg-white/15",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-5 rounded-full bg-white shadow transition",
            on ? "left-[1.35rem]" : "left-0.5",
          )}
        />
      </span>
    </button>
  );
}

export default function BrowserSettings({
  open,
  prefs,
  onClose,
  onChange,
  onTestDns,
  dnsStatus,
}: {
  open: boolean;
  prefs: BrowserPrefs;
  onClose: () => void;
  onChange: (next: BrowserPrefs) => void;
  onTestDns: () => void;
  dnsStatus?: string | null;
}) {
  if (!open) return null;

  const set = (patch: Partial<BrowserPrefs>) => onChange({ ...prefs, ...patch });
  const setShield = (patch: Partial<BrowserPrefs["shields"]>) =>
    onChange({ ...prefs, shields: { ...prefs.shields, ...patch } });

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
      <div
        className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-[#111827] shadow-2xl ring-1 ring-white/10 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-white/10 bg-[#111827]/95 px-4 py-3 backdrop-blur">
          <Shield className="size-5 text-orange-400" />
          <div className="min-w-0 flex-1">
            <div className="text-base font-bold">Browser settings</div>
            <div className="text-[11px] text-white/45">Shields · DNS · search engines</div>
          </div>
          <button type="button" onClick={onClose} className="grid size-9 place-items-center rounded-full hover:bg-white/10" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>

        <div className="space-y-6 px-4 py-4">
          <section>
            <h3 className="mb-1 text-[11px] font-bold tracking-wide text-orange-300/90 uppercase">Shields</h3>
            <p className="mb-2 text-[11px] leading-relaxed text-white/45">
              Brave-style blocking for ads, trackers, and fingerprinting scripts on pages opened in Nexus Browser.
            </p>
            <div className="rounded-2xl bg-white/[0.04] px-3 ring-1 ring-white/10">
              <Toggle
                on={prefs.shields.enabled}
                onChange={(v) => setShield({ enabled: v })}
                label="Shields up"
                hint="Master switch for privacy blocking"
              />
              <Toggle
                on={prefs.shields.blockAds}
                onChange={(v) => setShield({ blockAds: v })}
                label="Block ads"
                hint="Common ad networks & sponsored frames"
              />
              <Toggle
                on={prefs.shields.blockTrackers}
                onChange={(v) => setShield({ blockTrackers: v })}
                label="Block trackers"
                hint="Analytics, pixels, and beacons"
              />
              <Toggle
                on={prefs.shields.blockFingerprinting}
                onChange={(v) => setShield({ blockFingerprinting: v })}
                label="Block fingerprinting"
                hint="Known fingerprinting / bot scripts"
              />
              <Toggle
                on={prefs.shields.blockScripts}
                onChange={(v) => setShield({ blockScripts: v })}
                label="Block scripts (strict)"
                hint="May break interactive sites"
              />
              <Toggle
                on={prefs.shields.httpsOnly}
                onChange={(v) => setShield({ httpsOnly: v })}
                label="Upgrade to HTTPS"
                hint="Prefer encrypted page loads"
              />
            </div>
          </section>

          <section>
            <h3 className="mb-1 text-[11px] font-bold tracking-wide text-sky-300/90 uppercase">DNS</h3>
            <p className="mb-2 text-[11px] leading-relaxed text-white/45">
              DNS-over-HTTPS for proxied browsing. NextDNS uses your config ID to block domains before pages load. This does not change device-wide DNS — only Nexus Browser fetches.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {DNS_PROVIDERS.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => set({ dns: d.id as BrowserDnsProviderId })}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-[11px] font-bold transition",
                    prefs.dns === d.id ? "bg-sky-500 text-[#0b1220]" : "bg-white/10 text-white/70 hover:bg-white/15",
                  )}
                  title={d.hint}
                >
                  {d.label}
                </button>
              ))}
            </div>
            {prefs.dns === "nextdns" && (
              <label className="mt-3 block text-[11px] font-semibold text-white/50">
                NextDNS config ID
                <input
                  value={prefs.nextDnsConfig}
                  onChange={(e) => set({ nextDnsConfig: e.target.value })}
                  placeholder="e.g. abc123"
                  className="mt-1.5 w-full rounded-xl bg-black/30 px-3 py-2.5 text-sm font-medium text-white outline-none ring-1 ring-white/10 focus:ring-sky-500"
                />
                <span className="mt-1 block font-normal text-white/35">
                  Find it in your NextDNS dashboard → Setup. Leave empty for public NextDNS resolver.
                </span>
              </label>
            )}
            {prefs.dns === "custom" && (
              <label className="mt-3 block text-[11px] font-semibold text-white/50">
                Custom DoH URL
                <input
                  value={prefs.customDohUrl}
                  onChange={(e) => set({ customDohUrl: e.target.value })}
                  placeholder="https://dns.example.com/dns-query"
                  className="mt-1.5 w-full rounded-xl bg-black/30 px-3 py-2.5 text-sm font-medium text-white outline-none ring-1 ring-white/10 focus:ring-sky-500"
                />
              </label>
            )}
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={onTestDns}
                className="rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-white/15"
              >
                Test DNS
              </button>
              {dnsStatus && <span className="min-w-0 truncate text-[11px] text-white/50">{dnsStatus}</span>}
            </div>
          </section>

          <section>
            <h3 className="mb-1 text-[11px] font-bold tracking-wide text-violet-300/90 uppercase">Search engine</h3>
            <div className="flex flex-wrap gap-1.5">
              {SEARCH_ENGINES.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => set({ engine: e.id as BrowserSearchEngineId })}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-[11px] font-bold transition",
                    prefs.engine === e.id ? "bg-violet-400 text-[#0b1220]" : "bg-white/10 text-white/70 hover:bg-white/15",
                  )}
                  title={e.hint}
                >
                  {e.label}
                </button>
              ))}
            </div>
            {prefs.engine === "custom" && (
              <label className="mt-3 block text-[11px] font-semibold text-white/50">
                Custom search URL
                <input
                  value={prefs.customSearchUrl}
                  onChange={(e) => set({ customSearchUrl: e.target.value })}
                  placeholder="https://example.com/search?q={q}"
                  className="mt-1.5 w-full rounded-xl bg-black/30 px-3 py-2.5 text-sm font-medium text-white outline-none ring-1 ring-white/10 focus:ring-violet-400"
                />
                <span className="mt-1 block font-normal text-white/35">Use {"{q}"} where the query should go.</span>
              </label>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
