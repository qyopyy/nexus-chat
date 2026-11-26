import { createHash, randomBytes } from 'node:crypto';

/** A fresh random secret, URL-safe. */
export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString('base64url');
}

/** Secrets are only ever kept (and saved to disk) as this hash, never in the clear. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('base64url');
}
