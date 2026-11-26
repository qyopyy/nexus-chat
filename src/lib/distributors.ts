// Upstream notice: find who delivered a track (the label / distributor name Spotify lists for the ISRC)
// and prepare the same copyright notice for them too, with the label CC'd on the platform notice.
// We only ship contact pages we have verified; emails are always entered/confirmed by the rights holder.
// Pure functions (no DOM/network) so they can be unit-tested.

export type KnownDistributor = { id: string; name: string; match: RegExp; takedownPage?: string };

export const KNOWN: KnownDistributor[] = [
  { id: "distrokid", name: "DistroKid", match: /distro\s*kid/i, takedownPage: "https://support.distrokid.com/hc/en-us/articles/360056369674-DMCA-Takedowns-and-Counterclaims" },
  { id: "cdbaby", name: "CD Baby", match: /cd\s*baby/i, takedownPage: "https://support.cdbaby.com/hc/en-us/articles/360037341452-Filing-a-Takedown-Notice-to-Report-Allegations-of-Copyright-Infringement" },
  { id: "tunecore", name: "TuneCore", match: /tune\s*core/i },
  { id: "amuse", name: "Amuse", match: /\bamuse\b/i },
  { id: "ditto", name: "Ditto Music", match: /\bditto\b/i },
  { id: "routenote", name: "RouteNote", match: /route\s*note/i },
  { id: "unitedmasters", name: "UnitedMasters", match: /united\s*masters/i },
  { id: "symphonic", name: "Symphonic", match: /symphonic/i },
  { id: "believe", name: "Believe", match: /\bbelieve\b/i },
  { id: "orchard", name: "The Orchard", match: /the\s*orchard/i },
  { id: "onerpm", name: "ONErpm", match: /one\s*rpm/i },
  { id: "toolost", name: "Too Lost", match: /too\s*lost/i },
  { id: "awal", name: "AWAL", match: /\bawal\b/i },
  { id: "empire", name: "EMPIRE", match: /\bempire\b/i },
  { id: "vydia", name: "Vydia", match: /vydia/i },
  { id: "stem", name: "Stem", match: /\bstem\b/i },
  { id: "landr", name: "LANDR", match: /\blandr\b/i },
  { id: "recordunion", name: "Record Union", match: /record\s*union/i },
  { id: "imusician", name: "iMusician", match: /imusician/i },
];

export function matchDistributor(label: string | null | undefined): KnownDistributor | null {
  const s = (label ?? "").trim();
  return s ? KNOWN.find((d) => d.match.test(s)) ?? null : null;
}

/** where to look for the contact when we don't have a verified page */
export function contactSearchUrl(label: string) {
  const d = matchDistributor(label);
  return `https://www.google.com/search?q=${encodeURIComponent(`${d?.name ?? label} DMCA copyright takedown notice contact`)}`;
}

/** valid addresses only, de-duplicated, max 10 */
export function parseEmails(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/[\s,;<>]+/)) {
    const e = raw.trim().toLowerCase();
    if (/^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(e) && !out.includes(e)) out.push(e);
  }
  return out.slice(0, 10);
}

export type Target = { label: string; emails: string[] };

export type NoticeParts = { to: string; subject: string; body: string; ownerEmail: string };

const MAX_URL = 6000;
/** mailto: with CC; if the notice is too long for a mail link the body is replaced by a paste hint */
export function ccMailto(p: NoticeParts, cc: string[]): { url: string; tooLong: boolean } {
  const q = (s: string) => encodeURIComponent(s);
  const base = (body: string) => `mailto:${p.to}?${cc.length ? `cc=${cc.map(q).join(",")}&` : ""}subject=${q(p.subject)}&body=${q(body)}`;
  const full = base(p.body);
  if (full.length <= MAX_URL) return { url: full, tooLong: false };
  return { url: base("(The full notice is on your clipboard — paste it here.)"), tooLong: true };
}

/** cover note when writing to the label/distributor directly */
export function upstreamBody(o: { label: string; platformName: string; titles: string; notice: string; owner: string }) {
  return [
    `Hello ${o.label} team,`,
    "",
    `${o.label} is listed as the label for ${o.titles} on ${o.platformName}. I am the rights owner of the recording${/,|—|\band\b/.test(o.titles) ? "s" : ""} and I have not authorized this release. I have sent the notice below to ${o.platformName}, and I am copying you so that you can take the content down at source and stop further deliveries.`,
    "",
    "Please confirm by reply once it has been actioned, and let me know if you need any documentation of ownership.",
    "",
    "— — —",
    "",
    o.notice,
    "",
    o.owner,
  ].join("\n");
}

/** distinct labels (by lower-case name) from looked-up works */
export function uniqueLabels(labels: (string | null | undefined)[]): string[] {
  const seen = new Map<string, string>();
  for (const l of labels) {
    const t = (l ?? "").trim();
    if (t && !seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t);
  }
  return [...seen.values()];
}

export const ccStoreKey = (label: string) => `nexus.takedown.cc.${label.trim().toLowerCase().slice(0, 80)}`;
