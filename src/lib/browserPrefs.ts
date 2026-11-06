"use client";

export type BrowserSearchEngineId =
  | "google"
  | "bing"
  | "duckduckgo"
  | "brave"
  | "startpage"
  | "ecosia"
  | "qwant"
  | "custom";

export type BrowserDnsProviderId = "system" | "nextdns" | "cloudflare" | "quad9" | "adguard" | "custom";

export type BrowserShieldsPrefs = {
  enabled: boolean;
  blockAds: boolean;
  blockTrackers: boolean;
  blockFingerprinting: boolean;
  blockScripts: boolean;
  httpsOnly: boolean;
};

export type BrowserPrefs = {
  engine: BrowserSearchEngineId;
  customSearchUrl: string;
  dns: BrowserDnsProviderId;
  nextDnsConfig: string;
  customDohUrl: string;
  shields: BrowserShieldsPrefs;
};

export const BROWSER_PREFS_KEY = "nexus.browser.prefs.v1";

export const DEFAULT_SHIELDS: BrowserShieldsPrefs = {
  enabled: true,
  blockAds: true,
  blockTrackers: true,
  blockFingerprinting: true,
  blockScripts: false,
  httpsOnly: true,
};

export const DEFAULT_BROWSER_PREFS: BrowserPrefs = {
  engine: "google",
  customSearchUrl: "https://duckduckgo.com/?q={q}",
  dns: "nextdns",
  nextDnsConfig: "",
  customDohUrl: "https://dns.nextdns.io",
  shields: { ...DEFAULT_SHIELDS },
};

export const SEARCH_ENGINES: {
  id: BrowserSearchEngineId;
  label: string;
  hint: string;
  build: (q: string, custom?: string) => string;
}[] = [
  {
    id: "google",
    label: "Google",
    hint: "google.com",
    build: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`,
  },
  {
    id: "bing",
    label: "Bing",
    hint: "bing.com",
    build: (q) => `https://www.bing.com/search?q=${encodeURIComponent(q)}`,
  },
  {
    id: "duckduckgo",
    label: "DuckDuckGo",
    hint: "Privacy search",
    build: (q) => `https://duckduckgo.com/?q=${encodeURIComponent(q)}`,
  },
  {
    id: "brave",
    label: "Brave",
    hint: "search.brave.com",
    build: (q) => `https://search.brave.com/search?q=${encodeURIComponent(q)}`,
  },
  {
    id: "startpage",
    label: "Startpage",
    hint: "Private Google results",
    build: (q) => `https://www.startpage.com/sp/search?query=${encodeURIComponent(q)}`,
  },
  {
    id: "ecosia",
    label: "Ecosia",
    hint: "Trees with searches",
    build: (q) => `https://www.ecosia.org/search?q=${encodeURIComponent(q)}`,
  },
  {
    id: "qwant",
    label: "Qwant",
    hint: "EU privacy search",
    build: (q) => `https://www.qwant.com/?q=${encodeURIComponent(q)}`,
  },
  {
    id: "custom",
    label: "Custom",
    hint: "URL with {q}",
    build: (q, custom) => {
      const tpl = (custom || "https://duckduckgo.com/?q={q}").trim();
      if (!tpl.includes("{q}")) return `${tpl}${encodeURIComponent(q)}`;
      return tpl.replaceAll("{q}", encodeURIComponent(q));
    },
  },
];

export const DNS_PROVIDERS: {
  id: BrowserDnsProviderId;
  label: string;
  hint: string;
  doh?: string;
}[] = [
  { id: "system", label: "System DNS", hint: "Use default resolver" },
  { id: "nextdns", label: "NextDNS", hint: "Block ads & trackers via your config", doh: "https://dns.nextdns.io" },
  { id: "cloudflare", label: "Cloudflare 1.1.1.1", hint: "Fast privacy DNS", doh: "https://cloudflare-dns.com/dns-query" },
  { id: "quad9", label: "Quad9", hint: "Malware blocking", doh: "https://dns.quad9.net/dns-query" },
  { id: "adguard", label: "AdGuard DNS", hint: "Ad & tracker DNS", doh: "https://dns.adguard-dns.com/dns-query" },
  { id: "custom", label: "Custom DoH", hint: "Your DNS-over-HTTPS URL" },
];

function clampPrefs(raw: Partial<BrowserPrefs> | null | undefined): BrowserPrefs {
  const base = { ...DEFAULT_BROWSER_PREFS, ...(raw || {}) };
  const shields = { ...DEFAULT_SHIELDS, ...(raw?.shields || {}) };
  const engine = SEARCH_ENGINES.some((e) => e.id === base.engine) ? base.engine : "google";
  const dns = DNS_PROVIDERS.some((d) => d.id === base.dns) ? base.dns : "nextdns";
  return {
    engine,
    customSearchUrl: String(base.customSearchUrl || DEFAULT_BROWSER_PREFS.customSearchUrl).slice(0, 400),
    dns,
    nextDnsConfig: String(base.nextDnsConfig || "")
      .trim()
      .replace(/[^a-zA-Z0-9-]/g, "")
      .slice(0, 32),
    customDohUrl: String(base.customDohUrl || DEFAULT_BROWSER_PREFS.customDohUrl).trim().slice(0, 400),
    shields: {
      enabled: !!shields.enabled,
      blockAds: !!shields.blockAds,
      blockTrackers: !!shields.blockTrackers,
      blockFingerprinting: !!shields.blockFingerprinting,
      blockScripts: !!shields.blockScripts,
      httpsOnly: !!shields.httpsOnly,
    },
  };
}

export function loadBrowserPrefs(): BrowserPrefs {
  if (typeof window === "undefined") return { ...DEFAULT_BROWSER_PREFS, shields: { ...DEFAULT_SHIELDS } };
  try {
    return clampPrefs(JSON.parse(localStorage.getItem(BROWSER_PREFS_KEY) || "null"));
  } catch {
    return { ...DEFAULT_BROWSER_PREFS, shields: { ...DEFAULT_SHIELDS } };
  }
}

export function saveBrowserPrefs(prefs: BrowserPrefs) {
  const next = clampPrefs(prefs);
  if (typeof window !== "undefined") localStorage.setItem(BROWSER_PREFS_KEY, JSON.stringify(next));
  return next;
}

export function searchUrlForPrefs(prefs: BrowserPrefs, q: string) {
  const engine = SEARCH_ENGINES.find((e) => e.id === prefs.engine) || SEARCH_ENGINES[0]!;
  return engine.build(q, prefs.customSearchUrl);
}

export function dohEndpointForPrefs(prefs: Pick<BrowserPrefs, "dns" | "nextDnsConfig" | "customDohUrl">) {
  if (prefs.dns === "system") return null;
  if (prefs.dns === "custom") {
    const u = prefs.customDohUrl.trim();
    return u || null;
  }
  if (prefs.dns === "nextdns") {
    const id = prefs.nextDnsConfig.trim();
    return id ? `https://dns.nextdns.io/${id}` : "https://dns.nextdns.io";
  }
  return DNS_PROVIDERS.find((d) => d.id === prefs.dns)?.doh || null;
}
