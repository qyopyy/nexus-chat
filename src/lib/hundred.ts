"use client";

/**
 * Small, used helpers for this round's chat + Wump polish.
 * Each export is called from a screen so the behavior is real.
 */

export function previewLine(m: {
  deleted_at?: string | null;
  hidden?: boolean | null;
  spoiler?: boolean | null;
  content?: string | null;
  attachment_name?: string | null;
  attachment_type?: string | null;
}) {
  if (m.deleted_at) return "Message deleted";
  if (m.hidden) return "Hidden message";
  if (m.spoiler) return "Spoiler";
  if (m.attachment_type?.startsWith("audio") || m.attachment_name?.startsWith("voice-")) return "Voice message";
  if (m.attachment_type) {
    const kind = fileKindLabel(m.attachment_type);
    if (kind !== "File") return kind;
  }
  const text = m.content?.trim();
  if (text) return text;
  if (m.attachment_name) return m.attachment_name;
  return "Message";
}

export function seenCount(createdAt: string, reads: Record<string, string>, me: string | null, pending?: boolean, deleted?: string | null) {
  if (!me || pending || deleted) return 0;
  const at = Date.parse(createdAt);
  if (!Number.isFinite(at)) return 0;
  let n = 0;
  for (const [id, iso] of Object.entries(reads)) {
    if (id === me) continue;
    const t = Date.parse(iso);
    if (Number.isFinite(t) && t >= at) n += 1;
  }
  return n;
}

export function seenLabel(count: number, kind: string | undefined) {
  if (count <= 0) return null;
  if (kind === "dm") return "Seen";
  if (count === 1) return "Seen by 1";
  return `Seen by ${count}`;
}

export function nearLimit(length: number, max: number) {
  if (max <= 0) return false;
  return length >= Math.floor(max * 0.85);
}

export function overLimit(length: number, max: number) {
  return max > 0 && length > max;
}

export function firstDroppedFile(files: FileList | null | undefined): { file: File | null; extra: number } {
  if (!files || files.length === 0) return { file: null, extra: 0 };
  return { file: files[0], extra: Math.max(0, files.length - 1) };
}

export function escapeTarget(editing: boolean, replying: boolean): "edit" | "reply" | null {
  if (editing) return "edit";
  if (replying) return "reply";
  return null;
}

export function placeAlertText(kind: string, name: string) {
  const place = name.trim() || "a saved place";
  return kind === "leave" ? `Left ${place}` : `Arrived at ${place}`;
}

export function meetupTitleOk(title: string) {
  const t = title.trim();
  return t.length >= 1 && t.length <= 80;
}

export function prefersReducedMotion() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function connectionLabel(online: boolean) {
  return online ? "Back online" : "You're offline. New messages will catch up when you reconnect.";
}

export function liveAnnouncement(author: string, preview: string) {
  const who = author.trim() || "Someone";
  const body = preview.trim() || "sent a message";
  return `${who}: ${body}`.slice(0, 180);
}

export function readsFromRows(rows: { user_id: string; last_read_at: string }[] | null | undefined) {
  const reads: Record<string, string> = {};
  for (const r of rows ?? []) {
    if (r.user_id && r.last_read_at) reads[r.user_id] = r.last_read_at;
  }
  return reads;
}

export function rememberMessage(seen: Set<string>, id: string, cap = 400) {
  if (seen.has(id)) return false;
  seen.add(id);
  if (seen.size > cap) {
    const drop = seen.size - cap;
    let i = 0;
    for (const k of seen) {
      seen.delete(k);
      if (++i >= drop) break;
    }
  }
  return true;
}

export function privacyFromRow(row: Record<string, unknown> | null | undefined) {
  if (!row) return null;
  return {
    wump_default_visible: row.wump_default_visible,
    wump_precision: row.wump_precision,
    wump_allow_background: row.wump_allow_background,
    wump_allow_nearby_alerts: row.wump_allow_nearby_alerts,
    wump_who_can_invite: row.wump_who_can_invite,
    wump_share_enabled: row.wump_share_enabled,
    wump_record_trail: row.wump_record_trail,
    wump_share_trail: row.wump_share_trail,
    wump_onboarded_at: row.wump_onboarded_at,
  };
}

export function inboxShouldToast(kind: string | null | undefined) {
  if (!kind) return false;
  if (kind === "message") return false;
  return true;
}

export function inboxToast(title: string | null | undefined, body: string | null | undefined) {
  const t = (title || "Nexus").trim();
  const b = (body || "").trim();
  return b ? `${t} — ${b}` : t;
}

export function removedChannel(channels: Record<string, { id: string }[]>, id: string) {
  const next: Record<string, { id: string }[]> = {};
  for (const [sid, list] of Object.entries(channels)) {
    next[sid] = list.filter((c) => c.id !== id);
  }
  return next;
}

export function latestOwnId(messages: { id: string; author_id: string; deleted_at: string | null; pending?: boolean }[], me: string | null) {
  if (!me) return null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.author_id === me && !m.deleted_at && !m.pending) return m.id;
  }
  return null;
}

export function isLatestPreview(lastAt: string | null | undefined, createdAt: string) {
  if (!lastAt) return true;
  const a = Date.parse(lastAt);
  const b = Date.parse(createdAt);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return b >= a - 1500;
}

export function clampEta(mins: number) {
  if (!Number.isFinite(mins)) return null;
  return Math.max(1, Math.min(1440, Math.round(mins)));
}

export function roleChip(role: string | null | undefined) {
  if (role === "home") return "Home";
  if (role === "work") return "Work";
  if (role === "school") return "School";
  return null;
}

export function alertSummary(arrive?: boolean, leave?: boolean, share?: boolean) {
  const bits: string[] = [];
  if (arrive) bits.push("arrive");
  if (leave) bits.push("leave");
  if (share && bits.length) bits.push("friends told");
  return bits.length ? bits.join(" · ") : "No alerts";
}

export function draftStorageKey(conversationId: string) {
  return `nexus.draft.${conversationId}`;
}

export function safeDraft(raw: string, max = 8000) {
  return raw.slice(0, max);
}

export function copyFailedMessage() {
  return "Couldn't copy — your browser blocked the clipboard";
}

export function extraFilesNote(extra: number) {
  if (extra <= 0) return null;
  return extra === 1 ? "Added the first file. Send it, then paste the next." : `Added the first file. ${extra} more were left out.`;
}

export function charCountLabel(length: number, max: number) {
  return `${length.toLocaleString()} / ${max.toLocaleString()}`;
}

export function srNewMessage(author: string | undefined, preview: string) {
  return liveAnnouncement(author || "New message", preview);
}

export function pinEventName() {
  return "nexus:pins";
}

export function trailEventName() {
  return "wump-trail";
}

export function privacyEventName() {
  return "wump-privacy";
}

export function placesEventName() {
  return "wump-places";
}

export function meetupsEventName() {
  return "wump-meetups";
}

export function shouldPingTrail(userId: string, rowUser: string | undefined) {
  return !!userId && rowUser === userId;
}

export function offlineKind(online: boolean): "success" | "error" {
  return online ? "success" : "error";
}

export function groupSeenTitle(count: number) {
  if (count <= 0) return undefined;
  return count === 1 ? "1 person has seen this" : `${count} people have seen this`;
}

export function dmSeenTitle() {
  return "Seen";
}

export function editingEscape(editingId: string | null, replyTo: unknown) {
  return escapeTarget(!!editingId, !!replyTo);
}

export function reactionSame(a: { user_id: string; emoji: string }, b: { user_id: string; emoji: string }) {
  return a.user_id === b.user_id && a.emoji === b.emoji;
}

export function restoreContent(prev: string, nextFailed: boolean) {
  return nextFailed ? prev : null;
}

export function heartbeatArgs(ref: { visible: string; liveLabel: string }) {
  return { visible: ref.visible, label: ref.liveLabel.trim() || undefined };
}

export function pollMs(focused: boolean) {
  return focused ? 120_000 : 180_000;
}

export function toastPlace(kind: string, name: string) {
  return placeAlertText(kind, name);
}

export function validMeetup(title: string, lat: number | null, lng: number | null) {
  return meetupTitleOk(title || "Meet up") && lat != null && lng != null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

export function nudgeBusyKey(id: string, kind: string) {
  return `${id}:${kind}`;
}

export function motionClass(reduce: boolean, base: string) {
  return reduce ? base.replace("animate-bounce", "") : base;
}

export function listPreviewAuthor(me: string | null, authorId: string | null, name: string | undefined, kind: string | undefined) {
  if (!authorId) return null;
  if (authorId === me) return "You";
  if (kind === "group") return name || "Someone";
  return null;
}

export function emptySearchCopy(hasQuery: boolean, unread: boolean) {
  if (hasQuery) return "No chats found";
  if (unread) return "You're all caught up";
  return "No chats yet";
}

export function fileKindLabel(type: string | null | undefined) {
  if (!type) return "File";
  if (type.startsWith("image")) return "Photo";
  if (type.startsWith("video")) return "Video";
  if (type.startsWith("audio")) return "Audio";
  return "File";
}

export function minutesLabel(mins: number | null | undefined) {
  if (mins == null || !Number.isFinite(mins)) return null;
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function freshPin(ageSec: number | null | undefined) {
  return ageSec != null && ageSec < 90;
}

export function batteryLow(pct: number | null | undefined) {
  return pct != null && pct <= 15;
}

export function speedKmh(mps: number | null | undefined) {
  if (mps == null || mps < 0.6) return null;
  return Math.round(mps * 3.6);
}

export function compassFromHeading(heading: number | null | undefined) {
  if (heading == null || !Number.isFinite(heading)) return null;
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const i = Math.round((((heading % 360) + 360) % 360) / 45) % 8;
  return dirs[i];
}

export function shortPlace(name: string | null | undefined, max = 42) {
  const t = (name || "").trim();
  if (!t) return null;
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export function inviteCountLabel(n: number) {
  if (n <= 0) return "Save meetup";
  return n === 1 ? "Invite 1 friend" : `Invite ${n} friends`;
}

export function rsvpWord(status: string) {
  if (status === "going") return "Going";
  if (status === "maybe") return "Maybe";
  if (status === "no") return "Can't";
  return "Invited";
}

export function quietBaseline(kind: string) {
  return kind === "arrive" || kind === "leave";
}

export function sameRead(a: string | undefined, b: string | undefined) {
  return a === b;
}

export function channelStillOpen(openId: string | null, eventId: string) {
  return !!openId && openId === eventId;
}

export function trimDraft(text: string) {
  return text.replace(/\s+$/g, "");
}

export function composerPlaceholder(editing: boolean, replying: boolean) {
  if (editing) return "Edit message";
  if (replying) return "Reply";
  return "Message";
}

export function limitTone(length: number, max: number) {
  if (overLimit(length, max)) return "over";
  if (nearLimit(length, max)) return "near";
  return "ok";
}
