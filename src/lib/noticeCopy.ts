// Professional, factual wording for copyright notices + a "notice strength" review.
// Platforms act on notices that are specific, verifiable and calm. Nothing here can guarantee a result —
// the platform decides — but it removes the usual reasons notices get bounced (vague, emotional, no proof).
// Pure functions only (no DOM/network) so they're unit-tested.

export type ReasonId = "reupload" | "sample" | "wrong_artist" | "impersonation" | "unlicensed_catalog";
export type EvidenceId = "distributor" | "isrc" | "stems" | "contract" | "dates" | "registration";

export const REASONS: { id: ReasonId; label: string; profile?: boolean }[] = [
  { id: "reupload", label: "Re-upload of my recording" },
  { id: "sample", label: "Uses my recording / beat without a license" },
  { id: "wrong_artist", label: "Delivered to my artist profile (not my music)" },
  { id: "impersonation", label: "Profile impersonates my artist name", profile: true },
  { id: "unlicensed_catalog", label: "Profile distributes my recordings without a license", profile: true },
];

export const EVIDENCE: { id: EvidenceId; label: string; line: string }[] = [
  { id: "distributor", label: "Distributor delivery receipt", line: "the distributor delivery receipt for the original release" },
  { id: "isrc", label: "ISRC / UPC registration", line: "the ISRC/UPC registration for the recording" },
  { id: "stems", label: "Session files / stems / masters", line: "the original session files, stems and masters" },
  { id: "contract", label: "Contract or split sheet", line: "the producer/artist contract or split sheet" },
  { id: "dates", label: "Dated proof of first release", line: "dated proof of first publication" },
  { id: "registration", label: "Copyright registration", line: "the copyright registration" },
];

export type StatementCtx = {
  reason: ReasonId;
  /** "Jane Doe" / "Audia Music Recordings LLC" */
  owner: string;
  platform?: string;
  count?: number;
  /** ISO date or free text, when the original was first published */
  firstReleased?: string;
  originalUrl?: string;
  /** e.g. "0:12–0:48 of the infringing track" */
  matching?: string;
  evidence?: EvidenceId[];
};

const clean = (s?: string) => (s ?? "").trim();
const many = (n: number | undefined, one: string, more: string) => ((n ?? 1) > 1 ? more : one);

export function evidenceLine(ids: EvidenceId[] = []) {
  const lines = EVIDENCE.filter((e) => ids.includes(e.id)).map((e) => e.line);
  if (!lines.length) return "";
  const list = lines.length === 1 ? lines[0]! : `${lines.slice(0, -1).join(", ")} and ${lines.at(-1)}`;
  return `Supporting documentation is available on request, including ${list}.`;
}

/** A calm, specific statement a copyright agent can act on without follow-up questions. */
export function buildStatement(c: StatementCtx): string {
  const owner = clean(c.owner) || "the rights owner";
  const p = clean(c.platform) || "the platform";
  const n = c.count ?? 1;
  const rec = many(n, "the sound recording identified in this notice", "the sound recordings identified in this notice");
  const date = clean(c.firstReleased);
  const orig = clean(c.originalUrl);
  const id = `I am ${owner} and I own the exclusive rights in ${rec}${date ? `, first published on ${date}` : ""}${orig ? `. The authorized release is available at ${orig}` : ""}.`;
  const lead =
    c.reason === "reupload"
      ? `The linked ${many(n, "recording reproduces", "recordings reproduce")} my master recording without alteration. It was delivered to ${p} by a party I have not authorized, licensed or contracted.`
      : c.reason === "sample"
        ? `The linked ${many(n, "recording incorporates", "recordings incorporate")} a portion of my master recording${clean(c.matching) ? ` (${clean(c.matching)})` : ""} without a license or clearance from me.`
        : c.reason === "wrong_artist"
          ? `The linked ${many(n, "release is", "releases are")} attributed to my artist profile, but ${many(n, "it was", "they were")} not created, delivered or authorized by me. This misattribution conflicts with my catalog.`
          : c.reason === "impersonation"
            ? `The linked artist profile uses my artist name in a way that is likely to confuse listeners, and it makes available recordings that I own without my authorization.`
            : `The linked artist profile makes available ${many(n, "a recording", "recordings")} that I own, and I have not licensed, authorized or contracted the account holder to distribute ${many(n, "it", "them")}.`;
  const ask = `I request that ${p} remove or disable access to the material at the locations listed in this notice, and confirm the action by reply to the contact details below.`;
  return [id, lead, evidenceLine(c.evidence), ask].filter(Boolean).join("\n\n");
}

// ------------------------------------------------------------------ notice strength review
export type NoticeLike = {
  platform: string;
  work_title: string;
  isrc: string | null;
  upc: string | null;
  original_url: string | null;
  infringing: string[];
  description: string;
  contact: { name: string; email: string; phone: string; address: string; country: string; company?: string };
  signature: string;
};
export type Check = { id: string; ok: boolean; label: string; tip: string; weight: number };
export type Review = { score: number; grade: "strong" | "good" | "weak"; checks: Check[]; todo: Check[] };

const LOUD = /(scam|scammer|thief|thieves|\bstole\b|stolen|fraud|criminal|idiot|illegal|rip-?off|piracy|pirate|hate|trash)/i;
const DATE = /(\b(19|20)\d{2}-\d{2}-\d{2}\b|\b(19|20)\d{2}\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? \d{1,2}\b)/i;
const DIRECT = /(\/(track|album|artist|playlist|video|release)s?\/|watch\?v=|youtu\.be\/|\/@[\w.-]+\/video\/|\/browse\/|\/(song|albums?)\/)/i;

export function reviewNotice(d: NoticeLike, ctx: { works?: number; hasEvidence?: boolean } = {}): Review {
  const text = d.description.trim();
  const body = text.replace(/\s+/g, " ");
  const checks: Check[] = [
    { id: "links", weight: 20, ok: d.infringing.length > 0 && d.infringing.every((u) => DIRECT.test(u) || /^https?:\/\/[^/]+\/[^?#]{6,}/.test(u)), label: "Every link goes straight to the infringing item", tip: "Use the track/album/profile link itself — not a search page or a homepage." },
    { id: "ids", weight: 15, ok: !!(d.isrc || d.upc) || (ctx.works ?? 0) > 1, label: "Work identified (ISRC/UPC or each item listed)", tip: "Add the ISRC or UPC so the agent can match your recording in seconds." },
    { id: "orig", weight: 15, ok: !!d.original_url?.trim(), label: "Link to your authorized release", tip: "Paste your official release link — it proves the date and ownership at a glance." },
    { id: "date", weight: 10, ok: DATE.test(body), label: "First-release date stated", tip: "State when you first published the recording (e.g. 2026-03-01)." },
    { id: "specific", weight: 15, ok: /(without|not authori[sz]ed|unauthori[sz]ed|no license|not licensed|not created)/i.test(body) && body.length >= 80, label: "Says exactly what is infringing and that you didn't authorize it", tip: "One or two factual sentences: what was copied and that no license was given." },
    { id: "evidence", weight: 10, ok: !!ctx.hasEvidence || /supporting documentation|evidence/i.test(body), label: "Offers proof on request", tip: "Tick the documents you can provide — you only share them if asked." },
    { id: "tone", weight: 10, ok: !LOUD.test(text) && !/!{2,}/.test(text) && !(text.length > 20 && text === text.toUpperCase()), label: "Calm, factual tone", tip: "Remove insults and accusations (e.g. “scam”, “thief”, “!!”). Facts get actioned faster." },
    { id: "contact", weight: 5, ok: !!(d.contact.name.trim() && /^\S+@\S+\.\S+$/.test(d.contact.email.trim()) && d.contact.phone.trim() && d.contact.address.trim() && d.contact.country.trim() && d.signature.trim()), label: "Complete contact details and signature", tip: "Name, email, phone, postal address, country and typed signature are all required." },
  ];
  const total = checks.reduce((a, c) => a + c.weight, 0);
  const score = Math.round((checks.filter((c) => c.ok).reduce((a, c) => a + c.weight, 0) / total) * 100);
  return { score, grade: score >= 85 ? "strong" : score >= 60 ? "good" : "weak", checks, todo: checks.filter((c) => !c.ok) };
}
