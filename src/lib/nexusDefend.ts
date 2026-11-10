/**
 * Nexus Defender — heuristic checks for uploads and Android packages.
 * This is not a signature antivirus. It blocks obvious malware containers
 * and reports risky APK structure. Packages are not stored.
 */

import { listZipEntries } from "./zipNames";
import { scanUpload, type MalwareScan } from "./malwareGuard";

export type DefendFinding = { level: "ok" | "warn" | "block"; detail: string };

export type DefendReport = {
  ok: boolean;
  kind: "file" | "apk";
  findings: DefendFinding[];
};

const NESTED = /\.(apk|exe|dll|dex|jar|bat|cmd|scr|msi|html|js|vbs)$/i;

export async function defendFile(file: File): Promise<DefendReport> {
  const ext = file.name.toLowerCase().split(".").pop() || "";
  if (ext === "apk" || file.type === "application/vnd.android.package-archive") {
    return defendApk(file);
  }
  const scan: MalwareScan = await scanUpload(file, { fileName: file.name, context: "any" });
  if (!scan.ok) return { ok: false, kind: "file", findings: [{ level: "block", detail: scan.reason }] };
  return { ok: true, kind: "file", findings: [{ level: "ok", detail: "No blocked executable, script, or polyglot pattern in the sample." }] };
}

export async function defendApk(file: File): Promise<DefendReport> {
  const findings: DefendFinding[] = [];
  if (file.size > 80 * 1024 * 1024) {
    return { ok: false, kind: "apk", findings: [{ level: "block", detail: "APK scan stops at 80 MB so a huge archive cannot tie up the server." }] };
  }
  if (file.size < 64) {
    return { ok: false, kind: "apk", findings: [{ level: "block", detail: "File is too small to be an Android package." }] };
  }
  const buf = await file.arrayBuffer();
  const head = new Uint8Array(buf.slice(0, 4));
  const zip = head[0] === 0x50 && head[1] === 0x4b;
  if (!zip) {
    return { ok: false, kind: "apk", findings: [{ level: "block", detail: "APKs are zip archives. This file does not start with a zip header." }] };
  }
  let entries;
  try {
    entries = listZipEntries(buf);
  } catch {
    return { ok: false, kind: "apk", findings: [{ level: "block", detail: "The zip directory could not be read. The package looks damaged or hostile." }] };
  }
  if (entries.length >= 4000) findings.push({ level: "warn", detail: "Entry list was capped at 4,000 names." });

  const names = entries.map((entry) => entry.name.replace(/\\/g, "/"));
  const hasManifest = names.some((name) => name === "AndroidManifest.xml");
  const hasDex = names.some((name) => /(^|\/)classes\d*\.dex$/i.test(name));
  if (!hasManifest) findings.push({ level: "block", detail: "AndroidManifest.xml is missing." });
  else findings.push({ level: "ok", detail: "AndroidManifest.xml is present." });
  if (!hasDex) findings.push({ level: "warn", detail: "No classes.dex was found. Split or native-only packages need a closer look." });
  else findings.push({ level: "ok", detail: "Dalvik bytecode is present." });

  if (names.some((name) => name.includes("..") || name.startsWith("/") || name.includes("\0"))) {
    findings.push({ level: "block", detail: "A zip entry uses a path that could escape the package." });
  }
  const nested = names.filter((name) => NESTED.test(name) && !/(^|\/)classes\d*\.dex$/i.test(name));
  if (nested.length) {
    findings.push({ level: "block", detail: `Nested executable content: ${nested.slice(0, 5).join(", ")}` });
  }
  if (entries.some((entry) => entry.flags & 0x1)) {
    findings.push({ level: "warn", detail: "An entry is encrypted inside the zip." });
  }
  if (entries.some((entry) => entry.uncompressed > 80 * 1024 * 1024)) {
    findings.push({ level: "block", detail: "An entry claims a huge uncompressed size (zip-bomb pattern)." });
  }
  const cert = names.some((name) => /^META-INF\/.+\.(RSA|DSA|EC)$/i.test(name));
  findings.push(cert ? { level: "ok", detail: "A signature file is in META-INF." } : { level: "warn", detail: "No META-INF signature file was found." });

  const blocked = findings.some((item) => item.level === "block");
  if (!findings.length) findings.push({ level: "ok", detail: "No structural warnings." });
  return { ok: !blocked, kind: "apk", findings };
}
