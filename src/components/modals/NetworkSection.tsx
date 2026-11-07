"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Download, Globe, Loader2, Shield, Wifi } from "lucide-react";
import { toast } from "@/store/app";
import { cn } from "@/lib/utils";
import { loadTurn } from "@/lib/call";
import { DNS_PRESETS, cleanNextDnsId, loadNetPrefs, resolvePreset, saveNetPrefs, type NetPrefs } from "@/lib/netPrefs";

const H = ({ children }: { children: React.ReactNode }) => <h2 className="mb-5 text-xl font-bold">{children}</h2>;
const Label = ({ children }: { children: React.ReactNode }) => <div className="mb-2 text-xs font-bold tracking-wide text-sub uppercase">{children}</div>;
const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

function copy(t: string) {
  void navigator.clipboard?.writeText(t);
  toast("Copied", "success");
}
function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-rail px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-semibold text-sub">{label}</div>
        <div className="truncate font-mono text-[13px]">{value}</div>
        {hint && <div className="text-[11px] text-faint">{hint}</div>}
      </div>
      <button onClick={() => copy(value)} className="grid size-8 shrink-0 place-items-center rounded-md hover:bg-hover" aria-label={`Copy ${label}`}>
        <Copy className="size-4" />
      </button>
    </div>
  );
}
function Toggle({ on, onChange, label, hint, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: React.ReactNode; disabled?: boolean }) {
  return (
    <button disabled={disabled} onClick={() => onChange(!on)} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-hover disabled:opacity-50">
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{label}</span>
        {hint && <span className="block text-xs text-sub">{hint}</span>}
      </span>
      <span className={cn("relative h-6 w-11 shrink-0 rounded-full transition", on ? "bg-ok" : "bg-rail")}>
        <span className={cn("absolute top-0.5 size-5 rounded-full bg-white transition-all", on ? "left-[22px]" : "left-0.5")} />
      </span>
    </button>
  );
}

/** Settings → Network & ad blocking */
export default function NetworkSection() {
  const [p, setP] = useState<NetPrefs>(() => loadNetPrefs());
  const set = (patch: Partial<NetPrefs>) =>
    setP((cur) => {
      const next = { ...cur, ...patch };
      saveNetPrefs(next);
      return next;
    });
  const [relay, setRelay] = useState<{ servers: number; provider: string } | null>(null);
  useEffect(() => {
    void loadTurn(true).then(setRelay);
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <H>Network & ad blocking</H>
        <p className="-mt-3 text-sm text-sub">Privacy options for Nexus, plus encrypted ad-blocking DNS for your whole phone or computer.</p>
      </div>

      <div>
        <Label>In Nexus</Label>
        <div className="rounded-2xl bg-side p-1">
          <Toggle
            on={p.relayCalls}
            onChange={(v) => set({ relayCalls: v })}
            disabled={relay !== null && relay.servers === 0}
            label="Hide my IP address in calls"
            hint={
              relay === null
                ? "Checking the relay server…"
                : relay.servers === 0
                  ? "Needs a relay (TURN) server — an admin can add Cloudflare TURN in Supabase secrets."
                  : `Calls go through the ${relay.provider === "cloudflare" ? "Cloudflare" : "Nexus"} relay, so people in the call can't see your IP. Applies to your next call.`
            }
          />
          <Toggle on={p.stripTrackers} onChange={(v) => set({ stripTrackers: v })} label="Remove trackers from links I send" hint="Strips utm_, fbclid, gclid, Spotify/YouTube si= and similar from links before they're sent." />
          <Toggle on={p.mediaProxy} onChange={(v) => set({ mediaProxy: v })} label="Load link previews through Nexus" hint="Preview images come via Nexus, so websites in links can't see your IP address." />
        </div>
      </div>

      <DnsSetup p={p} set={set} />
      <ProxySetup />
    </div>
  );
}

// ───────────────────────── DNS ─────────────────────────
function DnsSetup({ p, set }: { p: NetPrefs; set: (x: Partial<NetPrefs>) => void }) {
  const [test, setTest] = useState<{ reachable: boolean; blocked: number; tested: number; ms: number } | { error: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [device, setDevice] = useState<{ blocked: number; tested: number } | null>(null);
  const isCustom = p.dns === "custom";
  const preset = useMemo(() => (isCustom ? null : resolvePreset(p.dns, p.nextDnsId)), [p.dns, p.nextDnsId, isCustom]);
  const raw = DNS_PRESETS.find((x) => x.id === p.dns);
  const customIps = p.customIps.split(/[\s,]+/).filter((x) => IPV4.test(x) || x.includes(":"));
  const doh = isCustom ? p.customDoh.trim() : (preset?.doh ?? "");
  const dot = isCustom ? p.customDot.trim() : (preset?.dot ?? "");
  const v4 = isCustom ? customIps.filter((x) => IPV4.test(x)) : (preset?.v4 ?? []);
  const v6 = isCustom ? customIps.filter((x) => x.includes(":")) : (preset?.v6 ?? []);
  const profileUrl = isCustom
    ? doh || dot
      ? `/api/dns-profile?p=custom&doh=${encodeURIComponent(doh)}&dot=${encodeURIComponent(dot)}&ips=${encodeURIComponent(customIps.join(","))}`
      : null
    : preset
      ? `/api/dns-profile?p=${preset.id}${preset.id === "nextdns" ? `&id=${cleanNextDnsId(p.nextDnsId)}` : ""}`
      : null;

  const runTest = async () => {
    setTesting(true);
    setTest(null);
    try {
      const q = isCustom ? `p=custom&doh=${encodeURIComponent(doh)}` : `p=${p.dns}&id=${encodeURIComponent(cleanNextDnsId(p.nextDnsId))}`;
      const r = await fetch(`/api/dns-test?${q}`);
      setTest(await r.json());
    } catch {
      setTest({ error: "Couldn't run the test" });
    }
    // is THIS device blocking ads right now? (ad hosts fail to load when a blocker is active)
    const hosts = ["https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js", "https://static.doubleclick.net/instream/ad_status.js", "https://connect.facebook.net/en_US/fbevents.js"];
    const res = await Promise.all(
      hosts.map((u) =>
        fetch(u, { mode: "no-cors", cache: "no-store", signal: AbortSignal.timeout(4000) }).then(
          () => false,
          () => true,
        ),
      ),
    );
    setDevice({ blocked: res.filter(Boolean).length, tested: hosts.length });
    setTesting(false);
  };

  return (
    <div>
      <Label>Ad-blocking DNS for your device</Label>
      <p className="mb-3 text-sm text-sub">Blocks ads and trackers in every app and browser — not just Nexus. Pick a provider, then install it on your device below.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {[...DNS_PRESETS, { id: "custom", name: "Custom", blurb: "Your own DoH / DoT / IP addresses", blocks: [] as string[] }].map((x) => (
          <button
            key={x.id}
            onClick={() => {
              set({ dns: x.id });
              setTest(null);
            }}
            className={cn("flex items-start gap-2.5 rounded-xl p-3 text-left ring-1 transition", p.dns === x.id ? "bg-accent/15 ring-accent" : "bg-side ring-transparent hover:bg-hover")}
          >
            <Shield className={cn("mt-0.5 size-4 shrink-0", p.dns === x.id ? "text-accent" : "text-sub")} />
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{x.name}</span>
              <span className="block text-xs text-sub">{x.blurb}</span>
              {x.blocks.length > 0 && (
                <span className="mt-1 flex flex-wrap gap-1">
                  {x.blocks.map((b) => (
                    <span key={b} className="rounded bg-black/25 px-1.5 text-[10px] font-bold text-sub uppercase">
                      {b}
                    </span>
                  ))}
                </span>
              )}
            </span>
          </button>
        ))}
      </div>

      {p.dns === "nextdns" && (
        <div className="mt-3">
          <input
            value={p.nextDnsId}
            onChange={(e) => set({ nextDnsId: cleanNextDnsId(e.target.value) })}
            placeholder="NextDNS config ID (6 characters, e.g. abc123)"
            className="w-full rounded-md bg-rail px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-accent/60"
          />
          <p className="mt-1 text-xs text-sub">
            Find it at{" "}
            <a href="https://my.nextdns.io" target="_blank" rel="noreferrer" className="text-accent hover:underline">
              my.nextdns.io
            </a>{" "}
            → Setup. Your blocklists and allowlist are managed there.
          </p>
        </div>
      )}
      {isCustom && (
        <div className="mt-3 space-y-2">
          <input value={p.customDoh} onChange={(e) => set({ customDoh: e.target.value.trim() })} placeholder="DNS-over-HTTPS URL — https://dns.example.com/dns-query" className="w-full rounded-md bg-rail px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-accent/60" />
          <input value={p.customDot} onChange={(e) => set({ customDot: e.target.value.trim() })} placeholder="DNS-over-TLS hostname — dns.example.com (optional)" className="w-full rounded-md bg-rail px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-accent/60" />
          <input value={p.customIps} onChange={(e) => set({ customIps: e.target.value })} placeholder="IP addresses — e.g. 192.168.1.2, 2001:db8::53 (Pi-hole, AdGuard Home…)" className="w-full rounded-md bg-rail px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-accent/60" />
        </div>
      )}

      {(preset || isCustom) && (
        <div className="mt-4 space-y-4 rounded-2xl bg-side p-4">
          <div>
            <div className="mb-1.5 flex items-center gap-2 text-sm font-bold">📱 iPhone, iPad & Mac</div>
            {profileUrl ? (
              <>
                <a href={profileUrl} target="_blank" rel="noreferrer" className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent py-2.5 text-sm font-bold text-white hover:bg-accent-2">
                  <Download className="size-4" /> Install {isCustom ? "custom DNS" : raw?.name} profile
                </a>
                <p className="mt-1.5 text-xs text-sub">Opens in Safari → Allow → then Settings → Profile Downloaded → Install. On a Mac: System Settings → Privacy & Security → Profiles. Turn it on in Settings → General → VPN & Device Management → DNS.</p>
              </>
            ) : (
              <p className="text-xs text-sub">{isCustom ? "Add a DoH URL or DoT hostname — Apple only supports encrypted DNS in profiles. With IPs only, set them by hand: Settings → Wi-Fi → (i) → Configure DNS → Manual." : "Enter your config ID first."}</p>
            )}
          </div>
          {dot && (
            <div>
              <div className="mb-1.5 text-sm font-bold">🤖 Android</div>
              <Row label="Private DNS hostname" value={dot} hint="Settings → Network & internet → Private DNS → Private DNS provider hostname" />
            </div>
          )}
          {doh && (
            <div>
              <div className="mb-1.5 text-sm font-bold">💻 Windows, Chrome, Edge, Firefox</div>
              <Row label="DNS-over-HTTPS URL" value={doh} hint="Chrome: Settings → Privacy → Use secure DNS → Custom · Windows 11: Network → DNS → Encrypted only" />
            </div>
          )}
          {(v4.length > 0 || v6.length > 0) && (
            <div>
              <div className="mb-1.5 flex items-center gap-1.5 text-sm font-bold">
                <Wifi className="size-4" /> Router / Wi-Fi (whole home)
              </div>
              <div className="space-y-1.5">
                {v4.length > 0 && <Row label="IPv4 DNS servers" value={v4.join(", ")} hint={raw && !raw.plain ? "Encrypted DNS only — these won't work as plain router DNS" : undefined} />}
                {v6.length > 0 && <Row label="IPv6 DNS servers" value={v6.join(", ")} />}
              </div>
            </div>
          )}
          <div className="border-t border-line pt-3">
            <button onClick={() => void runTest()} disabled={testing || (isCustom && !doh)} className="flex items-center gap-2 rounded-lg bg-hover px-3 py-2 text-sm font-semibold hover:bg-active disabled:opacity-50">
              {testing ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Test it
            </button>
            {test && "error" in test && <p className="mt-2 text-xs text-dnd">{test.error}</p>}
            {test && !("error" in test) && (
              <p className="mt-2 text-xs text-sub">
                Resolver {test.reachable ? `works (${test.ms} ms)` : "didn't answer"} · blocks <b className="text-txt">{test.blocked}</b> of {test.tested} ad/tracker domains.
              </p>
            )}
            {device && (
              <p className="mt-1 text-xs text-sub">
                This device right now: {device.blocked === device.tested ? <b className="text-ok">ads are blocked ✓</b> : device.blocked > 0 ? <b className="text-idle">partly blocked ({device.blocked}/{device.tested})</b> : <b className="text-txt">ads are not blocked yet</b>}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ───────────────────────── proxy ─────────────────────────
function ProxySetup() {
  const [type, setType] = useState("socks5");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("");
  const [bypass, setBypass] = useState("");
  const [direct, setDirect] = useState(true);
  const ok = /^[a-z0-9.-]+$/i.test(host.trim()) && host.includes(".") && Number(port) >= 1 && Number(port) <= 65535;
  const pacUrl = ok
    ? `${typeof window !== "undefined" ? window.location.origin : "https://nexusproject.cc"}/api/proxy-pac?type=${type}&host=${encodeURIComponent(host.trim())}&port=${Number(port)}${direct ? "&direct=1" : ""}${bypass.trim() ? `&bypass=${encodeURIComponent(bypass.trim())}` : ""}`
    : null;
  return (
    <div>
      <Label>Proxy server</Label>
      <p className="mb-3 text-sm text-sub">Use your own HTTP or SOCKS5 proxy (school / work network, or a server you run). Nexus makes an auto-config link your device can use.</p>
      <div className="space-y-2 rounded-2xl bg-side p-4">
        <div className="flex flex-wrap gap-1 rounded-lg bg-rail p-1">
          {[
            ["socks5", "SOCKS5"],
            ["http", "HTTP"],
            ["https", "HTTPS"],
            ["socks4", "SOCKS4"],
          ].map(([id, label]) => (
            <button key={id} onClick={() => setType(id)} className={cn("flex-1 rounded-md py-1.5 text-sm font-semibold", type === id ? "bg-accent text-white" : "text-sub")}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input value={host} onChange={(e) => setHost(e.target.value)} placeholder="proxy.example.com or 1.2.3.4" className="min-w-0 flex-1 rounded-md bg-rail px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-accent/60" />
          <input value={port} onChange={(e) => setPort(e.target.value.replace(/\D/g, "").slice(0, 5))} placeholder="Port" inputMode="numeric" className="w-24 rounded-md bg-rail px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-accent/60" />
        </div>
        <input value={bypass} onChange={(e) => setBypass(e.target.value)} placeholder="Don't proxy (optional): *.bank.com, example.org" className="w-full rounded-md bg-rail px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-accent/60" />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={direct} onChange={(e) => setDirect(e.target.checked)} className="accent-[var(--color-accent)]" /> Go direct if the proxy is down
        </label>
        {pacUrl ? (
          <>
            <Row label="Auto-config (PAC) URL" value={pacUrl} />
            <p className="text-xs text-sub">
              <Globe className="mr-1 inline size-3.5" />
              iPhone: Settings → Wi-Fi → (i) → Configure Proxy → Automatic → paste. Mac: Network → Details → Proxies → Automatic proxy configuration. Windows: Settings → Proxy → Use setup script. Android: Wi-Fi → Edit → Proxy → Auto-config.
            </p>
          </>
        ) : (
          <p className="text-xs text-faint">Enter the proxy address and port to get your setup link.</p>
        )}
      </div>
    </div>
  );
}
