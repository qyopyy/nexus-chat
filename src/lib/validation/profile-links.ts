import { normalizeLink } from "@/lib/links";
import type { ProfileLink } from "@/lib/types";

/** Clean a list of profile links (max 20, http(s) only, platform detected from the URL). */
export function cleanProfileLinks(input: unknown): ProfileLink[] {
  if (!Array.isArray(input)) return [];
  const out: ProfileLink[] = [];
  for (const item of input.slice(0, 20)) {
    const url = typeof item === "string" ? item : typeof item === "object" && item && "url" in item ? String((item as { url: unknown }).url ?? "") : "";
    const l = normalizeLink(url);
    if (l && /^https?:\/\//i.test(l.url)) out.push(l);
  }
  return out;
}
