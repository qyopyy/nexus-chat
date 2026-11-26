// Follow-up tracking for sent takedown notices: when to nudge, when to escalate, and ready-to-send wording.
// Pure functions (no DOM/network) so they can be unit-tested.

export type NoticeRec = {
  id: string;
  status: "draft" | "sent" | "resolved" | "rejected";
  sent_at: string | null;
  work_title: string;
  isrc?: string | null;
  upc?: string | null;
  infringing: string[];
  platform: string;
  contact: { name: string; company?: string; email: string };
};

export type Stage = "waiting" | "follow_up" | "escalate" | "done" | "rejected" | "draft";
export type FollowUp = { stage: Stage; days: number | null; label: string; next: string };

export const FOLLOW_UP_DAYS = 7;
export const ESCALATE_DAYS = 14;

const DAY = 86400_000;
export const daysSince = (iso: string | null, now = Date.now()) => (iso ? Math.max(0, Math.floor((now - Date.parse(iso)) / DAY)) : null);

export function followUpState(n: NoticeRec, now = Date.now()): FollowUp {
  if (n.status === "resolved") return { stage: "done", days: daysSince(n.sent_at, now), label: "Taken down", next: "Nothing to do — keep the profile watched so it doesn't reappear." };
  if (n.status === "rejected") return { stage: "rejected", days: daysSince(n.sent_at, now), label: "Rejected", next: "Read the reply, add the missing proof (release link, ISRC, dates) and send a corrected notice." };
  if (n.status === "draft" || !n.sent_at) return { stage: "draft", days: null, label: "Draft", next: "Finish and send it." };
  const d = daysSince(n.sent_at, now)!;
  if (d >= ESCALATE_DAYS) return { stage: "escalate", days: d, label: `No result after ${d} days`, next: "Escalate: use the platform's web form, ask your distributor to open a case, and attach the same proof." };
  if (d >= FOLLOW_UP_DAYS) return { stage: "follow_up", days: d, label: `Follow-up due (${d} days)`, next: "Send a short, polite follow-up quoting your original notice." };
  return { stage: "waiting", days: d, label: `Waiting (day ${d})`, next: `Platforms usually need a few days — follow up on day ${FOLLOW_UP_DAYS}.` };
}

const fmtDate = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

export function followUpSubject(n: NoticeRec) {
  return `Follow-up: copyright notice sent ${fmtDate(n.sent_at)} — “${n.work_title}”`;
}

export function followUpText(n: NoticeRec, platformName: string, now = Date.now()): string {
  const d = daysSince(n.sent_at, now) ?? 0;
  const ids = [n.isrc && `ISRC ${n.isrc}`, n.upc && `UPC ${n.upc}`].filter(Boolean).join(", ");
  const links = n.infringing.slice(0, 20).map((u, i) => `  ${i + 1}. ${u}`).join("\n");
  const more = n.infringing.length > 20 ? `\n  …and ${n.infringing.length - 20} more listed in the original notice` : "";
  return [
    `Hello ${platformName} Copyright Team,`,
    "",
    `On ${fmtDate(n.sent_at)} (${d} day${d === 1 ? "" : "s"} ago) I sent a copyright infringement notice regarding “${n.work_title}”${ids ? ` (${ids})` : ""}. I have not yet received a confirmation or a reference number, and the material is still available at:`,
    links + more,
    "",
    "Could you please confirm that the notice was received, share the case reference, and let me know if any further information would help you act on it? I can provide documentation of ownership on request.",
    "",
    "Thank you for your time.",
    "",
    n.contact.name + (n.contact.company ? `, ${n.contact.company}` : ""),
    n.contact.email,
  ].join("\n");
}

export type Counts = Record<Stage, number>;
export function summarize(list: NoticeRec[], now = Date.now()): { counts: Counts; due: NoticeRec[] } {
  const counts: Counts = { waiting: 0, follow_up: 0, escalate: 0, done: 0, rejected: 0, draft: 0 };
  const due: NoticeRec[] = [];
  for (const n of list) {
    const s = followUpState(n, now).stage;
    counts[s]++;
    if (s === "follow_up" || s === "escalate") due.push(n);
  }
  due.sort((a, b) => Date.parse(a.sent_at ?? "") - Date.parse(b.sent_at ?? ""));
  return { counts, due };
}
