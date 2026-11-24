// Custom-domain helpers: DNS ownership proof, routing hints and the optional Vercel project hook.
// Dependency-free with an injectable fetch so Node's test runner can exercise it without the network.
export const VERCEL_A = '76.76.21.21';
export const VERCEL_CNAME = 'cname.vercel-dns.com';
export const TXT_PREFIX = '_nexus-presave';
export const TXT_VALUE_PREFIX = 'nexus-presave-verify=';

const SECOND_LEVEL = ['co', 'com', 'org', 'net', 'ac', 'gov', 'edu'];
/** how many trailing labels make up the registrable domain: yourname.com → 2, yourname.co.uk → 3 */
function registrableLabels(labels) {
  return labels.length >= 3 && labels[labels.length - 1].length === 2 && SECOND_LEVEL.includes(labels[labels.length - 2]) ? 3 : 2;
}

/** apex (yourname.com / yourname.co.uk) vs subdomain (music.yourname.com) */
export function isApex(domain) {
  const labels = domain.split('.');
  return labels.length <= registrableLabels(labels);
}

/** The two DNS records a creator must add: an ownership TXT and a routing record. */
export function dnsRecords(domain, token) {
  const labels = domain.split('.');
  const sub = labels.slice(0, Math.max(0, labels.length - registrableLabels(labels))).join('.');
  return {
    txt: { type: 'TXT', name: `${TXT_PREFIX}.${domain}`, value: `${TXT_VALUE_PREFIX}${token}` },
    route: isApex(domain)
      ? { type: 'A', name: '@', value: VERCEL_A }
      : { type: 'CNAME', name: sub, value: VERCEL_CNAME },
  };
}

const TYPE_CODE = { A: 1, CNAME: 5, TXT: 16 };
export async function dohLookup(fetchImpl, name, type) {
  for (const base of ['https://cloudflare-dns.com/dns-query', 'https://dns.google/resolve']) {
    try {
      const response = await fetchImpl(`${base}?${new URLSearchParams({ name, type })}`, { headers: { accept: 'application/dns-json' }, signal: AbortSignal.timeout(6000) });
      if (!response.ok) continue;
      const body = await response.json();
      return (body.Answer ?? []).filter((a) => a.type === TYPE_CODE[type]).map((a) => String(a.data).replace(/^"|"$/g, '').replace(/"\s*"/g, '').replace(/\.$/, '').toLowerCase());
    } catch { /* try the next resolver */ }
  }
  return [];
}

/** Optional: add / remove the domain on the Vercel project so HTTPS is issued automatically. */
export function vercelProject(get, fetchImpl) {
  const token = get('VERCEL_TOKEN');
  const project = get('VERCEL_PROJECT_ID');
  if (!token || !project) return null;
  const team = get('VERCEL_TEAM_ID');
  const query = team ? `?teamId=${encodeURIComponent(team)}` : '';
  return {
    async add(domain) {
      try {
        const response = await fetchImpl(`https://api.vercel.com/v10/projects/${encodeURIComponent(project)}/domains${query}`, {
          method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: domain }),
          signal: AbortSignal.timeout(10000),
        });
        if (response.ok || response.status === 409) return { ok: true };
        const body = await response.json().catch(() => ({}));
        return { ok: false, note: `Couldn’t add it to the site: ${String(body.error?.message ?? response.status).slice(0, 160)}` };
      } catch { return { ok: false, note: 'Couldn’t reach the hosting provider. Try verifying again in a minute.' }; }
    },
    async remove(domain) {
      try {
        await fetchImpl(`https://api.vercel.com/v9/projects/${encodeURIComponent(project)}/domains/${encodeURIComponent(domain)}${query}`, {
          method: 'DELETE', headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000),
        });
      } catch { /* best effort */ }
    },
  };
}

/** Checks DNS and returns the new { status, note } for a domain row. */
export async function checkDomain({ domain, token, fetchImpl, vercel }) {
  const txt = await dohLookup(fetchImpl, `${TXT_PREFIX}.${domain}`, 'TXT');
  if (!txt.some((value) => value.includes(`${TXT_VALUE_PREFIX}${token}`))) {
    return { status: 'pending', note: 'TXT record not found yet — DNS changes can take up to an hour.' };
  }
  const [a, cname] = await Promise.all([dohLookup(fetchImpl, domain, 'A'), dohLookup(fetchImpl, domain, 'CNAME')]);
  const routed = a.includes(VERCEL_A) || cname.some((c) => c.endsWith('vercel-dns.com'));
  const hook = vercel ? await vercel.add(domain) : { ok: false, note: 'Ownership confirmed. The Nexus team will switch the domain on shortly.' };
  if (routed && hook.ok) return { status: 'live', note: null };
  if (!routed) {
    const { route } = dnsRecords(domain, token);
    return { status: 'verified', note: `Ownership confirmed. Now point it here: ${route.type} ${route.name} → ${route.value}` };
  }
  return { status: 'verified', note: hook.note ?? null };
}
