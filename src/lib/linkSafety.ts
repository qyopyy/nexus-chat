// Link safety for chat: spot tricky links and decide when to ask before opening (pure, no DOM).

/** Sites Nexus people use all the time; never asked about unless the link itself looks tricky. */
const TRUSTED = ["nexusproject.cc", "spotify.com", "youtube.com", "youtu.be", "apple.com", "soundcloud.com", "github.com", "wikipedia.org"];

export type LinkRisk = "ok" | "other-site" | "tricky";

export function hostOf(href: string): string | null {
  try {
    const u = new URL(href);
    return u.protocol === "https:" || u.protocol === "http:" ? u.hostname.toLowerCase() : null;
  } catch {
    return null;
  }
}

const isIp = (h: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(":");

export function trustedHost(host: string): boolean {
  return TRUSTED.some((t) => host === t || host.endsWith(`.${t}`));
}

/** "tricky": another site hiding behind a name@ prefix, look-alike (xn--) letters, a bare IP address, or plain http.
 *  "other-site": a normal link to a site that is not on the trusted list. */
export function linkRisk(href: string): LinkRisk {
  let u: URL;
  try {
    u = new URL(href);
  } catch {
    return "tricky";
  }
  const host = u.hostname.toLowerCase();
  if (u.protocol !== "https:" && u.protocol !== "http:") return "tricky";
  if (u.username || u.password) return "tricky";
  if (host.split(".").some((p) => p.startsWith("xn--"))) return "tricky";
  if (isIp(host)) return "tricky";
  if (u.protocol === "http:" && !trustedHost(host)) return "tricky";
  return trustedHost(host) ? "ok" : "other-site";
}

/** Tricky links always ask; other sites ask only when the person switched "Ask before opening links" on. */
export const shouldAsk = (risk: LinkRisk, askAll: boolean) => risk === "tricky" || (risk === "other-site" && askAll);

export function warningText(href: string, risk: LinkRisk): string {
  const host = hostOf(href) ?? "an unknown address";
  return risk === "tricky"
    ? `This link looks unusual (${host}). It may not go where it seems. Only open it if you trust the sender.\n\nOpen anyway?`
    : `This link leaves Nexus and opens ${host}.\n\nOpen it?`;
}
