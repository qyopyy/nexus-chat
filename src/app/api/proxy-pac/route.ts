export const dynamic = "force-dynamic";

const HOST = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/i;
const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

/**
 * Proxy auto-config (PAC) file for your own HTTP / HTTPS / SOCKS5 proxy.
 * Use the URL in Wi-Fi → Configure Proxy → Automatic (iPhone/Mac), Proxy settings → Setup script (Windows),
 * or Wi-Fi → Proxy → Proxy Auto-Config (Android).
 * GET /api/proxy-pac?type=socks5&host=1.2.3.4&port=1080&direct=1&bypass=*.local,example.com
 */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const type = (sp.get("type") ?? "http").toLowerCase();
  const host = (sp.get("host") ?? "").trim().toLowerCase();
  const port = Number(sp.get("port") ?? "");
  const fallback = sp.get("direct") === "1";
  if (!["http", "https", "socks5", "socks4"].includes(type)) return new Response("type must be http, https, socks5 or socks4", { status: 400 });
  if (!(IPV4.test(host) || HOST.test(host))) return new Response("Enter a proxy host name or IPv4 address", { status: 400 });
  if (!Number.isInteger(port) || port < 1 || port > 65535) return new Response("Port must be 1–65535", { status: 400 });
  const bypass = (sp.get("bypass") ?? "")
    .split(/[\s,]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^[a-z0-9*.-]{1,100}$/.test(s))
    .slice(0, 30);

  const hp = `${host}:${port}`;
  const chain = type === "socks5" ? `SOCKS5 ${hp}; SOCKS ${hp}` : type === "socks4" ? `SOCKS ${hp}` : type === "https" ? `HTTPS ${hp}` : `PROXY ${hp}`;
  const pac = `// Nexus proxy setup — generated ${new Date().toISOString().slice(0, 10)}
function FindProxyForURL(url, host) {
  host = host.toLowerCase();
  // never proxy local network traffic
  if (isPlainHostName(host) || shExpMatch(host, "*.local") || shExpMatch(host, "localhost")) return "DIRECT";
  if (isInNet(host, "10.0.0.0", "255.0.0.0") || isInNet(host, "172.16.0.0", "255.240.0.0") ||
      isInNet(host, "192.168.0.0", "255.255.0.0") || isInNet(host, "127.0.0.0", "255.0.0.0")) return "DIRECT";
${bypass.map((b) => `  if (shExpMatch(host, ${JSON.stringify(b)})) return "DIRECT";`).join("\n")}
  return ${JSON.stringify(chain + (fallback ? "; DIRECT" : ""))};
}
`;
  return new Response(pac, { headers: { "Content-Type": "application/x-ns-proxy-autoconfig; charset=utf-8", "Cache-Control": "public, max-age=300" } });
}
