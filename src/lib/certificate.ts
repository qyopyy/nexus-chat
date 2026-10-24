// Shield 360 proof-of-creation certificate (PDF) — evidence of what was registered, by whom, and when.
import { Pdf } from "./pdf";
import type { ShieldWork } from "./shield";

const dt = (d: string) => new Date(d).toLocaleString("en-US", { dateStyle: "long", timeStyle: "long", timeZone: "UTC" });
const dur = (s: number | null) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}` : "—");
const size = (n: number | null) => (n ? (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`) : "—");

export function buildCertificate(w: ShieldWork, owner: { name: string; username: string }) {
  const pdf = new Pdf({ title: `Proof of Registration – ${w.title}`, author: "Nexus Shield 360" });
  pdf.footer = `Nexus Shield 360 · Certificate ${w.id}`;
  pdf.h1("Certificate of Registration");
  pdf.para("Nexus Shield 360 — audio fingerprint protection", { size: 10, color: "0.42 0.43 0.47", gap: 12 });
  pdf.para(
    [
      { t: "This certifies that the recording below was registered in Nexus Shield 360 by " },
      { t: `${owner.name} (@${owner.username})`, b: true },
      { t: " on " },
      { t: dt(w.created_at), b: true },
      { t: ". At registration Nexus computed an audio fingerprint of the full recording and a SHA-256 hash of the exact file that was uploaded. Those values are stored on Nexus servers with the registration time and cannot be edited by the owner." },
    ],
    { gap: 10 },
  );
  pdf.h2("Recording");
  pdf.table(
    [
      ["Title", w.title],
      ["Artist", w.artist || "—"],
      ["ISRC", w.isrc || "—"],
      ["UPC", w.upc || "—"],
      ["Duration", dur(w.duration)],
      ["Original file", `${w.file_name || "—"} (${size(w.bytes)})`],
    ],
    { widths: [0.26, 0.74] },
  );
  pdf.h2("Registration evidence");
  pdf.table(
    [
      ["Registration ID", w.id],
      ["Registered (UTC)", dt(w.created_at)],
      ["Registered by", `${owner.name} (@${owner.username})`],
      ["File SHA-256", w.sha256 || "not recorded"],
      ["Fingerprint", `${w.hash_count.toLocaleString("en-US")} landmarks across the full recording`],
      ["Protection status", w.status === "locked" ? (w.unlock_at ? `Locked until ${dt(w.unlock_at)}` : "Locked") : "Unlocked (Content ID tracking)"],
      ["Certificate issued (UTC)", dt(new Date().toISOString())],
    ],
    { widths: [0.26, 0.74] },
  );
  pdf.h2("How to check it");
  pdf.bullets([
    "Compute the SHA-256 hash of your original file (macOS/Linux: shasum -a 256 file.wav · Windows: certutil -hashfile file.wav SHA256) and compare it with the hash above.",
    "Nexus support can confirm the registration ID, time and hash from its records on request.",
    "Keep this certificate together with your project files, stems, session files and drafts — together they show when the work existed and who had it.",
  ]);
  pdf.para([{ t: "This certificate records a registration in Nexus. It is evidence of possession at a point in time, not an official copyright registration or a legal ruling on ownership.", i: true }], { size: 9, color: "0.42 0.43 0.47" });
  return pdf.output();
}
