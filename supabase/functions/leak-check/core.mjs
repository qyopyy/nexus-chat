// Pure helpers for the breach check (no Deno APIs, so Node's test runner can import them).
const EMAIL = /^[^\s@<>"'()[\]\\,;:]{1,64}@[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i;

export function normalizeEmail(value) {
  const email = String(value ?? '').trim().toLowerCase();
  return email.length <= 254 && EMAIL.test(email) ? email : null;
}

/** Keep only what the page shows. Free-text descriptions from the provider are never passed on. */
export function trimBreaches(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 200).map((b) => ({
    name: String(b?.Name ?? '').slice(0, 80),
    title: String(b?.Title ?? b?.Name ?? '').slice(0, 120),
    domain: String(b?.Domain ?? '').slice(0, 120),
    date: /^\d{4}-\d{2}-\d{2}$/.test(b?.BreachDate ?? '') ? b.BreachDate : null,
    data: Array.isArray(b?.DataClasses) ? b.DataClasses.slice(0, 30).map((d) => String(d).slice(0, 60)) : [],
    verified: b?.IsVerified === true,
    sensitive: b?.IsSensitive === true,
  })).filter((b) => b.name);
}
