import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { resolvePreset } from "@/lib/netPrefs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// well-known ad / tracker hosts — a blocking resolver answers 0.0.0.0 (or nothing) for these
const TEST_HOSTS = ["doubleclick.net", "googleadservices.com", "pagead2.googlesyndication.com", "ads.facebook.com", "app-measurement.com", "adservice.google.com"];

/** RFC 8484 DNS-over-HTTPS (wire format, works with every provider). Returns A records + rcode. */
async function dohA(endpoint: string, name: string): Promise<{ ips: string[]; rcode: number; error?: string }> {
  const q: number[] = [0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0];
  for (const label of name.split(".")) {
    q.push(label.length, ...[...label].map((c) => c.charCodeAt(0)));
  }
  q.push(0, 0, 1, 0, 1);
  const b64 = btoa(String.fromCharCode(...q)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  try {
    const u = new URL(endpoint);
    u.searchParams.set("dns", b64);
    const r = await fetch(u, { headers: { Accept: "application/dns-message" }, cache: "no-store", signal: AbortSignal.timeout(6000) });
    if (!r.ok) return { ips: [], rcode: -1, error: `HTTP ${r.status}` };
    const m = new Uint8Array(await r.arrayBuffer());
    const rcode = m[3] & 0x0f;
    const an = (m[6] << 8) | m[7];
    let i = 12;
    const skipName = () => {
      while (i < m.length) {
        const len = m[i];
        if (len === 0) return void (i += 1);
        if ((len & 0xc0) === 0xc0) return void (i += 2);
        i += len + 1;
      }
    };
    skipName();
    i += 4; // qtype + qclass
    const ips: string[] = [];
    for (let k = 0; k < an && i < m.length; k++) {
      skipName();
      const type = (m[i] << 8) | m[i + 1];
      const rdlen = (m[i + 8] << 8) | m[i + 9];
      i += 10;
      if (type === 1 && rdlen === 4) ips.push(`${m[i]}.${m[i + 1]}.${m[i + 2]}.${m[i + 3]}`);
      i += rdlen;
    }
    return { ips, rcode };
  } catch (e) {
    return { ips: [], rcode: -1, error: e instanceof Error ? e.message : "failed" };
  }
}

async function publicHost(h: string) {
  if (isIP(h) || !h.includes(".")) return false;
  try {
    const a = await lookup(h, { all: true });
    return a.length > 0 && !a.some((x) => /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)|^(::1|f[cd]|fe80)/i.test(x.address));
  } catch {
    return false;
  }
}

/** GET /api/dns-test?p=adguard | ?p=nextdns&id=abc123 | ?p=custom&doh=https://… → does this resolver block ads? */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const p = sp.get("p") ?? "";
  let endpoint: string | null = null;
  if (p === "custom") {
    try {
      const u = new URL((sp.get("doh") ?? "").trim());
      if (u.protocol !== "https:" || !(await publicHost(u.hostname))) throw new Error();
      endpoint = u.toString();
    } catch {
      return Response.json({ error: "Custom test needs a public https:// DNS-over-HTTPS URL" }, { status: 400 });
    }
  } else {
    endpoint = resolvePreset(p, sp.get("id") ?? "")?.doh ?? null;
    if (!endpoint) return Response.json({ error: "Pick a provider (NextDNS needs your config ID)" }, { status: 400 });
  }
  const started = Date.now();
  const ep = endpoint;
  const isBlocked = (r: { ips: string[]; rcode: number; error?: string }) => !r.error && (r.rcode === 3 || r.rcode === 5 || r.ips.length === 0 || r.ips.every((ip) => ip === "0.0.0.0" || ip.startsWith("127.")));
  const [ok, ...results] = await Promise.all(["example.com", ...TEST_HOSTS].map((h) => dohA(ep, h)));
  return Response.json(
    {
      reachable: !ok.error && ok.ips.length > 0,
      blocked: results.filter(isBlocked).length,
      tested: TEST_HOSTS.length,
      ms: Date.now() - started,
      details: results.map((r, k) => ({ host: TEST_HOSTS[k], blocked: isBlocked(r), error: r.error ?? null })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
