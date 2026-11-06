import type { BrowserDnsProviderId } from "./browserPrefs";

export type DohLookupResult = {
  name: string;
  ips: string[];
  blocked: boolean;
  provider: BrowserDnsProviderId | "custom";
  endpoint: string | null;
  error?: string;
};

function dohJsonUrl(endpoint: string, name: string) {
  const raw = endpoint.trim();
  const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const u = new URL(withProto);
  // NextDNS accepts queries on the profile base URL; others expect /dns-query.
  if (!/dns\.nextdns\.io/i.test(u.hostname) && !/dns-query$/i.test(u.pathname.replace(/\/$/, ""))) {
    u.pathname = `${u.pathname.replace(/\/$/, "")}/dns-query`;
  }
  u.searchParams.set("name", name);
  u.searchParams.set("type", "A");
  return u.toString();
}

/** Resolve a hostname over DNS-over-HTTPS (JSON). NextDNS returns 0.0.0.0 when blocked. */
export async function resolveDoh(
  name: string,
  endpoint: string | null,
  provider: BrowserDnsProviderId | "custom" = "custom",
): Promise<DohLookupResult> {
  const host = name.trim().toLowerCase().replace(/\.$/, "");
  if (!host || !endpoint) {
    return { name: host, ips: [], blocked: false, provider, endpoint, error: endpoint ? undefined : "DNS provider uses system resolver" };
  }

  try {
    const url = dohJsonUrl(endpoint, host);
    const res = await fetch(url, {
      headers: { Accept: "application/dns-json" },
      cache: "no-store",
      signal: AbortSignal.timeout(6_000),
    });
    if (!res.ok) {
      return { name: host, ips: [], blocked: false, provider, endpoint, error: `DoH HTTP ${res.status}` };
    }
    const data = (await res.json()) as {
      Answer?: { type: number; data: string }[];
      Status?: number;
    };
    const ips = (data.Answer || [])
      .filter((a) => a.type === 1 && typeof a.data === "string")
      .map((a) => a.data);
    const blocked = ips.length > 0 && ips.every((ip) => ip === "0.0.0.0" || ip === "::");
    return { name: host, ips: blocked ? [] : ips, blocked, provider, endpoint };
  } catch (e) {
    return {
      name: host,
      ips: [],
      blocked: false,
      provider,
      endpoint,
      error: e instanceof Error ? e.message : "DoH failed",
    };
  }
}

export function parseBrowserDnsFromRequest(sp: URLSearchParams): {
  dns: BrowserDnsProviderId;
  nextDnsConfig: string;
  customDohUrl: string;
  endpoint: string | null;
} {
  const dns = (sp.get("dns") || "system") as BrowserDnsProviderId;
  const nextDnsConfig = (sp.get("nextdns") || "").trim().replace(/[^a-zA-Z0-9-]/g, "").slice(0, 32);
  const customDohUrl = (sp.get("doh") || "").trim().slice(0, 400);
  let endpoint: string | null = null;
  if (dns === "nextdns") endpoint = nextDnsConfig ? `https://dns.nextdns.io/${nextDnsConfig}` : "https://dns.nextdns.io";
  else if (dns === "cloudflare") endpoint = "https://cloudflare-dns.com/dns-query";
  else if (dns === "quad9") endpoint = "https://dns.quad9.net/dns-query";
  else if (dns === "adguard") endpoint = "https://dns.adguard-dns.com/dns-query";
  else if (dns === "custom") endpoint = customDohUrl || null;
  return { dns, nextDnsConfig, customDohUrl, endpoint };
}
