"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, CircleCheck, Disc3, Link2, MousePointerClick, Plus, Radio, ShieldAlert, TriangleAlert, Eye } from "lucide-react";
import { useApp } from "@/store/app";
import { useStudio, studioGo, openRelease } from "@/store/studio";
import { STATUS_INFO, listReleases, tunearo } from "@/lib/dist";
import { latestChecks, type AudioCheck } from "@/lib/audio";
import { LINK_SERVICES, linkStats, listSmartLinks, smartUrl, statusLog, summarize, type LinkStatRow, type SmartLink, type StatusLog } from "@/lib/distExtras";
import { DELIVERY_STAGES, FEATURED_STORES } from "@/lib/distStores";
import { myRank } from "@/lib/admin";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import NameTag from "@/components/ui/NameTag";
import { Card, H, StatusPill } from "./Studio";
import { Artwork } from "./Distribution";
import type { DistRelease, DistStatus } from "@/lib/types";

const GROUPS: { id: string; label: string; statuses: DistStatus[]; color: string }[] = [
  { id: "live", label: "Live", statuses: ["live"], color: "#23a55a" },
  { id: "moving", label: "In progress", statuses: ["in_review", "sending", "pending", "approved"], color: "#5865f2" },
  { id: "attention", label: "Needs attention", statuses: ["changes_requested", "rejected", "error"], color: "#f0b232" },
  { id: "draft", label: "Drafts", statuses: ["draft"], color: "#80848e" },
  { id: "down", label: "Taken down", statuses: ["takedown_requested", "taken_down"], color: "#4e5058" },
];

type Todo = { key: string; tone: "bad" | "warn" | "info"; text: string; r: DistRelease; cta: string };

export default function DistOverview() {
  const me = useApp((s) => s.userId)!;
  const staff = myRank() >= 3;
  const [all, setAll] = useState(false);
  const [rows, setRows] = useState<DistRelease[] | null>(null);
  const [links, setLinks] = useState<SmartLink[]>([]);
  const [stats, setStats] = useState<LinkStatRow[]>([]);
  const [log, setLog] = useState<StatusLog[]>([]);
  const [trackCount, setTrackCount] = useState(0);
  const [flags, setFlags] = useState<Record<string, AudioCheck>>({});
  const [trackRel, setTrackRel] = useState<Record<string, string>>({});
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  useEffect(() => {
    let alive = true;
    void (async () => {
      const list = await listReleases(all && staff);
      if (!alive) return;
      setRows(list);
      const ids = list.map((r) => r.id);
      const [ls, st, lg] = await Promise.all([listSmartLinks(all && staff), linkStats(30, all && staff), statusLog(ids.length ? ids.slice(0, 300) : [], 30)]);
      if (!alive) return;
      setLinks(ls);
      setStats(st);
      setLog(lg);
      if (ids.length) {
        const { data: tr } = await supabase.from("dist_tracks").select("id, release_id").in("release_id", ids.slice(0, 300)).limit(2000);
        const map = Object.fromEntries((tr ?? []).map((t) => [t.id as string, t.release_id as string]));
        setTrackRel(map);
        setTrackCount(Object.keys(map).length);
        const c = await latestChecks("track", Object.keys(map).slice(0, 1000));
        if (alive) setFlags(c);
      }
    })();
    void tunearo("sync").catch(() => null);
    return () => {
      alive = false;
    };
  }, [all, staff]);

  const byGroup = useMemo(() => {
    const m: Record<string, number> = {};
    for (const g of GROUPS) m[g.id] = (rows ?? []).filter((r) => g.statuses.includes(r.status)).length;
    return m;
  }, [rows]);
  const total = rows?.length ?? 0;
  const s30 = summarize(stats);

  const todos = useMemo<Todo[]>(() => {
    if (!rows) return [];
    const out: Todo[] = [];
    const today = new Date().toISOString().slice(0, 10);
    const linkFor = new Set(links.map((l) => l.release_id));
    const flaggedRel = new Set(Object.entries(flags).filter(([, c]) => c.status === "match").map(([t]) => trackRel[t]));
    for (const r of rows) {
      const days = Math.round((new Date(`${r.release_date}T00:00:00`).getTime() - Date.now()) / 86400000);
      if (r.status === "changes_requested") out.push({ key: `${r.id}c`, tone: "bad", text: `Changes requested: ${r.staff_note ?? "see notes"}`, r, cta: "Fix" });
      else if (r.status === "rejected") out.push({ key: `${r.id}r`, tone: "bad", text: `Rejected by the distributor${r.rejection_reason ? `: ${r.rejection_reason}` : ""}`, r, cta: "Fix" });
      else if (r.status === "error") out.push({ key: `${r.id}e`, tone: "bad", text: "Sending failed — an admin needs to retry", r, cta: "Open" });
      if (flaggedRel.has(r.id) && ["draft", "changes_requested", "rejected", "in_review"].includes(r.status)) out.push({ key: `${r.id}cr`, tone: "bad", text: "A track matched copyrighted music", r, cta: "Review" });
      if (r.status === "draft" && r.release_date < today) out.push({ key: `${r.id}d`, tone: "warn", text: "Draft with a release date in the past", r, cta: "Change date" });
      else if (r.status === "draft" && days <= 14) out.push({ key: `${r.id}s`, tone: "warn", text: `Draft releasing in ${days} day${days === 1 ? "" : "s"} — submit soon`, r, cta: "Submit" });
      if (!linkFor.has(r.id) && (r.status === "live" || (days >= 0 && days <= 30 && r.status !== "draft"))) out.push({ key: `${r.id}l`, tone: "info", text: r.status === "live" ? "Live without a smart link" : "Create a pre-save link before release day", r, cta: "Create link" });
    }
    const rank = { bad: 0, warn: 1, info: 2 };
    return out.sort((a, b) => rank[a.tone] - rank[b.tone]).slice(0, 12);
  }, [rows, links, flags, trackRel]);

  const upcoming = (rows ?? []).filter((r) => r.release_date >= new Date().toISOString().slice(0, 10) && !["taken_down", "takedown_requested"].includes(r.status)).sort((a, b) => a.release_date.localeCompare(b.release_date));

  return (
    <>
      <H
        right={
          <div className="flex items-center gap-2">
            {staff && (
              <div className="flex rounded-full bg-black/25 p-0.5 text-sm">
                <button onClick={() => setAll(false)} className={cn("rounded-full px-3 py-1.5 font-semibold", !all && "bg-active")}>
                  Mine
                </button>
                <button onClick={() => setAll(true)} className={cn("rounded-full px-3 py-1.5 font-semibold", all && "bg-active")}>
                  Whole label
                </button>
              </div>
            )}
            <button onClick={() => openRelease("new")} className="flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white">
              <Plus className="size-4" /> New release
            </button>
          </div>
        }
      >
        Distribution overview
      </H>

      <div className="mb-5 overflow-hidden rounded-3xl border border-[#23a55a]/25 bg-gradient-to-br from-[#0b3a1f] via-[#0f172a] to-[#1e1b4b] p-5 text-white">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-xl">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-[#23a55a]/20 px-2.5 py-1 text-[10px] font-black tracking-widest text-[#4ade80] uppercase">
              <Radio className="size-3" /> Live music distribution
            </div>
            <h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">From draft to Spotify in one pipeline</h2>
            <p className="mt-2 text-sm text-white/75">
              Nexus reviews your release, Tunearo delivers to 150+ stores, and you get smart links, pitches and royalties in one place.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {DELIVERY_STAGES.map((s, i) => (
                <span key={s.id} className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold">
                  {i + 1}. {s.label}
                </span>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <button onClick={() => openRelease("new")} className="rounded-full bg-[#23a55a] px-5 py-2.5 text-sm font-black text-black">
              New release
            </button>
            <button onClick={() => studioGo("live-catalog")} className="rounded-full bg-white/10 px-5 py-2.5 text-sm font-bold hover:bg-white/15">
              Open live catalog
            </button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {FEATURED_STORES.map((s) => (
            <span key={s.id} className="rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: s.color, color: s.id === "tidal" ? "#fff" : "#000" }}>
              {s.name}
            </span>
          ))}
        </div>
      </div>

      {rows === null ? (
        <p className="text-sub">Loading…</p>
      ) : (
        <div className="space-y-4">
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            <Kpi icon={<Disc3 className="size-4" />} label="Releases" value={total} sub={`${trackCount} tracks`} />
            <Kpi icon={<CircleCheck className="size-4 text-ok" />} label="Live" value={byGroup.live} />
            <Kpi icon={<CalendarDays className="size-4 text-accent" />} label="In progress" value={byGroup.moving} sub={upcoming[0] ? `next: ${fmtDate(upcoming[0].release_date)}` : undefined} />
            <Kpi icon={<TriangleAlert className="size-4 text-idle" />} label="Needs attention" value={byGroup.attention} warn={byGroup.attention > 0} />
            <Kpi icon={<Eye className="size-4" />} label="Link views · 30d" value={s30.views} />
            <Kpi icon={<MousePointerClick className="size-4" />} label="Store clicks · 30d" value={s30.clicks} sub={s30.views ? `${Math.round(s30.ctr * 100)}% click rate` : undefined} />
          </div>

          {/* pipeline */}
          {total > 0 && (
            <Card>
              <div className="flex h-3 overflow-hidden rounded-full bg-black/30">
                {GROUPS.map((g) => (byGroup[g.id] ? <div key={g.id} style={{ width: `${(byGroup[g.id] / total) * 100}%`, background: g.color }} title={`${g.label}: ${byGroup[g.id]}`} /> : null))}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-sub">
                {GROUPS.map((g) => (
                  <span key={g.id} className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full" style={{ background: g.color }} /> {g.label} {byGroup[g.id]}
                  </span>
                ))}
              </div>
            </Card>
          )}

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            {/* to-do */}
            <Card title={`To do${todos.length ? ` (${todos.length})` : ""}`}>
              {todos.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-ok">
                  <CircleCheck className="size-4" /> Nothing waiting on you.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {todos.map((t) => (
                    <button key={t.key} onClick={() => openRelease(t.r.id)} className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-hover">
                      <Artwork path={t.r.artwork_path} className="w-10" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold">{t.r.title}</div>
                        <div className={cn("truncate text-xs", t.tone === "bad" ? "text-dnd" : t.tone === "warn" ? "text-idle" : "text-sub")}>
                          {t.tone === "bad" && <ShieldAlert className="mr-1 inline size-3" />}
                          {t.text}
                        </div>
                      </div>
                      <span className="shrink-0 rounded-full bg-hover px-3 py-1 text-xs font-semibold">{t.cta}</span>
                    </button>
                  ))}
                </div>
              )}
            </Card>

            {/* calendar */}
            <Card>
              <div className="mb-2 flex items-center gap-2">
                <h2 className="flex-1 font-bold">{month.toLocaleDateString([], { month: "long", year: "numeric" })}</h2>
                <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="grid size-8 place-items-center rounded-full hover:bg-hover" aria-label="Previous month">
                  <ChevronLeft className="size-4" />
                </button>
                <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="grid size-8 place-items-center rounded-full hover:bg-hover" aria-label="Next month">
                  <ChevronRight className="size-4" />
                </button>
              </div>
              <Calendar month={month} rows={rows} />
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* smart links */}
            <Card title="Smart links · last 30 days">
              {links.length === 0 ? (
                <p className="text-sm text-sub">Create a smart link from any release to get one shareable page for all stores (with pre-save before release).</p>
              ) : (
                <div className="space-y-2">
                  {links
                    .map((l) => ({ l, s: summarize(stats, l.id), r: rows.find((x) => x.id === l.release_id) }))
                    .sort((a, b) => b.s.views - a.s.views)
                    .slice(0, 8)
                    .map(({ l, s, r }) => (
                      <div key={l.id} className="flex items-center gap-3 rounded-xl p-1.5 hover:bg-hover">
                        <button onClick={() => openRelease(l.release_id)} className="shrink-0">
                          <Artwork path={r?.artwork_path ?? null} className="w-10" />
                        </button>
                        <div className="min-w-0 flex-1">
                          <a href={smartUrl(l.slug)} target="_blank" rel="noreferrer" className="block truncate text-sm font-semibold hover:underline">
                            {r?.title ?? l.slug}
                          </a>
                          <div className="truncate text-xs text-sub">
                            {s.views} views · {s.clicks} clicks
                            {Object.keys(s.byService).length > 0 &&
                              ` · top: ${LINK_SERVICES.find((x) => x.id === Object.entries(s.byService).sort((a, b) => b[1] - a[1])[0][0])?.name ?? ""}`}
                          </div>
                        </div>
                        <Spark days={s.byDay} />
                        {!l.enabled && <span className="text-[11px] text-sub">off</span>}
                      </div>
                    ))}
                  {Object.keys(s30.byCountry).length > 0 && (
                    <div className="pt-1 text-xs text-sub">
                      Top countries:{" "}
                      {Object.entries(s30.byCountry)
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 6)
                        .map(([c, n]) => `${flag(c)} ${c} ${n}`)
                        .join(" · ")}
                    </div>
                  )}
                </div>
              )}
            </Card>

            {/* activity */}
            <Card title="Recent activity">
              {log.length === 0 ? (
                <p className="text-sm text-sub">Status changes show up here.</p>
              ) : (
                <div className="space-y-2">
                  {log.slice(0, 12).map((e) => {
                    const r = rows.find((x) => x.id === e.release_id);
                    return (
                      <button key={e.id} onClick={() => openRelease(e.release_id)} className="flex w-full items-center gap-3 text-left">
                        <span className="size-2.5 shrink-0 rounded-full" style={{ background: STATUS_INFO[e.status]?.color ?? "#888" }} />
                        <div className="min-w-0 flex-1 text-sm">
                          <span className="font-semibold">{r?.title ?? "Release"}</span> <span className="text-sub">→ {STATUS_INFO[e.status]?.label ?? e.status}</span>
                          {e.actor && e.actor !== me && (
                            <span className="text-xs text-sub">
                              {" "}
                              by <NameTag userId={e.actor} badges={false} />
                            </span>
                          )}
                        </div>
                        <span className="shrink-0 text-xs text-sub">{ago(e.at)}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>

          {/* upcoming */}
          {upcoming.length > 0 && (
            <Card title="Upcoming releases">
              <div className="no-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
                {upcoming.slice(0, 12).map((r) => {
                  const days = Math.round((new Date(`${r.release_date}T00:00:00`).getTime() - Date.now()) / 86400000);
                  return (
                    <button key={r.id} onClick={() => openRelease(r.id)} className="w-36 shrink-0 text-left">
                      <Artwork path={r.artwork_path} className="w-36" />
                      <div className="mt-1.5 truncate text-sm font-semibold">{r.title}</div>
                      <div className="truncate text-xs text-sub">{r.primary_artist_name}</div>
                      <div className="mt-1 flex items-center gap-1.5">
                        <StatusPill status={r.status} />
                        <span className="text-[11px] text-sub">{days === 0 ? "today" : `in ${days}d`}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </Card>
          )}

          {staff && (
            <div className="flex flex-wrap gap-2">
              <button onClick={() => studioGo("review")} className="rounded-full bg-hover px-4 py-2 text-sm font-semibold hover:bg-active">
                Open review queue
              </button>
              <button onClick={() => studioGo("royalties")} className="rounded-full bg-hover px-4 py-2 text-sm font-semibold hover:bg-active">
                Royalties
              </button>
              <button onClick={() => useStudio.setState({ section: "releases", releaseId: null })} className="flex items-center gap-1.5 rounded-full bg-hover px-4 py-2 text-sm font-semibold hover:bg-active">
                <Link2 className="size-4" /> All releases
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function Kpi({ icon, label, value, sub, warn }: { icon: React.ReactNode; label: string; value: number; sub?: string; warn?: boolean }) {
  return (
    <div className={cn("rounded-2xl border border-line/70 bg-side p-3", warn && "border-idle/40")}>
      <div className="flex items-center gap-1.5 text-xs text-sub">
        {icon} {label}
      </div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value.toLocaleString()}</div>
      {sub && <div className="truncate text-xs text-sub">{sub}</div>}
    </div>
  );
}

function Calendar({ month, rows }: { month: Date; rows: DistRelease[] }) {
  const first = new Date(month);
  const start = (first.getDay() + 6) % 7; // Monday first
  const daysIn = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(start).fill(null), ...Array.from({ length: daysIn }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const key = (d: number) => `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const today = new Date().toISOString().slice(0, 10);
  const byDay: Record<string, DistRelease[]> = {};
  for (const r of rows) (byDay[r.release_date] ??= []).push(r);
  return (
    <div>
      <div className="grid grid-cols-7 text-center text-[11px] text-sub">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <div key={i} className="py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const k = key(d);
          const list = byDay[k] ?? [];
          return (
            <div key={i} className={cn("min-h-12 rounded-lg p-1 text-[11px]", list.length ? "bg-black/25" : "bg-black/10", k === today && "ring-1 ring-accent")}>
              <div className={cn("text-sub", k === today && "font-bold text-accent")}>{d}</div>
              {list.slice(0, 2).map((r) => (
                <button key={r.id} onClick={() => openRelease(r.id)} title={`${r.title} — ${STATUS_INFO[r.status].label}`} className="mt-0.5 block w-full truncate rounded px-1 text-left text-[10px] font-semibold text-white" style={{ background: STATUS_INFO[r.status].color }}>
                  {r.title}
                </button>
              ))}
              {list.length > 2 && <div className="text-[10px] text-sub">+{list.length - 2}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Spark({ days }: { days: Record<string, { v: number; c: number }> }) {
  const pts = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(Date.now() - (29 - i) * 86400000).toISOString().slice(0, 10);
    return days[d]?.v ?? 0;
  });
  const max = Math.max(1, ...pts);
  const path = pts.map((v, i) => `${i ? "L" : "M"}${(i / 29) * 60},${20 - (v / max) * 18}`).join(" ");
  return (
    <svg width={60} height={22} className="shrink-0 text-accent" aria-hidden>
      <path d={path} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}

const fmtDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString([], { month: "short", day: "numeric" });
const flag = (cc: string) => (/^[A-Z]{2}$/.test(cc) ? String.fromCodePoint(...[...cc].map((c) => 0x1f1a5 + c.charCodeAt(0))) : "");
function ago(at: string) {
  const s = (Date.now() - new Date(at).getTime()) / 1000;
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}
