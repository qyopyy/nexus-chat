/** The parts of an HTTP request the origin checks read. */
type RequestLike = {
  socket: { remoteAddress?: string | undefined };
  headers: Record<string, string | string[] | undefined>;
};

const LOOPBACK = new Set(['127.0.0.1', '::1']);
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
/** Headers a reverse proxy or tunnel adds; any of them means the request was relayed. */
const PROXY_HEADERS = ['cf-connecting-ip', 'cf-ray', 'cf-visitor', 'x-forwarded-for', 'x-forwarded-host', 'forwarded'];

/** What sits in front of the server (the `TRUSTED_PROXY` setting). */
export type TrustedProxy = 'none' | 'cloudflare';

const remoteAddress = (req: RequestLike) => (req.socket.remoteAddress ?? '').replace(/^::ffff:/, '');

/**
 * The visitor's IP. Behind a Cloudflare Tunnel every request arrives from loopback, so with
 * `trustedProxy` set to `cloudflare` the visitor IP comes from CF-Connecting-IP, and only on
 * loopback connections, so a remote client cannot spoof it. Otherwise the header is ignored.
 */
export function clientIp(req: RequestLike, trustedProxy: TrustedProxy): string {
  const remote = remoteAddress(req) || 'unknown';
  const forwarded = req.headers['cf-connecting-ip'];
  if (trustedProxy === 'cloudflare' && LOOPBACK.has(remote) && typeof forwarded === 'string' && forwarded) {
    return forwarded;
  }
  return remote;
}

/** The visitor's network, for per-visitor limits: the IPv4 address, or the IPv6 /56. */
export function clientOrigin(req: RequestLike, trustedProxy: TrustedProxy): string {
  return networkOf(clientIp(req, trustedProxy));
}

/**
 * True only for a request made on this machine straight to the server (http://localhost:PORT),
 * never for one relayed by a tunnel or proxy: those also connect from loopback, but keep the
 * public Host header and add forwarding headers. This is the gate for the admin API.
 *
 * It can only tell a relayed request apart when the proxy marks it. Cloudflare Tunnel always adds
 * CF-Connecting-IP; a proxy that rewrites Host to localhost and adds no header would pass, which is
 * why the configuration refuses the admin API on a public site without `TRUSTED_PROXY=cloudflare`.
 */
export function isDirectLocalRequest(req: RequestLike): boolean {
  if (!LOOPBACK.has(remoteAddress(req))) return false;
  if (PROXY_HEADERS.some((name) => req.headers[name] !== undefined)) return false;
  const host = req.headers.host;
  if (typeof host !== 'string') return false;
  const hostname = host.startsWith('[') ? host.slice(0, host.indexOf(']') + 1) : (host.split(':')[0] ?? '');
  return LOCAL_HOSTS.has(hostname.toLowerCase());
}

/**
 * IPv6 homes usually get a whole /56 and pick new addresses in it at will, so an IPv6 visitor is
 * identified by that prefix ("2001:db8:aa:bb00::/56"). IPv4 and anything unparsable is kept as is.
 */
export function networkOf(ip: string): string {
  if (!ip.includes(':') || LOOPBACK.has(ip)) return ip;
  const [head = '', tail = ''] = ip.split('::');
  const left = head ? head.split(':') : [];
  const right = ip.includes('::') && tail ? tail.split(':') : [];
  const groups = ip.includes('::')
    ? [...left, ...Array<string>(Math.max(0, 8 - left.length - right.length)).fill('0'), ...right]
    : left;
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/i.test(g))) return ip;
  const [a, b, c, d] = groups.map((g) => g.toLowerCase().padStart(4, '0')) as [string, string, string, string];
  const trim = (g: string) => g.replace(/^0+(?=.)/, '');
  return `${trim(a)}:${trim(b)}:${trim(c)}:${trim(`${d.slice(0, 2)}00`)}::/56`;
}
