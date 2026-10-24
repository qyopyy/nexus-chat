// License Maker document: pure (no app state) so it can be built anywhere.
import { Pdf, type Rich } from "./pdf";

export type LicenseStatus = "draft" | "sent" | "signed" | "paid";
export type License = {
  id: string;
  owner_id: string;
  title: string;
  artist: string;
  effective_date: string;
  fee: number;
  currency: string;
  release_type: string;
  release_date: string | null;
  isrc: string | null;
  artwork_file: string | null;
  artwork_desc: string | null;
  licensee_legal: string | null;
  licensee_address: string | null;
  licensee_email: string | null;
  payment_method: string | null;
  ai_disclosure: boolean;
  status: LicenseStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
};
export type Licensor = {
  company_full: string;
  company_short: string;
  details: string;
  signer: string;
  signer_title: string;
  credit: string;
  law: string;
  court: string;
  delivery_days: number;
  size: string;
};

export const STATUS: Record<LicenseStatus, { label: string; color: string }> = {
  draft: { label: "Draft", color: "#80848e" },
  sent: { label: "Sent", color: "#f0b232" },
  signed: { label: "Signed", color: "#5865f2" },
  paid: { label: "Paid", color: "#23a55a" },
};

export const emptyLicensor = (): Licensor => ({
  company_full: "",
  company_short: "",
  details: "",
  signer: "",
  signer_title: "Owner",
  credit: "",
  law: "Delaware",
  court: "New Castle County, Delaware",
  delivery_days: 2,
  size: "3000 × 3000 px",
});

const BLANK = "____________";
export const fmtDate = (d: string | null | undefined) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }) : BLANK);
export const today = () => new Date().toISOString().slice(0, 10);
const money = (n: number, cur: string) => `${cur} ${cur === "USD" ? "$" : cur === "EUR" ? "€" : cur === "GBP" ? "£" : ""}${Number(n).toFixed(Number(n) % 1 ? 2 : 0)}`;
/** "Outta Time (Underliner) (Sped Up)" → "OUTTA TIME" (lettering on the cover) */
export const lettering = (t: string) => t.replace(/\s*[([].*?[)\]]\s*/g, " ").replace(/\s+/g, " ").trim().toUpperCase();
export const coverFile = (t: string) => `${lettering(t).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").replace(/(^|_)([a-z])/g, (_m, a: string, b: string) => a + b.toUpperCase()) || "Cover"}_Cover.jpg`;

// ------------------------------------------------------------------ the document
export const docTitle = (l: Pick<License, "title">) => `Exclusive Artwork License – ${l.title}`;

export function buildLicensePdf(l: License, lic: Licensor): Uint8Array {
  const L = { ...emptyLicensor(), ...lic };
  const company = L.company_full || BLANK;
  const short = L.company_short || L.company_full || "Licensor";
  const eff = fmtDate(l.effective_date);
  const file = l.artwork_file || coverFile(l.title);
  const pdf = new Pdf({ title: docTitle(l), author: short });
  pdf.footer = `${docTitle(l)} · ${short}`;
  const n = (num: string, label: string, text: Rich): Rich => [{ t: `${num} ` }, { t: `${label}.`, b: true }, ...(typeof text === "string" ? [{ t: ` ${text}` }] : text)];

  pdf.h1(docTitle(l));
  pdf.para(`${eff} · ${L.signer || short}`, { size: 9.5, color: "0.42 0.43 0.47", gap: 10 });
  pdf.para(`This agreement gives ${l.artist} the exclusive right to use the "${l.title}" cover artwork. It takes effect on ${eff} (the "Effective Date").`, { gap: 8 });

  pdf.h2("1. Parties and artwork");
  pdf.table(
    [
      ["Role", "Name", "Details"],
      ["Licensor", company, L.details || BLANK],
      ["Licensee", `${l.artist} (artist name)`, `Legal name: ${l.licensee_legal || BLANK} · Address: ${l.licensee_address || BLANK} · Email: ${l.licensee_email || BLANK}`],
    ],
    { header: true, widths: [0.16, 0.36, 0.48] },
  );
  const desc = (l.artwork_desc ?? "").trim();
  pdf.para(
    n(
      "1.1",
      "Artwork",
      `"Artwork" means the single cover titled "${l.title}", delivered as ${file} (${L.size}).${desc ? ` ${desc.replace(/\.?$/, ".")}` : ""} It also includes the title lettering "${lettering(l.title)}" and the artist name "${l.artist.toUpperCase()}".`,
    ),
  );
  pdf.para(n("1.2", "Song", `"Release" means the song below. It also covers its remixes, sped-up and slowed versions, and any single, EP or album the song appears on.`));
  pdf.table(
    [
      ["Title", "Artist", "Type", "Release date", "ISRC"],
      [l.title, l.artist, l.release_type || "Single", l.release_date ? fmtDate(l.release_date) : BLANK, l.isrc || BLANK],
    ],
    { header: true, widths: [0.32, 0.2, 0.12, 0.18, 0.18] },
  );

  pdf.h2("2. Grant of exclusive license");
  pdf.para(n("2.1", "Grant", "Licensor grants Licensee an exclusive, worldwide, perpetual license to reproduce, display, distribute and publicly show the Artwork as the cover art of the Release, and to promote the Release."));
  pdf.para(n("2.2", "Permitted uses", ""), { gap: 3 });
  pdf.bullets([
    "Cover art on streaming and download services (Spotify, Apple Music, YouTube, TikTok and similar), through any distributor Licensee chooses",
    "Social media posts, ads, Canvas loops, visualizers, lyric videos and press kits for the Release",
    "Physical formats of the Release (CD, vinyl, cassette)",
    "Merchandise (shirts, posters and similar), only with Licensor's written approval, which Licensor will not unreasonably withhold",
  ]);
  pdf.para(n("2.3", "Exclusivity", "During the license, Licensor will not license, sell or give the Artwork to anyone else, and will not use it as cover art for any other release. Licensor may show the Artwork in its own portfolio, credited to the Release."));
  pdf.para(n("2.4", "Edits", "Licensee may resize, crop, recolor slightly, animate, and add logos, label marks or a Parental Advisory label. Any other changes to the character or the title lettering need Licensor's written approval."));
  pdf.para(n("2.5", "Sublicensing", "Licensee may sublicense only to its distributors, record labels and streaming platforms, and only to deliver and promote the Release. Licensee may not otherwise transfer this license without Licensor's written consent."));
  pdf.para(n("2.6", "Reserved rights", "All rights not expressly granted in this agreement stay with Licensor."));

  pdf.h2("3. Fee, ownership and terms");
  pdf.para(n("3.1", "License fee", `Licensee will pay Licensor ${money(l.fee, l.currency)} within 14 days of the Effective Date, by ${l.payment_method || BLANK} (PayPal, Wise or bank transfer). The license starts only once the full fee has been received. Fees already paid are non-refundable.`));
  pdf.para(n("3.2", "Delivery", `Licensor will deliver the Artwork as a ${L.size} JPEG within ${L.delivery_days} day${L.delivery_days === 1 ? "" : "s"} of payment. On request, Licensor will also deliver a version without text.`));
  pdf.para(n("3.3", "Ownership", "This agreement grants a license only. Whatever rights exist in the Artwork stay with Licensor, and Licensee gets no ownership. The Release's music and sound recordings stay with their own owners."));
  pdf.para(n("3.4", "Credit", `Where credits are shown, Licensee will credit "${L.credit || `Cover art: ${short}`}". A missed credit is not a breach if Licensee fixes it once notified, where the platform allows.`));
  pdf.para(n("3.5", "Licensor warranties", "Licensor confirms that:"), { gap: 3 });
  pdf.bullets(["it has the right to enter into this agreement", "the character, lettering and design are original to Licensor, are not taken from any existing artwork, character or brand, and do not depict any real person"]);
  let k = 6;
  if (l.ai_disclosure) {
    pdf.para(n(`3.${k++}`, "AI disclosure", "The Artwork was made with AI assistance. Copyright protection for AI-assisted work may be limited or unclear in some countries, including the United States. Licensor makes no promise that the Artwork can be registered for copyright or enforced against third parties."));
  }
  pdf.para(n(`3.${k++}`, "Licensee warranties", "Licensee confirms that it controls the Release and that the artist name and title on the Artwork are correct. Licensee will not use the Artwork in any unlawful or defamatory way."));
  pdf.para(n(`3.${k++}`, "Liability", "Each party's total liability under this agreement is limited to the license fee paid. Neither party is liable for indirect or lost-profit damages."));
  pdf.para(n(`3.${k++}`, "Termination", "Licensor may end this agreement by written notice if the fee is unpaid 14 days after it is due. Either party may end it for a material breach that is not fixed within 30 days of written notice. After termination, Licensee must stop new uses of the Artwork within 30 days. Copies already manufactured may be sold off."));
  pdf.para(n(`3.${k++}`, "General", ""), { gap: 3 });
  pdf.bullets([
    `${L.law} law governs this agreement. Courts in ${L.court} have jurisdiction.`,
    "This is the entire agreement about the Artwork. Changes must be made in writing and signed by both parties.",
    "Notices may be sent by email to the addresses in Section 1.",
    "Electronic signatures and signed counterparts count as originals.",
  ]);

  pdf.h2("4. Signatures");
  pdf.table(
    [
      ["", "Licensor", "Licensee"],
      ["Party", short, l.artist],
      ["Signature", "", ""],
      ["Name", L.signer || "", l.licensee_legal || ""],
      ["Title", L.signer_title || "", "Artist"],
      ["Date", eff, eff],
    ],
    { header: true, widths: [0.18, 0.41, 0.41], minRow: 14, rowMin: { 2: 40 } },
  );
  pdf.para([{ t: "Template only, not legal advice. Have a lawyer review it before signing.", i: true }], { size: 9, color: "0.42 0.43 0.47" });
  return pdf.output();
}

