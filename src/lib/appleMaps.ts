/** Client helpers for the Apple Maps scrape API. */

export type AppleMapsPlace = {
  url: string;
  finalUrl: string;
  name: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  image: string | null;
  source: string;
};

export function appleMapsLink(lat: number, lng: number, q?: string) {
  const u = new URL("https://maps.apple.com/");
  u.searchParams.set("ll", `${lat},${lng}`);
  if (q?.trim()) u.searchParams.set("q", q.trim());
  return u.toString();
}

export function isAppleMapsUrl(raw: string) {
  try {
    const u = new URL(raw.trim());
    const h = u.hostname.toLowerCase();
    return h === "maps.apple.com" || h.endsWith(".maps.apple.com") || ((h === "apple.com" || h.endsWith(".apple.com")) && (u.pathname.includes("maps") || u.searchParams.has("ll") || u.searchParams.has("q")));
  } catch {
    return false;
  }
}

export async function scrapeAppleMaps(input: { url?: string; lat?: number; lng?: number; q?: string }): Promise<AppleMapsPlace> {
  const sp = new URLSearchParams();
  if (input.url) sp.set("url", input.url);
  if (input.q) sp.set("q", input.q);
  if (input.lat != null) sp.set("lat", String(input.lat));
  if (input.lng != null) sp.set("lng", String(input.lng));
  const r = await fetch(`/api/apple-maps?${sp.toString()}`);
  const j = (await r.json()) as AppleMapsPlace & { error?: string };
  if (!r.ok || j.error) throw new Error(j.error || `Apple Maps lookup failed (${r.status})`);
  return j;
}
