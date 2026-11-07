/** Network & privacy options for the Nexus app (per device) + ad-blocking DNS presets. */

export type NetPrefs = {
  /** route calls through a TURN relay so other people never see your IP */
  relayCalls: boolean;
  /** remove utm_/fbclid/si=… tracking junk from links you send */
  stripTrackers: boolean;
  /** load link-preview images through Nexus so websites can't see your IP */
  mediaProxy: boolean;
  /** last chosen DNS preset in the setup panel */
  dns: string;
  nextDnsId: string;
  customDoh: string;
  customDot: string;
  customIps: string;
};

export const NET_KEY = "nexus:net:v1";
export const DEFAULT_NET: NetPrefs = { relayCalls: false, stripTrackers: true, mediaProxy: false, dns: "adguard", nextDnsId: "", customDoh: "", customDot: "", customIps: "" };

export function loadNetPrefs(): NetPrefs {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(NET_KEY) : null;
    return { ...DEFAULT_NET, ...(raw ? (JSON.parse(raw) as Partial<NetPrefs>) : {}) };
  } catch {
    return { ...DEFAULT_NET };
  }
}
export function saveNetPrefs(p: NetPrefs) {
  try {
    localStorage.setItem(NET_KEY, JSON.stringify(p));
  } catch {
    /* private mode */
  }
}

// ───────────── DNS presets ─────────────
export type DnsPreset = {
  id: string;
  name: string;
  blurb: string;
  blocks: ("ads" | "trackers" | "malware" | "adult")[];
  doh: string;
  dot: string;
  v4: string[];
  v6: string[];
  /** plain DNS on port 53 works for routers / manual Wi-Fi */
  plain: boolean;
};

export const DNS_PRESETS: DnsPreset[] = [
  { id: "adguard", name: "AdGuard DNS", blurb: "Blocks ads & trackers everywhere", blocks: ["ads", "trackers"], doh: "https://dns.adguard-dns.com/dns-query", dot: "dns.adguard-dns.com", v4: ["94.140.14.14", "94.140.15.15"], v6: ["2a10:50c0::ad1:ff", "2a10:50c0::ad2:ff"], plain: true },
  { id: "adguard-family", name: "AdGuard Family", blurb: "Ads, trackers + adult sites, safe search", blocks: ["ads", "trackers", "adult"], doh: "https://family.adguard-dns.com/dns-query", dot: "family.adguard-dns.com", v4: ["94.140.14.15", "94.140.15.16"], v6: ["2a10:50c0::bad1:ff", "2a10:50c0::bad2:ff"], plain: true },
  { id: "nextdns", name: "NextDNS", blurb: "Your own blocklists — needs your config ID", blocks: ["ads", "trackers", "malware"], doh: "https://dns.nextdns.io/{id}", dot: "{id}.dns.nextdns.io", v4: [], v6: [], plain: false },
  { id: "cloudflare", name: "Cloudflare 1.1.1.1", blurb: "Fastest, private — no blocking", blocks: [], doh: "https://cloudflare-dns.com/dns-query", dot: "one.one.one.one", v4: ["1.1.1.1", "1.0.0.1"], v6: ["2606:4700:4700::1111", "2606:4700:4700::1001"], plain: true },
  { id: "cloudflare-security", name: "Cloudflare Security", blurb: "Blocks malware & phishing", blocks: ["malware"], doh: "https://security.cloudflare-dns.com/dns-query", dot: "security.cloudflare-dns.com", v4: ["1.1.1.2", "1.0.0.2"], v6: ["2606:4700:4700::1112", "2606:4700:4700::1002"], plain: true },
  { id: "cloudflare-family", name: "Cloudflare Family", blurb: "Malware + adult content", blocks: ["malware", "adult"], doh: "https://family.cloudflare-dns.com/dns-query", dot: "family.cloudflare-dns.com", v4: ["1.1.1.3", "1.0.0.3"], v6: ["2606:4700:4700::1113", "2606:4700:4700::1003"], plain: true },
  { id: "controld", name: "Control D (Ads)", blurb: "Free ad & tracker blocking", blocks: ["ads", "trackers", "malware"], doh: "https://freedns.controld.com/p2", dot: "p2.freedns.controld.com", v4: ["76.76.2.2", "76.76.10.2"], v6: ["2606:1a40::2", "2606:1a40:1::2"], plain: true },
  { id: "mullvad", name: "Mullvad Adblock", blurb: "No-logs, blocks ads & trackers (encrypted only)", blocks: ["ads", "trackers"], doh: "https://adblock.dns.mullvad.net/dns-query", dot: "adblock.dns.mullvad.net", v4: ["194.242.2.3"], v6: ["2a07:e340::3"], plain: false },
  { id: "quad9", name: "Quad9", blurb: "Blocks malicious domains, Swiss privacy", blocks: ["malware"], doh: "https://dns.quad9.net/dns-query", dot: "dns.quad9.net", v4: ["9.9.9.9", "149.112.112.112"], v6: ["2620:fe::fe", "2620:fe::9"], plain: true },
];

export const cleanNextDnsId = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12);

/** fill in NextDNS id; returns null when the preset needs an id that isn't set */
export function resolvePreset(id: string, nextDnsId: string): DnsPreset | null {
  const p = DNS_PRESETS.find((x) => x.id === id);
  if (!p) return null;
  if (p.id !== "nextdns") return p;
  const nid = cleanNextDnsId(nextDnsId);
  if (!/^[a-z0-9]{6}$/.test(nid)) return null;
  return {
    ...p,
    doh: p.doh.replace("{id}", nid),
    dot: p.dot.replace("{id}", nid),
    v6: [`2a07:a8c0::${nid.slice(0, 2)}:${nid.slice(2)}`, `2a07:a8c1::${nid.slice(0, 2)}:${nid.slice(2)}`],
  };
}

// ───────────── tracker stripping ─────────────
const TRACK_PARAMS = /^(utm_[a-z_]+|fbclid|gclid|gclsrc|dclid|gbraid|wbraid|msclkid|yclid|twclid|ttclid|li_fat_id|mc_cid|mc_eid|igshid|igsh|_hsenc|_hsmi|mkt_tok|oly_anon_id|oly_enc_id|vero_id|rb_clickid|s_cid|ref_src|ref_url|spm|scm)$/i;
// "si" is a share-tracking id on Spotify / YouTube / Apple links — harmless to drop there only
const SI_HOSTS = /(^|\.)(open\.spotify\.com|spotify\.link|youtube\.com|youtu\.be|music\.apple\.com)$/i;

export function stripTrackingFromUrl(raw: string): string {
  try {
    const u = new URL(raw);
    let changed = false;
    for (const k of [...u.searchParams.keys()]) {
      if (TRACK_PARAMS.test(k) || (k === "si" && SI_HOSTS.test(u.hostname)) || (k === "feature" && /youtu/.test(u.hostname) && u.searchParams.get(k) === "shared")) {
        u.searchParams.delete(k);
        changed = true;
      }
    }
    if (!changed) return raw;
    const out = u.toString();
    return out.endsWith("?") ? out.slice(0, -1) : out;
  } catch {
    return raw;
  }
}

/** clean every http(s) link inside a message */
export function stripTrackingFromText(text: string): string {
  return text.replace(/https?:\/\/[^\s<>"')\]]+/gi, (m) => {
    const trail = m.match(/[.,!?;:]+$/)?.[0] ?? "";
    const core = trail ? m.slice(0, -trail.length) : m;
    return stripTrackingFromUrl(core) + trail;
  });
}

/** image URL → same image through the Nexus privacy proxy (when enabled) */
export function proxiedImage(url: string | null | undefined): string | null {
  if (!url) return null;
  if (!/^https?:\/\//i.test(url) || !loadNetPrefs().mediaProxy) return url;
  return `/api/img?u=${encodeURIComponent(url)}`;
}
