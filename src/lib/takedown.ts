"use client";

// Copyright takedown notices for streaming DSPs (Spotify, Apple Music, Deezer, YouTube Claim, …).
// Notices are sent by the rights holder themselves (their own email app, or the platform's official form),
// so replies from the DSP go straight back to them. Nexus keeps a record of every notice.

import { supabase, errorText } from "./supabase";
import { useApp, toast } from "@/store/app";

export type Platform = "spotify" | "apple" | "deezer" | "youtube" | "youtube_music" | "soundcloud" | "tidal" | "amazon" | "tiktok";
export type TakedownStatus = "draft" | "sent" | "resolved" | "rejected";
export type Contact = { name: string; company: string; role: "owner" | "agent"; email: string; phone: string; address: string; country: string };
export type Takedown = {
  id: string;
  owner_id: string;
  platform: Platform;
  status: TakedownStatus;
  work_title: string;
  work_artist: string | null;
  isrc: string | null;
  upc: string | null;
  original_url: string | null;
  infringing: string[];
  description: string;
  contact: Contact;
  signature: string;
  shield_work: string | null;
  sent_via?: "nexus" | "email_app" | "form" | null;
  note: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
};
export type Draft = Omit<Takedown, "id" | "owner_id" | "status" | "note" | "sent_at" | "sent_via" | "created_at" | "updated_at">;

export type PlatformInfo = {
  name: string;
  color: string;
  /** short chip label */
  short: string;
  email: string;
  form: string;
  policy: string;
  link: RegExp;
  linkHint: string;
  blurb: string;
  /** primary CTA: email notice, official web form, or both */
  prefer: "email" | "form";
};

export const PLATFORMS: Platform[] = ["spotify", "apple", "deezer", "youtube", "youtube_music", "soundcloud", "tidal", "amazon", "tiktok"];

export const PLATFORM: Record<Platform, PlatformInfo> = {
  spotify: {
    name: "Spotify",
    short: "Spotify",
    color: "#1DB954",
    email: "infringement-claim@spotify.com",
    form: "https://support.spotify.com/report-content/",
    policy: "https://www.spotify.com/legal/intellectual-property-policy/",
    link: /^https?:\/\/(open\.spotify\.com|spotify\.link)\//i,
    linkHint: "https://open.spotify.com/track/…",
    blurb: "Email Spotify's copyright team or use their report form",
    prefer: "email",
  },
  apple: {
    name: "Apple Music",
    short: "Apple",
    color: "#FA243C",
    email: "copyrightnotices@apple.com",
    form: "https://www.apple.com/legal/intellectual-property/dispute-forms/music/music-dispute.html",
    policy: "https://www.apple.com/legal/contact/copyright-infringement.html",
    link: /^https?:\/\/(music\.apple\.com|itunes\.apple\.com|geo\.music\.apple\.com)\//i,
    linkHint: "https://music.apple.com/…/album/…",
    blurb: "Apple Music dispute form or Apple's copyright agent",
    prefer: "form",
  },
  deezer: {
    name: "Deezer",
    short: "Deezer",
    color: "#A238FF",
    email: "copyright@deezer.com",
    form: "https://www.deezer.com/legal/copyright",
    policy: "https://www.deezer.com/legal/copyright",
    link: /^https?:\/\/(www\.)?deezer\.com\//i,
    linkHint: "https://www.deezer.com/track/…",
    blurb: "Email Deezer copyright or open their copyright page",
    prefer: "email",
  },
  youtube: {
    name: "YouTube Claim / Content ID",
    short: "YT Claim",
    color: "#FF0000",
    email: "copyright@youtube.com",
    form: "https://www.youtube.com/copyright_complaint_form",
    policy: "https://www.youtube.com/howyoutubeworks/policies/copyright/",
    link: /^https?:\/\/((www|m)\.)?(youtube\.com|youtu\.be)\//i,
    linkHint: "https://www.youtube.com/watch?v=…",
    blurb: "YouTube copyright complaint form (Content ID / web claim)",
    prefer: "form",
  },
  youtube_music: {
    name: "YouTube Music",
    short: "YT Music",
    color: "#FF0033",
    email: "copyright@youtube.com",
    form: "https://www.youtube.com/copyright_complaint_form",
    policy: "https://www.youtube.com/howyoutubeworks/policies/copyright/",
    link: /^https?:\/\/(music\.youtube\.com|((www|m)\.)?youtube\.com\/)\S*/i,
    linkHint: "https://music.youtube.com/watch?v=…",
    blurb: "YouTube Music / Content ID via YouTube's copyright form",
    prefer: "form",
  },
  soundcloud: {
    name: "SoundCloud",
    short: "SoundCloud",
    color: "#FF5500",
    email: "copyright@soundcloud.com",
    form: "https://soundcloud.com/pages/copyright",
    policy: "https://soundcloud.com/terms-of-use",
    link: /^https?:\/\/(www\.)?soundcloud\.com\//i,
    linkHint: "https://soundcloud.com/artist/track-…",
    blurb: "Email SoundCloud copyright or use their copyright page",
    prefer: "email",
  },
  tidal: {
    name: "TIDAL",
    short: "TIDAL",
    color: "#000000",
    email: "copyright@tidal.com",
    form: "https://tidal.com/terms",
    policy: "https://tidal.com/terms",
    link: /^https?:\/\/(listen\.)?tidal\.com\//i,
    linkHint: "https://tidal.com/browse/track/…",
    blurb: "Email TIDAL's copyright agent with a DMCA-style notice",
    prefer: "email",
  },
  amazon: {
    name: "Amazon Music",
    short: "Amazon",
    color: "#FF9900",
    email: "copyright@amazon.com",
    form: "https://www.amazon.com/report/infringement",
    policy: "https://www.amazon.com/gp/help/customer/display.html?nodeId=201270808",
    link: /^https?:\/\/(music\.amazon\.[a-z.]+|www\.amazon\.[a-z.]+\/.*music)\//i,
    linkHint: "https://music.amazon.com/albums/…",
    blurb: "Amazon Music / Amazon infringement report form",
    prefer: "form",
  },
  tiktok: {
    name: "TikTok",
    short: "TikTok",
    color: "#111111",
    email: "copyright@tiktok.com",
    form: "https://www.tiktok.com/legal/report/Copyright",
    policy: "https://www.tiktok.com/legal/page/us/copyright-policy/en",
    link: /^https?:\/\/(www\.)?(tiktok\.com|vm\.tiktok\.com)\//i,
    linkHint: "https://www.tiktok.com/@user/video/…",
    blurb: "TikTok copyright report form (music & video)",
    prefer: "form",
  },
};

export const STATUS: Record<TakedownStatus, { label: string; color: string }> = {
  draft: { label: "Draft", color: "#80848e" },
  sent: { label: "Sent", color: "#f0b232" },
  resolved: { label: "Taken down", color: "#23a55a" },
  rejected: { label: "Rejected", color: "#ed4245" },
};

// ------------------------------------------------------------------ contact (remembered in this browser)
const CKEY = "nexus:takedown-contact";
export const emptyContact = (): Contact => ({ name: "", company: "", role: "owner", email: "", phone: "", address: "", country: "" });
export function loadContact(): Contact {
  try {
    return { ...emptyContact(), ...(JSON.parse(localStorage.getItem(CKEY) ?? "{}") as Partial<Contact>) };
  } catch {
    return emptyContact();
  }
}
export function saveContact(c: Contact) {
  try {
    localStorage.setItem(CKEY, JSON.stringify(c));
  } catch {
    /* storage unavailable */
  }
}

// ------------------------------------------------------------------ notice text
export function splitLinks(text: string) {
  return [...new Set(text.split(/[\s,]+/).map((s) => s.trim()).filter((s) => /^https?:\/\//i.test(s)))].slice(0, 50);
}

export function problems(d: Draft) {
  const p: string[] = [];
  const info = PLATFORM[d.platform];
  if (!info) p.push("Platform");
  if (!d.work_title.trim()) p.push("Song title");
  if (!d.infringing.length) p.push("At least one infringing link");
  if (info) {
    const bad = d.infringing.filter((u) => !info.link.test(u));
    if (bad.length) p.push(`${bad.length} link(s) aren't ${info.name} links`);
  }
  if (d.description.trim().length < 10) p.push("Description of the infringement");
  if (!d.contact.name.trim()) p.push("Your full name");
  if (!/^\S+@\S+\.\S+$/.test(d.contact.email.trim())) p.push("Your email");
  if (!d.contact.phone.trim()) p.push("Phone number");
  if (!d.contact.address.trim()) p.push("Postal address");
  if (!d.contact.country.trim()) p.push("Country");
  if (d.contact.role === "agent" && !d.contact.company.trim()) p.push("Company you act for");
  if (d.signature.trim().toLowerCase() !== d.contact.name.trim().toLowerCase() || !d.signature.trim()) p.push("Signature (type your full name exactly)");
  if (d.isrc && !/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(d.isrc)) p.push("ISRC format (e.g. QT6HV2600001)");
  if (d.upc && !/^\d{8,14}$/.test(d.upc)) p.push("UPC (8–14 digits)");
  return p;
}

export function subject(d: Draft) {
  return `Copyright infringement notice (DMCA) — “${d.work_title.trim()}”${d.work_artist ? ` by ${d.work_artist.trim()}` : ""}`;
}

export function noticeText(d: Draft, date = new Date()) {
  const c = d.contact;
  const P = PLATFORM[d.platform];
  const owner = c.role === "agent" ? `${c.company.trim()} (I am an authorized agent acting on its behalf)` : c.company.trim() || c.name.trim();
  const shareLine =
    d.platform === "spotify"
      ? "   I acknowledge that my contact information and this notice may be provided to the person(s) who provided the allegedly infringing content, and may be retained for legal purposes."
      : "   I understand that under 17 U.S.C. § 512(f) I may be liable for damages if I knowingly materially misrepresent that material or activity is infringing.";
  const lines: (string | null)[] = [
    `To: ${P.name} — Copyright Agent`,
    `Date: ${date.toISOString().slice(0, 10)}`,
    "",
    "NOTICE OF COPYRIGHT INFRINGEMENT",
    "(Digital Millennium Copyright Act, 17 U.S.C. § 512(c)(3), and applicable local law)",
    "",
    "1. COPYRIGHTED WORK",
    `   Title: ${d.work_title.trim()}`,
    d.work_artist ? `   Artist: ${d.work_artist.trim()}` : null,
    d.isrc ? `   ISRC: ${d.isrc}` : null,
    d.upc ? `   UPC: ${d.upc}` : null,
    d.original_url ? `   Authorized release: ${d.original_url.trim()}` : null,
    `   Rights owner: ${owner}`,
    "",
    `2. INFRINGING MATERIAL ON ${P.name.toUpperCase()}`,
    ...d.infringing.map((u, i) => `   ${i + 1}. ${u}`),
    "",
    "3. DESCRIPTION",
    ...d.description.trim().split("\n").map((l) => `   ${l}`),
    "",
    "4. CONTACT INFORMATION",
    `   Name: ${c.name.trim()}`,
    c.company.trim() ? `   Company: ${c.company.trim()}` : null,
    `   Address: ${c.address.trim()}, ${c.country.trim()}`,
    `   Phone: ${c.phone.trim()}`,
    `   Email: ${c.email.trim()}`,
    "",
    "5. STATEMENTS",
    "   I have a good faith belief that use of the material in the manner complained of is not authorized by the copyright owner, its agent, or the law.",
    "   The information in this notice is accurate, and under penalty of perjury, I am the owner, or an agent authorized to act on behalf of the owner, of an exclusive right that is allegedly infringed.",
    shareLine,
    "",
    "Please remove or disable access to the infringing material listed above.",
    "",
    `Signature: /${d.signature.trim()}/`,
    `${c.name.trim()}${c.company.trim() ? `, ${c.company.trim()}` : ""}`,
  ];
  return lines.filter((l): l is string => l !== null).join("\n");
}

export function mailtoUrl(d: Draft) {
  return `mailto:${PLATFORM[d.platform].email}?subject=${encodeURIComponent(subject(d))}&body=${encodeURIComponent(noticeText(d))}`;
}

/** printable copy (save as PDF) */
export function printNotice(d: Draft) {
  const w = window.open("", "_blank");
  if (!w) return toast("Allow pop-ups to print the notice", "error");
  const esc = (s: string) => s.replace(/[&<>]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[ch]!);
  w.document.write(
    `<!doctype html><meta charset="utf-8"><title>${esc(subject(d))}</title><style>body{font:14px/1.5 -apple-system,Segoe UI,sans-serif;max-width:760px;margin:40px auto;padding:0 20px;color:#111}pre{white-space:pre-wrap;font:inherit}</style><pre>${esc(noticeText(d))}</pre><script>setTimeout(()=>print(),300)</script>`,
  );
  w.document.close();
}

// ------------------------------------------------------------------ records
export async function listTakedowns() {
  const me = useApp.getState().userId;
  const { data } = await supabase.from("takedown_notices").select("*").eq("owner_id", me).order("created_at", { ascending: false }).limit(200);
  return (data ?? []) as Takedown[];
}
export async function saveTakedown(d: Draft, id?: string | null, patch: Partial<Takedown> = {}) {
  const row = {
    ...d,
    work_title: d.work_title.trim(),
    work_artist: d.work_artist?.trim() || null,
    isrc: d.isrc || null,
    upc: d.upc || null,
    original_url: d.original_url?.trim() || null,
    description: d.description.trim(),
    signature: d.signature.trim(),
    updated_at: new Date().toISOString(),
    ...patch,
  };
  const q = id
    ? supabase.from("takedown_notices").update(row).eq("id", id).select().single()
    : supabase.from("takedown_notices").insert({ ...row, owner_id: useApp.getState().userId }).select().single();
  const { data, error } = await q;
  if (error) {
    toast(errorText(error), "error");
    return null;
  }
  return data as Takedown;
}
export async function setTakedownStatus(id: string, status: TakedownStatus, note?: string | null) {
  const { error } = await supabase
    .from("takedown_notices")
    .update({ status, note: note ?? null, updated_at: new Date().toISOString(), ...(status === "sent" ? { sent_at: new Date().toISOString() } : {}) })
    .eq("id", id);
  if (error) toast(errorText(error), "error");
  return !error;
}
export async function removeTakedown(id: string) {
  const { error } = await supabase.from("takedown_notices").delete().eq("id", id);
  if (error) toast(errorText(error), "error");
  return !error;
}

// ------------------------------------------------------------------ direct sending (email code → verified → Nexus sends)
async function fn<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("takedown", { body });
  if (error) {
    let msg = errorText(error);
    let extra: Record<string, unknown> = {};
    try {
      const j = await (error as { context?: Response }).context?.json();
      if (j?.error) msg = j.error;
      extra = j ?? {};
    } catch {
      /* not json */
    }
    throw Object.assign(new Error(msg), extra);
  }
  return data as T;
}
export const sendStatus = () =>
  fn<{ configured?: boolean; test?: boolean; verified?: string[] }>({ action: "status" })
    .then((r) => ({ configured: !!r?.configured, test: !!r?.test, verified: Array.isArray(r?.verified) ? r.verified : [] }))
    .catch(() => ({ configured: false, test: false, verified: [] as string[] }));
export const sendCode = (email: string) => fn<{ ok: boolean }>({ action: "send_code", email });
export const verifyCode = (email: string, code: string) => fn<{ ok: boolean }>({ action: "verify", email, code });
export const sendDirect = (id: string) => fn<{ ok: boolean; to: string }>({ action: "send", id });

// ------------------------------------------------------------------ prefill (e.g. from Profile Defender)
export type Prefill = { platform?: Platform; work_title?: string; work_artist?: string; links?: string[]; description?: string };
let pending: Prefill | null = null;
export function prefillTakedown(p: Prefill) {
  pending = p;
}
export function takePrefill() {
  const p = pending;
  pending = null;
  return p;
}
