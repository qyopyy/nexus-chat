// How the Nexus browser extension talks to an open Nexus tab. Pure helpers, shared by the page side and tests.
//
// The extension holds NO secrets: no vault key, no passwords, no login. It asks the open Nexus tab (which has the
// unlocked vaults in memory) and the tab decides what to answer. Websites can't reach this: only the extension's
// own script runs on nexus pages, and the "which site is asking" part is read by the extension from the browser tab,
// never from the page's own claims.

export const FROM_EXT = "nexus-ext";
export const FROM_PAGE = "nexus-page";
export const REQUEST_TYPES = ["status", "clip:push", "clip:handoff", "pass:search", "pass:fill"] as const;
export type RequestType = (typeof REQUEST_TYPES)[number];

export type ExtRequest = { source: typeof FROM_EXT; id: string; type: RequestType; payload: Record<string, unknown> };
export type PageReply = { source: typeof FROM_PAGE; id: string; ok: boolean; data?: unknown; error?: string };

export function validateRequest(data: unknown): ExtRequest | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (d.source !== FROM_EXT || typeof d.id !== "string" || d.id.length === 0 || d.id.length > 64) return null;
  if (!(REQUEST_TYPES as readonly unknown[]).includes(d.type)) return null;
  const payload = d.payload && typeof d.payload === "object" && !Array.isArray(d.payload) ? (d.payload as Record<string, unknown>) : {};
  return { source: FROM_EXT, id: d.id, type: d.type as RequestType, payload };
}

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;
export function hostFromUrl(u: string | undefined | null): string {
  try {
    return new URL(u ?? "").hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** A saved login is offered on a page when the page is that site or one of its subdomains. */
export function hostMatches(savedUrl: string | undefined, pageHost: string): boolean {
  const saved = hostFromUrl(savedUrl);
  const page = pageHost.toLowerCase().replace(/^www\./, "");
  if (!saved || !page) return false;
  if (saved === page) return true;
  if (IPV4.test(saved) || IPV4.test(page) || !saved.includes(".")) return false; // no partial matches for IPs and bare names
  return page.endsWith("." + saved);
}

/** Forms must never be filled over plain http (except a local test server). */
export function fillAllowed(pageUrl: string): boolean {
  try {
    const u = new URL(pageUrl);
    return u.protocol === "https:" || (u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1"));
  } catch {
    return false;
  }
}
