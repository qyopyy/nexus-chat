// "Remember this device for 30 days" for the two-factor prompt (pure helpers, no DOM; storage lives in mfa.ts).
//
// What it is: after you pass the 2FA check you can tell Nexus to skip that prompt on this device for 30 days.
// It is remembered per account, only on this device, and only for the sign-in prompt (turning 2FA off and other
// sensitive steps still ask). "Forget this device" removes it.

export const TRUST_DAYS = 30;
export const TRUST_MS = TRUST_DAYS * 24 * 60 * 60 * 1000;
export const TRUST_KEY = "nexus.mfaTrust.v1";

/** account id → when the trust ends (ms since 1970) */
export type TrustMap = Record<string, number>;

const isId = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

/** Stored text → a clean map. Bad JSON, bad ids, bad or already-ended dates are dropped. */
export function parseTrust(raw: string | null | undefined, now: number): TrustMap {
  let o: unknown = null;
  try {
    o = raw ? JSON.parse(raw) : null;
  } catch {
    return {};
  }
  const out: TrustMap = {};
  if (!o || typeof o !== "object" || Array.isArray(o)) return out;
  for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
    if (isId(k) && typeof v === "number" && Number.isFinite(v) && v > now && v <= now + TRUST_MS + 60_000) out[k] = v;
  }
  return out;
}

export const isTrusted = (map: TrustMap, userId: string | null | undefined, now: number) => !!userId && isId(userId) && (map[userId] ?? 0) > now;

export function trust(map: TrustMap, userId: string, now: number): TrustMap {
  if (!isId(userId)) return map;
  return { ...map, [userId]: now + TRUST_MS };
}

export function forget(map: TrustMap, userId: string | null | undefined): TrustMap {
  if (!userId) return map;
  const { [userId]: _gone, ...rest } = map;
  void _gone;
  return rest;
}

/** "Trusted until 27 Dec" style text. */
export function trustUntilLabel(until: number): string {
  const d = new Date(until);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
