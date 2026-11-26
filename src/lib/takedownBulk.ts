// Pure helpers for multi-song / multi-release / whole-artist takedown notices.
// A bulk notice is still ONE notice (one row in takedown_notices, one email to the platform's copyright agent):
// the works are listed in the description and every infringing link goes in the numbered link list.
// No imports from client modules so it can be unit-tested with plain node.

export const MAX_LINKS = 50;
export const MAX_LOOKUPS = 25;

export type BulkWork = {
  key: string;
  title: string;
  artist: string;
  isrc?: string | null;
  upc?: string | null;
  /** label Spotify lists for the track (from the ISRC lookup) */
  label?: string | null;
  /** infringing links for this work */
  urls: string[];
  /** e.g. "Single · 2026-03-01" */
  note?: string;
};

export type Contactish = { name: string; company: string; role: "owner" | "agent"; email: string; phone: string; address: string; country: string };

const ISRC = /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/;
const SPOTIFY_LINK = /^https?:\/\/(open\.spotify\.com|spotify\.link)\/\S+$/i;

export type ParsedInput = { links: string[]; isrcs: string[]; ignored: string[] };

/** Split pasted text (one per line, or separated by spaces/commas) into Spotify links and ISRCs. */
export function parseBulkInput(text: string): ParsedInput {
  const parts = text.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
  const links: string[] = [];
  const isrcs: string[] = [];
  const ignored: string[] = [];
  const seen = new Set<string>();
  for (const raw of parts) {
    const isrc = raw.toUpperCase().replace(/-/g, "");
    const k = SPOTIFY_LINK.test(raw) ? raw.replace(/[?#].*$/, "").replace(/\/$/, "").toLowerCase() : isrc;
    if (seen.has(k)) continue;
    seen.add(k);
    if (SPOTIFY_LINK.test(raw)) links.push(raw.replace(/[?#].*$/, ""));
    else if (ISRC.test(isrc)) isrcs.push(isrc);
    else ignored.push(raw);
  }
  return { links, isrcs, ignored };
}

const uniq = <T,>(a: T[]) => [...new Set(a)];

export function allUrls(works: BulkWork[], extra: string[] = []) {
  return uniq([...works.flatMap((w) => w.urls), ...extra].filter((u) => /^https?:\/\//i.test(u)));
}

export function commonArtist(works: BulkWork[]): string | null {
  const names = uniq(works.map((w) => w.artist.trim()).filter(Boolean));
  return names.length === 1 ? names[0]! : null;
}

export function bulkTitle(works: BulkWork[], label?: string) {
  if (works.length === 1) return works[0]!.title;
  const artist = commonArtist(works);
  return `${works.length} works${label ? ` — ${label}` : artist ? ` by ${artist}` : ""}`.slice(0, 140);
}

/** the per-work list that goes into the notice description */
export function describeWorks(works: BulkWork[]) {
  return works
    .map((w, i) => {
      const bits = [w.artist && `by ${w.artist}`, w.isrc && `ISRC ${w.isrc}`, w.upc && `UPC ${w.upc}`, w.label && `Label ${w.label}`, w.note].filter(Boolean).join(" · ");
      return `${i + 1}. “${w.title}”${bits ? ` — ${bits}` : ""}`;
    })
    .join("\n");
}

export type BulkKind = "songs" | "releases" | "artist";

export type BulkDraftInput = {
  kind: BulkKind;
  works: BulkWork[];
  /** the artist profile URL (kind=artist) */
  profileUrl?: string | null;
  artistName?: string | null;
  statement: string;
  original?: string | null;
  contact: Contactish;
  signature: string;
};

export type BulkDraft = {
  platform: "spotify";
  work_title: string;
  work_artist: string | null;
  isrc: string | null;
  upc: string | null;
  original_url: string | null;
  infringing: string[];
  description: string;
  contact: Contactish;
  signature: string;
  shield_work: null;
};

export function buildBulkDraft(i: BulkDraftInput): BulkDraft {
  const links = allUrls(i.works, i.kind === "artist" && i.profileUrl ? [i.profileUrl] : []).slice(0, MAX_LINKS);
  const single = i.works.length === 1 ? i.works[0]! : null;
  const head =
    i.kind === "artist"
      ? `This notice covers the artist profile “${i.artistName ?? ""}” and the ${i.works.length} release${i.works.length === 1 ? "" : "s"} listed below, which use my recordings without authorization.`
      : `This notice covers ${i.works.length} work${i.works.length === 1 ? "" : "s"}, listed below.`;
  const description = [head, "", i.statement.trim(), "", "Works covered by this notice:", describeWorks(i.works)].join("\n").trim();
  return {
    platform: "spotify",
    work_title: i.kind === "artist" ? `Artist profile “${i.artistName ?? ""}” + ${i.works.length} release${i.works.length === 1 ? "" : "s"}`.slice(0, 140) : bulkTitle(i.works),
    work_artist: i.kind === "artist" ? i.artistName ?? null : commonArtist(i.works),
    isrc: single?.isrc ?? null,
    upc: single?.upc ?? null,
    original_url: i.original?.trim() || null,
    infringing: links,
    description,
    contact: i.contact,
    signature: i.signature.trim() || i.contact.name,
    shield_work: null,
  };
}

export type CheckInput = {
  kind: BulkKind;
  works: BulkWork[];
  profileUrl?: string | null;
  artistName?: string | null;
  typedArtist?: string;
  ownsAll: boolean;
  contact: Contactish;
  signature: string;
};

/** what's still missing before a bulk notice may be sent (empty = ready) */
export function bulkProblems(i: CheckInput): string[] {
  const p: string[] = [];
  if (!i.works.length) p.push(i.kind === "artist" ? "Select at least one release" : "Add at least one song or release");
  const n = allUrls(i.works, i.kind === "artist" && i.profileUrl ? [i.profileUrl] : []).length;
  if (n > MAX_LINKS) p.push(`Too many links (${n}) — a notice holds ${MAX_LINKS}. Split it into two notices`);
  if (i.works.some((w) => !w.urls.length)) p.push("Every item needs a link");
  if (!i.ownsAll) p.push("Confirm you own (or act for the owner of) every item");
  if (i.kind === "artist") {
    const want = (i.artistName ?? "").trim().toLowerCase();
    if (!want || (i.typedArtist ?? "").trim().toLowerCase() !== want) p.push("Type the artist name to confirm a whole-profile notice");
  }
  const c = i.contact;
  if (!c.name.trim()) p.push("Your full name");
  if (!/^\S+@\S+\.\S+$/.test(c.email.trim())) p.push("Your email");
  if (!c.phone.trim()) p.push("Phone number");
  if (!c.address.trim()) p.push("Postal address");
  if (!c.country.trim()) p.push("Country");
  if (c.role === "agent" && !c.company.trim()) p.push("Company you act for");
  if (!i.signature.trim() || i.signature.trim().toLowerCase() !== c.name.trim().toLowerCase()) p.push("Signature (type your full name exactly)");
  return p;
}

// ------------------------------------------------------------------ release picker (tick boxes)
export type Rel = { id: string | null; name: string; url: string | null; type?: string; release_date?: string; upc?: string | null; artists?: { name: string }[] };

export function releaseToWork(r: Rel, artistName: string): BulkWork | null {
  if (!r.url || !r.id) return null;
  return { key: r.id, title: r.name, artist: artistName, upc: r.upc ?? null, urls: [r.url], note: [r.type, r.release_date].filter(Boolean).join(" · ") || undefined };
}

export function selectAll(ids: string[], on: boolean): Record<string, boolean> {
  return Object.fromEntries(ids.map((id) => [id, on]));
}

export function pickedWorks(rels: Rel[], picked: Record<string, boolean>, artistName: string): BulkWork[] {
  return rels.filter((r) => r.id && picked[r.id]).map((r) => releaseToWork(r, artistName)).filter((w): w is BulkWork => !!w);
}

export function emptyContactish(): Contactish {
  return { name: "", company: "", role: "owner", email: "", phone: "", address: "", country: "" };
}
