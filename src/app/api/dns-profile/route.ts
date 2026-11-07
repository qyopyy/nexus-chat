import { DNS_PRESETS, resolvePreset } from "@/lib/netPrefs";

export const dynamic = "force-dynamic";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const IPV6 = /^[0-9a-f:]{2,39}$/i;
const HOST = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/i;

async function uuidFor(seed: string) {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(seed))).slice(0, 16);
  h[6] = (h[6] & 0x0f) | 0x40;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = [...h].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`.toUpperCase();
}

/**
 * iPhone / iPad / Mac DNS profile (.mobileconfig) — encrypted DNS (DoH or DoT) for the whole device.
 * GET /api/dns-profile?p=adguard | ?p=nextdns&id=abc123 | ?p=custom&doh=https://…&dot=host&ips=1.2.3.4,…
 */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const p = sp.get("p") ?? "";
  let name: string;
  let doh = "";
  let dot = "";
  let ips: string[] = [];
  let slug = p;

  if (p === "custom") {
    doh = (sp.get("doh") ?? "").trim();
    dot = (sp.get("dot") ?? "").trim().toLowerCase();
    ips = (sp.get("ips") ?? "").split(/[\s,]+/).map((s) => s.trim()).filter((s) => IPV4.test(s) || (IPV6.test(s) && s.includes(":"))).slice(0, 4);
    if (doh) {
      try {
        const u = new URL(doh);
        if (u.protocol !== "https:" || !HOST.test(u.hostname)) throw new Error();
        doh = u.toString();
      } catch {
        return new Response("Custom DoH must be an https:// URL", { status: 400 });
      }
    }
    if (dot && !HOST.test(dot)) return new Response("Custom DoT must be a hostname", { status: 400 });
    if (!doh && !dot) return new Response("Add a DNS-over-HTTPS URL or a DNS-over-TLS hostname — Apple profiles only support encrypted DNS", { status: 400 });
    name = `Custom DNS (${doh ? new URL(doh).hostname : dot})`;
    slug = `custom-${(doh || dot).replace(/[^a-z0-9]+/gi, "-").slice(0, 40)}`;
  } else {
    const preset = resolvePreset(p, sp.get("id") ?? "");
    if (!preset) return new Response(DNS_PRESETS.some((x) => x.id === p) ? "NextDNS needs your 6-character config ID" : "Unknown DNS provider", { status: 400 });
    name = preset.name;
    doh = preset.doh;
    dot = preset.dot;
    ips = [...preset.v4, ...preset.v6];
    if (p === "nextdns") slug = `nextdns-${preset.dot.split(".")[0]}`;
  }
  const useTls = sp.get("proto") === "tls" && !!dot;
  const settings = useTls
    ? `<key>DNSProtocol</key><string>TLS</string><key>ServerName</key><string>${esc(dot)}</string>`
    : doh
      ? `<key>DNSProtocol</key><string>HTTPS</string><key>ServerURL</key><string>${esc(doh)}</string>`
      : `<key>DNSProtocol</key><string>TLS</string><key>ServerName</key><string>${esc(dot)}</string>`;
  const addrs = ips.length ? `<key>ServerAddresses</key><array>${ips.map((i) => `<string>${esc(i)}</string>`).join("")}</array>` : "";
  const id = `cc.nexusproject.dns.${slug.replace(/[^a-z0-9.-]/gi, "")}`;
  const [outer, inner] = await Promise.all([uuidFor(`${id}:outer`), uuidFor(`${id}:inner`)]);

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadContent</key>
  <array>
    <dict>
      <key>DNSSettings</key>
      <dict>${settings}${addrs}</dict>
      <key>PayloadDisplayName</key><string>${esc(name)}</string>
      <key>PayloadIdentifier</key><string>${id}.settings</string>
      <key>PayloadType</key><string>com.apple.dnsSettings.managed</string>
      <key>PayloadUUID</key><string>${inner}</string>
      <key>PayloadVersion</key><integer>1</integer>
      <key>ProhibitDisablement</key><false/>
    </dict>
  </array>
  <key>PayloadDescription</key><string>Encrypted DNS (${useTls ? "DNS-over-TLS" : doh ? "DNS-over-HTTPS" : "DNS-over-TLS"}) for this device, set up from Nexus. Remove it any time in Settings → General → VPN &amp; Device Management.</string>
  <key>PayloadDisplayName</key><string>${esc(name)} — Nexus</string>
  <key>PayloadIdentifier</key><string>${id}</string>
  <key>PayloadRemovalDisallowed</key><false/>
  <key>PayloadType</key><string>Configuration</string>
  <key>PayloadUUID</key><string>${outer}</string>
  <key>PayloadVersion</key><integer>1</integer>
</dict>
</plist>
`;
  return new Response(xml, {
    headers: {
      "Content-Type": "application/x-apple-aspen-config; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug.replace(/[^a-z0-9-]/gi, "") || "dns"}.mobileconfig"`,
      "Cache-Control": "no-store",
    },
  });
}
