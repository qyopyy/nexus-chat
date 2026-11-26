import { BlockList, isIP } from 'node:net';

/** A browser offer has a handful of candidates; more is someone steering the media server's ICE checks. */
const MAX_OFFER_CANDIDATES = 16;
const CANDIDATE_ADDRESS = /^a=candidate:\S+ \d+ \S+ \d+ (\S+) /i;
/** A browser's mDNS host candidate: a random name such as "1f4b2c3d-....local". */
const MDNS_NAME = /^[a-z0-9-]{1,63}\.local$/i;

/**
 * Never a remote viewer: loopback, unspecified, multicast, link-local, private and shared address
 * space. Viewers on the home network still connect through their mDNS (.local) or public candidates.
 */
const NOT_A_VIEWER = new BlockList();
// pf-style short forms: "172.16/12" is 172.16.0.0/12.
for (const cidr of ['0/8', '10/8', '100.64/10', '127/8', '169.254/16', '172.16/12', '192.168/16', '224/3']) {
  const [network = '', prefix = ''] = cidr.split('/');
  const octets = network.split('.');
  while (octets.length < 4) octets.push('0');
  NOT_A_VIEWER.addSubnet(octets.join('.'), Number(prefix), 'ipv4');
}
for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  NOT_A_VIEWER.addSubnet(network, prefix, 'ipv6');
}

const family = (address: string) => (isIP(address) === 6 ? 'ipv6' : 'ipv4');

/** An IPv4-mapped IPv6 address ("::ffff:192.0.2.1") as its IPv4 form, so one rule covers both. */
const unmap = (address: string) => address.replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i, '');

/**
 * Cleans a viewer's SDP offer before the media server sees it. Its candidates tell the server
 * where to send ICE checks, so a forged offer could aim them at this machine's own services, the
 * console or other devices on the LAN. Keeps only candidates whose address is a public IP literal
 * or an mDNS (.local) name, never one of `blockedAddresses`, and at most 16 of them.
 */
export function sanitizeOffer(sdp: string, blockedAddresses: readonly string[]): string {
  const blocked = new BlockList();
  for (const raw of blockedAddresses) {
    const address = unmap(raw);
    if (isIP(address)) blocked.addAddress(address, family(address));
  }
  let kept = 0;
  return sdp
    .split(/\r?\n/)
    .filter((line) => {
      if (!/^a=candidate:/i.test(line)) return true;
      const raw = CANDIDATE_ADDRESS.exec(line)?.[1];
      if (!raw || kept >= MAX_OFFER_CANDIDATES) return false;
      const address = unmap(raw);
      const allowed = isIP(address)
        ? !NOT_A_VIEWER.check(address, family(address)) && !blocked.check(address, family(address))
        : MDNS_NAME.test(address);
      if (!allowed) return false;
      kept += 1;
      return true;
    })
    .join('\r\n');
}

/** Removes IPv6 ICE candidates, so a host's global IPv6 address is never handed to viewers. */
export function stripIpv6Candidates(sdp: string): string {
  return sdp
    .split(/\r?\n/)
    .filter((line) => !CANDIDATE_ADDRESS.exec(line)?.[1]?.includes(':'))
    .join('\r\n');
}
