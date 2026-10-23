import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Site-wide password gate.
 * The cookie holds sha256("nexus-gate:" + password) — never the password itself.
 * Change the password with the SITE_PASSWORD env var (and the SITE_GATE_TOKEN
 * secret on the `signup` edge function, see README).
 */
export const GATE_COOKIE = "nexus_gate";

// sha256("nexus-gate:qyopy.hu") — default when SITE_PASSWORD isn't set
const DEFAULT_TOKEN = "660d46e572d98a220af6bf7f8ae42353bc8941a16dc7063d96bc0bea541b202b";

export function gateHash(password: string) {
  return createHash("sha256").update(`nexus-gate:${password}`).digest("hex");
}

export function expectedToken() {
  const pw = process.env.SITE_PASSWORD;
  if (pw === "off") return null; // explicitly disabled
  return pw ? gateHash(pw) : DEFAULT_TOKEN;
}

export function tokenValid(token: string | undefined | null) {
  const expected = expectedToken();
  if (expected === null) return true;
  if (!token || token.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}
