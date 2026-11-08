"use client";

import { useEffect, useMemo, useState } from "react";
import { Bell, Check, CircleCheck, Keyboard, Rocket, X } from "lucide-react";
import { STATUS_INFO } from "@/lib/dist";
import { getSmartLink, smartUrl, statusLog, type SmartLink, type StatusLog } from "@/lib/distExtras";
import { toast } from "@/store/app";
import { saveBlob } from "@/lib/zipStore";
import { cn } from "@/lib/utils";
import type { DistRelease, DistTrack } from "@/lib/types";
import type { DxSection } from "./DistroApp";

const lsGet = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const lsSet = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* private mode */
  }
};
export const ago = (iso: string) => {
  const s = Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d < 30 ? `${d}d ago` : new Date(iso).toLocaleDateString([], { day: "numeric", month: "short" });
};

/* ───────────── notifications (release status history) ───────────── */

const SEEN = "nexus-distro-notif-seen";
export function useNotifications(releases: DistRelease[]) {
  const [log, setLog] = useState<StatusLog[]>([]);
  const [seen, setSeen] = useState<string>(() => lsGet(SEEN) ?? "1970-01-01");
  const ids = useMemo(() => releases.map((r) => r.id).join(","), [releases]);
  useEffect(() => {
    if (!ids) return setLog([]);
    void statusLog(ids.split(","), 40).then(setLog);
  }, [ids]);
  const unread = log.filter((l) => l.at > seen).length;
  const markRead = () => {
    const now = new Date().toISOString();
    lsSet(SEEN, now);
    setSeen(now);
  };
  return { log, unread, seen, markRead };
}

export function NotificationsPanel({ log, seen, releases, onOpen, onClose, onMarkRead }: { log: StatusLog[]; seen: string; releases: DistRelease[]; onOpen: (id: string) => void; onClose: () => void; onMarkRead: () => void }) {
  const title = (id: string) => releases.find((r) => r.id === id)?.title ?? "Release";
  const needs = releases.filter((r) => ["changes_requested", "rejected", "error"].includes(r.status));
  return (
    <div className="fixed inset-0 z-40" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="dx-panel absolute top-[64px] right-3 flex max-h-[min(560px,calc(100dvh-80px))] w-[min(380px,calc(100vw-24px))] flex-col shadow-2xl">
        <div className="flex items-center gap-2 border-b border-[var(--dx-line)] px-4 py-3">
          <Bell className="size-4 text-[var(--dx-sub)]" />
          <div className="flex-1 text-[15px] font-medium">Notifications</div>
          <button onClick={onMarkRead} className="text-[12px] text-[var(--dx-muted)] hover:text-white">
            Mark all read
          </button>
          <button onClick={onClose} className="grid size-7 place-items-center text-[var(--dx-muted)] hover:text-white" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>
        <div className="dx-scroll min-h-0 flex-1 overflow-y-auto">
          {needs.map((r) => (
            <button key={`n-${r.id}`} onClick={() => onOpen(r.id)} className="flex w-full gap-3 border-b border-[var(--dx-line)] bg-[color-mix(in_srgb,#f0b232_7%,transparent)] px-4 py-3 text-left hover:bg-[var(--dx-raise)]">
              <span className="mt-1.5 size-2 shrink-0 rounded-full bg-[#f0b232] dx-round" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium">{r.title} needs you</span>
                <span className="block truncate text-[12px] text-[var(--dx-muted)]">{r.staff_note || r.rejection_reason || r.last_error || STATUS_INFO[r.status]?.hint}</span>
              </span>
            </button>
          ))}
          {log.length === 0 && needs.length === 0 && <div className="px-4 py-10 text-center text-[14px] text-[var(--dx-muted)]">You're all caught up.</div>}
          {log.map((l) => {
            const i = STATUS_INFO[l.status];
            return (
              <button key={l.id} onClick={() => onOpen(l.release_id)} className="flex w-full gap-3 border-b border-[var(--dx-line)] px-4 py-3 text-left last:border-0 hover:bg-[var(--dx-raise)]">
                <span className="mt-1.5 size-2 shrink-0 rounded-full dx-round" style={{ background: i?.color ?? "#888" }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px]">
                    <b className="font-medium">{title(l.release_id)}</b> <span className="text-[var(--dx-sub)]">→ {i?.label ?? l.status}</span>
                  </span>
                  {l.note && <span className="block truncate text-[12px] text-[var(--dx-muted)]">{l.note}</span>}
                </span>
                <span className="shrink-0 text-[11px] text-[var(--dx-dim)]">{ago(l.at)}</span>
                {l.at > seen && <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[var(--dx-hi)] dx-round" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ───────────── launch plan for the next release ───────────── */

type Task = { id: string; at: number; label: string; hint: string; go?: DxSection };
const TASKS: Task[] = [
  { id: "deliver", at: -28, label: "Deliver the release", hint: "4 weeks out gives stores and editors time", go: "releases" },
  { id: "pitch", at: -21, label: "Pitch to editorial playlists", hint: "Spotify for Artists → pitch one unreleased song" },
  { id: "presave", at: -21, label: "Share the pre-save link", hint: "Smart link in bio, stories and pinned posts", go: "releases" },
  { id: "content", at: -14, label: "Plan short-form content", hint: "3–5 clips for TikTok, Reels and Shorts" },
  { id: "announce", at: -7, label: "Announce the date", hint: "Cover reveal + countdown" },
  { id: "protect", at: -3, label: "Protect the audio", hint: "Shield 360 blocks leaks before release", go: "shield" },
  { id: "release", at: 0, label: "Release day", hint: "Post everywhere, reply to every comment" },
  { id: "review", at: 7, label: "Check the first week", hint: "Countries, stores and top cities in Analytics", go: "analytics" },
];
const PLAN_KEY = (id: string) => `nexus-distro-plan-${id}`;

export function LaunchPlan({ releases, go }: { releases: DistRelease[]; go: (s: DxSection, rel?: string | null) => void }) {
  // the next upcoming release; otherwise the one that came out in the last week
  const next = useMemo(() => {
    const ok = releases.filter((r) => !["taken_down", "takedown_requested", "rejected"].includes(r.status));
    const today = new Date().toISOString().slice(0, 10);
    const upcoming = ok.filter((r) => r.release_date >= today).sort((a, b) => a.release_date.localeCompare(b.release_date))[0];
    if (upcoming) return upcoming;
    return ok.filter((r) => Date.parse(`${r.release_date}T00:00:00`) >= Date.now() - 8 * 864e5).sort((a, b) => b.release_date.localeCompare(a.release_date))[0] ?? null;
  }, [releases]);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [link, setLink] = useState<SmartLink | null>(null);
  useEffect(() => {
    if (!next) return;
    void getSmartLink(next.id).then(setLink);
    try {
      setDone(JSON.parse(lsGet(PLAN_KEY(next.id)) || "{}"));
    } catch {
      setDone({});
    }
  }, [next]);
  if (!next) return null;
  const rd = Date.parse(`${next.release_date}T00:00:00`);
  const days = Math.ceil((rd - Date.now()) / 864e5);
  const toggle = (id: string) => {
    const d = { ...done, [id]: !done[id] };
    setDone(d);
    lsSet(PLAN_KEY(next.id), JSON.stringify(d));
  };
  const auto = (t: Task) => (t.id === "deliver" && !["draft", "changes_requested"].includes(next.status)) || (t.id === "release" && days <= 0 && next.status === "live");
  const count = TASKS.filter((t) => done[t.id] || auto(t)).length;

  return (
    <section className="dx-panel">
      <div className="flex flex-wrap items-center gap-3 px-4 pt-4 pb-3">
        <Rocket className="size-5 text-[var(--dx-hi)]" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[20px] font-medium">Launch plan · {next.title}</h2>
          <p className="text-[13px] text-[var(--dx-muted)]">
            {days > 0 ? `${days} day${days === 1 ? "" : "s"} to release` : days === 0 ? "Out today" : `Released ${-days} day${days === -1 ? "" : "s"} ago`} · {new Date(rd).toLocaleDateString([], { dateStyle: "medium" })} · {count}/{TASKS.length} done
          </p>
        </div>
        {link && (
          <button onClick={() => void navigator.clipboard.writeText(smartUrl(link.slug)).then(() => toast(days > 0 ? "Pre-save link copied" : "Smart link copied", "success"))} className="dx-btn dx-btn-sm">
            {days > 0 ? "Copy pre-save link" : "Copy smart link"}
          </button>
        )}
        <button onClick={() => go("releases", next.id)} className="dx-btn dx-btn-sm">
          Open release
        </button>
      </div>
      <div className="h-1 bg-[var(--dx-active)]">
        <div className="h-full bg-[var(--dx-hi)] transition-all" style={{ width: `${(count / TASKS.length) * 100}%` }} />
      </div>
      <ol className="grid sm:grid-cols-2">
        {TASKS.map((t, i) => {
          const due = rd + t.at * 864e5;
          const isDone = !!done[t.id] || auto(t);
          const late = !isDone && due < Date.now() - 864e5;
          return (
            <li key={t.id} className={cn("flex items-start gap-3 border-t border-[var(--dx-line)] px-4 py-3", i % 2 === 1 && "sm:border-l")}>
              <button role="checkbox" aria-checked={isDone} onClick={() => toggle(t.id)} className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-[5px] border transition", isDone ? "border-[var(--dx-hi)] bg-[var(--dx-hi)] text-black" : "border-[var(--dx-line-3)] hover:border-[var(--dx-sub)]")} aria-label={t.label}>
                {isDone && <Check className="size-3.5" />}
              </button>
              <div className="min-w-0 flex-1">
                <div className={cn("text-[14px] font-medium", isDone && "text-[var(--dx-muted)] line-through")}>{t.label}</div>
                <div className="text-[12px] text-[var(--dx-muted)]">{t.hint}</div>
              </div>
              <div className="shrink-0 text-right">
                <div className={cn("text-[12px]", late ? "text-[#f0b232]" : "text-[var(--dx-dim)]")}>{t.at === 0 ? "Day 0" : t.at < 0 ? `T${t.at}d` : `T+${t.at}d`}</div>
                {t.go && !isDone && (
                  <button onClick={() => go(t.go!, t.go === "releases" ? next.id : null)} className="text-[12px] text-[var(--dx-sub)] hover:text-white">
                    Go →
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/* ───────────── catalog export ───────────── */

export function exportCatalogCsv(releases: DistRelease[], tracks: DistTrack[] = []) {
  const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const head = ["release_title", "artist", "type", "status", "release_date", "label", "upc", "genre", "track_no", "track_title", "isrc", "explicit"];
  const rows: string[] = [head.join(",")];
  for (const r of releases) {
    const ts = tracks.filter((t) => t.release_id === r.id).sort((a, b) => a.position - b.position);
    const base = [r.title, r.primary_artist_name, r.release_type, STATUS_INFO[r.status]?.label ?? r.status, r.release_date, r.label_name, r.upc, r.primary_genre];
    if (!ts.length) rows.push([...base, "", "", "", ""].map(q).join(","));
    for (const t of ts) rows.push([...base, t.position, t.title, t.isrc, t.explicit ? "yes" : "no"].map(q).join(","));
  }
  saveBlob(new Blob(["﻿" + rows.join("\r\n")], { type: "text/csv;charset=utf-8" }), `catalog-${new Date().toISOString().slice(0, 10)}.csv`);
}

/* ───────────── keyboard shortcuts ───────────── */

export const SHORTCUTS: [string, string, DxSection | "new" | "search" | "help"][] = [
  ["N", "New release", "new"],
  ["/", "Search workspace", "search"],
  ["G then O", "Overview", "overview"],
  ["G then R", "Releases", "releases"],
  ["G then A", "Analytics", "analytics"],
  ["G then E", "Earnings", "earnings"],
  ["G then T", "Tools", "tools"],
  ["G then S", "Settings", "settings"],
  ["?", "Show shortcuts", "help"],
];
const G_KEYS: Record<string, DxSection> = { o: "overview", r: "releases", a: "analytics", e: "earnings", t: "tools", s: "settings", i: "artists" };

/** single-key shortcuts (ignored while typing) */
export function useShortcuts(handlers: { go: (s: DxSection, rel?: string | null) => void; search: () => void; help: () => void }) {
  useEffect(() => {
    let g = 0;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      const k = e.key.toLowerCase();
      if (g && Date.now() - g < 1200 && G_KEYS[k]) {
        e.preventDefault();
        g = 0;
        return handlers.go(G_KEYS[k]);
      }
      g = 0;
      if (k === "g") g = Date.now();
      else if (k === "n") {
        e.preventDefault();
        handlers.go("releases", "new");
      } else if (e.key === "/") {
        e.preventDefault();
        handlers.search();
      } else if (e.key === "?") {
        e.preventDefault();
        handlers.help();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handlers]);
}

export function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="dx-panel w-full max-w-[420px] shadow-2xl">
        <div className="flex items-center gap-2 border-b border-[var(--dx-line)] px-4 py-3">
          <Keyboard className="size-4 text-[var(--dx-sub)]" />
          <div className="flex-1 text-[15px] font-medium">Keyboard shortcuts</div>
          <button onClick={onClose} className="grid size-7 place-items-center text-[var(--dx-muted)] hover:text-white" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>
        <ul className="p-2">
          {[["⌘ / Ctrl K", "Command palette"], ...SHORTCUTS.map(([k, l]) => [k, l])].map(([k, l]) => (
            <li key={k} className="flex items-center justify-between px-2 py-2 text-[14px]">
              <span>{l}</span>
              <span className="flex gap-1">
                {k.split(" then ").map((p, i) => (
                  <kbd key={i} className="min-w-6 rounded-[5px] border border-[var(--dx-line-2)] bg-[var(--dx-raise)] px-1.5 py-0.5 text-center text-[12px] text-[var(--dx-sub-2)]">
                    {p}
                  </kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-1.5 border-t border-[var(--dx-line)] px-4 py-2.5 text-[12px] text-[var(--dx-muted)]">
          <CircleCheck className="size-3.5" /> Shortcuts are off while you type in a field.
        </div>
      </div>
    </div>
  );
}
