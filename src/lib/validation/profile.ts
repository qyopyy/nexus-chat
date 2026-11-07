/** Username rules (same as the database's check_username_rules): 1–24 of a-z 0-9 _ . — not starting/ending with . or _, no ".." */
export const USERNAME_RE = /^[a-z0-9_.]{1,24}$/;

export function validateUsername(raw: string): { ok: true; value: string } | { ok: false; error: string } {
  const v = raw.trim().replace(/^@/, "").toLowerCase();
  if (!USERNAME_RE.test(v)) return { ok: false, error: "Usernames are 1–24 characters: letters, numbers, _ and ." };
  if (/^[._]|[._]$|\.\./.test(v)) return { ok: false, error: "A username can't start or end with . or _, or have two dots in a row" };
  return { ok: true, value: v };
}
