"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ArrowUpRight, Archive, ChevronDown, CreditCard, Download, FileText, Image as ImageIcon, Library, Loader2, Lock, KeyRound, Palette as PaletteIcon, Plus, Search, Upload, Volume2 } from "lucide-react";
import { useApp, openModal, toast } from "@/store/app";
import { useStudio } from "@/store/studio";
import { STATUS_INFO, createArtist, distFileUrl, listArtists, tunearo } from "@/lib/dist";
import { linkStats, listSmartLinks, summarize, type LinkStatRow, type SmartLink } from "@/lib/distExtras";
import { activePlan, PLANS } from "@/lib/premium";
import { myRank } from "@/lib/admin";
import { supabase } from "@/lib/supabase";
import { makeZip, saveBlob } from "@/lib/zipStore";
import { DEFAULT_BRAND, DX_THEMES, themeAccent, onColor, saveBrand, uploadBrandLogo, useBrand, useBrandStore, type DistBrand, type DxTheme } from "@/lib/distBrand";
import { cn } from "@/lib/utils";
import type { DistArtist, DistRelease, DistStatus, DistTrack } from "@/lib/types";
import { LaunchPlan, exportCatalogCsv } from "./DxExtras";
import type { DxSection } from "./DistroApp";
import { dxSfx, loadDxSound, setDxSound, useDxSound } from "@/lib/dxSound";
import { DPID_RE, getDdex, saveDdex, type DdexConfig, type DdexRecipient } from "@/lib/ddex";
import { TL_PERIODS, TOOLOST_REDIRECT, connectTooLost, saveTooLostClient, setTooLostEnv, tooLostAnalytics, tooLostQuota, tooLostSales, tooLostStatus, toolost, type TooLostAnalytics, type TooLostEnv, type TooLostQuota, type TooLostStatus } from "@/lib/toolost";

/* ───────────────────────── shared bits ───────────────────────── */

export function DxHeader({ title, sub, actions }: { title: string; sub?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start">
      <div className="min-w-0 flex-1">
        <h1 className="text-[34px] leading-[1.1] font-medium tracking-[-0.02em] text-white sm:text-[40px]">{title}</h1>
        {sub && <p className="mt-2 text-[15px] text-[var(--dx-sub)]">{sub}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** wraps a reused Studio screen so it sits in the workspace frame */
export function DxEmbed({ title, sub, children }: { title?: string; sub?: string; children: React.ReactNode }) {
  return (
    <div>
      {title && <DxHeader title={title} sub={sub} />}
      {children}
    </div>
  );
}

function Panel({ title, href, right, children, className, pad = true }: { title?: string; href?: () => void; right?: React.ReactNode; children: React.ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={cn("dx-panel", className)}>
      {title && (
        <div className="flex items-center gap-2 px-4 pt-4 pb-3">
          {href ? (
            <button onClick={href} className="group flex items-center gap-1.5 text-[20px] font-medium text-white">
              {title} <ArrowUpRight className="size-4 text-[var(--dx-muted)] transition group-hover:text-white" />
            </button>
          ) : (
            <h2 className="text-[20px] font-medium text-white">{title}</h2>
          )}
          <div className="ml-auto">{right}</div>
        </div>
      )}
      <div className={pad ? "px-4 pb-4" : ""}>{children}</div>
    </section>
  );
}

function Empty({ text, action }: { text: string; action?: React.ReactNode }) {
  return (
    <div className="grid place-items-center gap-3 py-10 text-center">
      <p className="text-[14px] text-[var(--dx-muted)]">{text}</p>
      {action}
    </div>
  );
}

function useCover(path: string | null | undefined) {
  const [u, setU] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setU(null);
    if (path) void distFileUrl(path).then((x) => live && setU(x));
    return () => {
      live = false;
    };
  }, [path]);
  return u;
}
function Cover({ path, size = 40 }: { path: string | null; size?: number }) {
  const u = useCover(path);
  return (
    <span className="block shrink-0 overflow-hidden bg-[var(--dx-raise)]" style={{ width: size, height: size }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {u && <img src={u} alt="" className="size-full object-cover" loading="lazy" />}
    </span>
  );
}
function StatusTag({ s }: { s: DistStatus }) {
  const i = STATUS_INFO[s];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-[5px] border border-[var(--dx-line-2)] px-2 py-0.5 text-[12px] text-[var(--dx-sub-2)]">
      <span className="size-1.5 rounded-[2px]" style={{ background: i?.color ?? "#888" }} />
      {i?.label ?? s}
    </span>
  );
}
const NEEDS: DistStatus[] = ["changes_requested", "rejected", "error"];
const PROGRESS: DistStatus[] = ["in_review", "sending", "pending", "approved"];

/* ───────────────────────── Overview ───────────────────────── */

export function DxOverview({ go, releases }: { go: (s: DxSection, rel?: string | null) => void; releases: DistRelease[] }) {
  const brand = useBrand();
  const [range, setRange] = useState<7 | 30 | 90 | 365>(30);
  const [stats, setStats] = useState<LinkStatRow[] | null>(null);
  const [links, setLinks] = useState<SmartLink[]>([]);
  const [roy, setRoy] = useState<{ currency: string; lifetime_earnings: number; this_month_earnings: number } | null | undefined>(undefined);
  const [counts, setCounts] = useState<{ artists: number; tracks: number }>({ artists: 0, tracks: 0 });
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const me = useApp((s) => s.userId);

  useEffect(() => {
    setStats(null);
    void linkStats(range).then(setStats);
  }, [range]);
  useEffect(() => {
    void listSmartLinks().then(setLinks);
    void tunearo<{ currency: string; lifetime_earnings: number; this_month_earnings: number }>("royalties")
      .then((r) => setRoy(r && typeof r.this_month_earnings === "number" && typeof r.lifetime_earnings === "number" ? r : null))
      .catch(() => setRoy(null));
    void (async () => {
      const [{ count: a }, ids] = [await supabase.from("dist_artists").select("id", { count: "exact", head: true }).eq("owner_id", me), releases.map((r) => r.id)];
      const { count: t } = ids.length ? await supabase.from("dist_tracks").select("id", { count: "exact", head: true }).in("release_id", ids.slice(0, 300)) : { count: 0 };
      setCounts({ artists: a ?? 0, tracks: t ?? 0 });
    })();
  }, [me, releases]);

  const sum = stats ? summarize(stats) : null;
  const days = useMemo(() => {
    const out: { d: string; v: number; c: number }[] = [];
    const n = range === 365 ? 52 : range;
    const step = range === 365 ? 7 : 1;
    for (let i = n - 1; i >= 0; i--) {
      const start = new Date(Date.now() - (i * step + step - 1) * 864e5);
      let v = 0,
        c = 0;
      for (let k = 0; k < step; k++) {
        const key = new Date(start.getTime() + k * 864e5).toISOString().slice(0, 10);
        const x = sum?.byDay[key];
        if (x) {
          v += x.v;
          c += x.c;
        }
      }
      out.push({ d: start.toISOString().slice(0, 10), v, c });
    }
    return out;
  }, [sum, range]);
  const max = Math.max(1, ...days.map((d) => d.v + d.c));
  const needs = releases.filter((r) => NEEDS.includes(r.status));
  const top = useMemo(() => {
    if (!stats) return [];
    const byLink: Record<string, number> = {};
    for (const r of stats) byLink[r.link_id] = (byLink[r.link_id] ?? 0) + r.n;
    return links
      .map((l) => ({ l, n: byLink[l.id] ?? 0, r: releases.find((x) => x.id === l.release_id) }))
      .filter((x) => x.r && x.n > 0)
      .sort((a, b) => b.n - a.n)
      .slice(0, 5);
  }, [stats, links, releases]);

  // calendar
  const first = (month.getDay() + 6) % 7;
  const dim = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const relOn = (d: number) => releases.filter((r) => r.release_date === `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  const upcoming = releases.filter((r) => Date.parse(r.release_date) >= Date.now() - 864e5).sort((a, b) => Date.parse(a.release_date) - Date.parse(b.release_date)).slice(0, 4);
  const today = new Date();

  return (
    <div className="space-y-5">
      {/* banner */}
      <div className="relative h-[150px] overflow-hidden rounded-[10px] border border-[var(--dx-line)] sm:h-[180px]">
        <BannerArt releases={releases} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-black/30" />
        <div className="absolute top-4 left-4 flex items-center gap-2.5">
          {brand.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand.logo_url} alt="" className="size-9 object-cover" />
          )}
          <div>
            <div className="text-[18px] font-semibold text-white drop-shadow">{brand.name}</div>
            {brand.tagline && <div className="text-[12px] text-white/75">{brand.tagline}</div>}
          </div>
        </div>
        <button onClick={() => go("releases", "new")} className="absolute top-[64%] left-1/2 flex h-11 -translate-x-1/2 -translate-y-1/2 items-center rounded-[9px] shadow-xl sm:top-1/2 gap-3 border border-white/20 bg-[var(--dx-bg)]/90 pr-4 pl-1.5 text-[15px] font-medium text-white backdrop-blur hover:bg-[var(--dx-raise)]">
          <span className="grid size-8 place-items-center rounded-[6px] bg-[var(--dx-accent)] text-[var(--dx-on-accent)]">
            <Plus className="size-4" />
          </span>
          New release
        </button>
      </div>

      <LaunchPlan releases={releases} go={go} />

      <Panel title="Needs you" pad={false}>
        <div className="border-t border-[var(--dx-line)]">
          {needs.length === 0 ? (
            <div className="px-4 py-4 text-[14px] text-[var(--dx-muted)]">Nothing needs you right now.</div>
          ) : (
            needs.map((r) => (
              <button key={r.id} onClick={() => go("releases", r.id)} className="flex w-full items-center gap-3 border-b border-[var(--dx-line)] px-4 py-3 text-left last:border-0 hover:bg-[var(--dx-raise)]">
                <Cover path={r.artwork_path} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-medium">{r.title}</div>
                  <div className="truncate text-[13px] text-[var(--dx-muted)]">{r.status === "error" ? r.last_error : r.status === "rejected" ? r.rejection_reason : r.staff_note}</div>
                </div>
                <span className="max-sm:hidden">
                  <StatusTag s={r.status} />
                </span>
                <span className="dx-btn dx-btn-sm">Fix</span>
              </button>
            ))
          )}
        </div>
      </Panel>

      <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr_1fr]">
        <Panel
          title="Activity"
          href={() => go("analytics")}
          right={
            <div className="dx-seg">
              {([7, 30, 90, 365] as const).map((r) => (
                <button key={r} aria-pressed={range === r} onClick={() => setRange(r)}>
                  {r === 365 ? "12M" : `${r}D`}
                </button>
              ))}
            </div>
          }
          className="lg:row-span-2"
        >
          {stats === null ? (
            <Empty text="Loading…" />
          ) : !sum || sum.views + sum.clicks === 0 ? (
            <Empty text="No plays yet — your smart-link views and store clicks show up here." action={<button onClick={() => go("releases")} className="dx-btn dx-btn-sm">Share a release</button>} />
          ) : (
            <>
              <div className="mb-3 flex gap-6">
                <div>
                  <div className="text-[28px] font-medium">{sum.views.toLocaleString()}</div>
                  <div className="dx-label">Views</div>
                </div>
                <div>
                  <div className="text-[28px] font-medium">{sum.clicks.toLocaleString()}</div>
                  <div className="dx-label">Store clicks</div>
                </div>
              </div>
              <div className="flex h-40 items-end gap-[2px]">
                {days.map((d) => (
                  <div key={d.d} className="group relative flex h-full flex-1 flex-col justify-end" title={`${d.d}: ${d.v} views · ${d.c} clicks`}>
                    <div className="bg-[var(--dx-hi)]/85" style={{ height: `${(d.c / max) * 100}%` }} />
                    <div className="bg-[var(--dx-line-3)]" style={{ height: `${(d.v / max) * 100}%` }} />
                  </div>
                ))}
              </div>
              <div className="mt-2 flex justify-between text-[11px] text-[var(--dx-dim)]">
                <span>{days[0]?.d}</span>
                <span>today</span>
              </div>
            </>
          )}
        </Panel>

        <Panel pad={false} className="lg:row-span-2">
          <div className="flex items-center gap-2 px-4 pt-4 pb-3">
            <h2 className="text-[20px] font-medium text-white">{month.toLocaleDateString([], { month: "long", year: "numeric" })}</h2>
            <div className="ml-auto flex">
              <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="grid size-7 place-items-center text-[var(--dx-muted)] hover:text-white" aria-label="Previous month">
                ‹
              </button>
              <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="grid size-7 place-items-center text-[var(--dx-muted)] hover:text-white" aria-label="Next month">
                ›
              </button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-y-1 px-3 pb-3 text-center text-[12px]">
            {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
              <div key={i} className="py-1 text-[var(--dx-dim)]">
                {d}
              </div>
            ))}
            {Array.from({ length: first }).map((_, i) => (
              <div key={`e${i}`} />
            ))}
            {Array.from({ length: dim }, (_, i) => i + 1).map((d) => {
              const rs = relOn(d);
              const isToday = today.getFullYear() === month.getFullYear() && today.getMonth() === month.getMonth() && today.getDate() === d;
              return (
                <button
                  key={d}
                  onClick={() => rs[0] && go("releases", rs[0].id)}
                  title={rs.map((r) => r.title).join(", ")}
                  className={cn("relative mx-auto grid size-8 place-items-center text-[13px]", isToday ? "bg-[var(--dx-accent)] font-semibold text-[var(--dx-on-accent)]" : rs.length ? "border border-[var(--dx-hi)] text-white" : "text-[var(--dx-sub)]")}
                >
                  {d}
                </button>
              );
            })}
          </div>
          <div className="border-t border-[var(--dx-line)] px-4 py-3">
            <div className="dx-label mb-2">Release dates</div>
            {upcoming.length === 0 ? (
              <p className="text-[13px] text-[var(--dx-muted)]">No upcoming releases.</p>
            ) : (
              upcoming.map((r) => (
                <button key={r.id} onClick={() => go("releases", r.id)} className="flex w-full items-center gap-2 py-1 text-left text-[13px] hover:text-white">
                  <span className="w-14 shrink-0 text-[var(--dx-muted)]">{new Date(r.release_date).toLocaleDateString([], { day: "numeric", month: "short" })}</span>
                  <span className="min-w-0 flex-1 truncate">{r.title}</span>
                </button>
              ))
            )}
          </div>
        </Panel>

        <Panel title="Earnings" href={() => go("earnings")}>
          {roy === undefined ? (
            <Empty text="Loading…" />
          ) : !roy ? (
            <Empty text="Earnings appear once stores report royalties." />
          ) : (
            <div className="space-y-3">
              <div>
                <div className="text-[28px] font-medium">{roy.this_month_earnings.toLocaleString([], { style: "currency", currency: roy.currency || "GBP" })}</div>
                <div className="dx-label">This month</div>
              </div>
              <div>
                <div className="text-[18px]">{roy.lifetime_earnings.toLocaleString([], { style: "currency", currency: roy.currency || "GBP" })}</div>
                <div className="dx-label">Lifetime</div>
              </div>
            </div>
          )}
        </Panel>
        <Panel title="Top releases" href={() => go("analytics")} right={<span className="text-[13px] text-[var(--dx-muted)]">{range === 365 ? "12 months" : `${range} days`}</span>}>
          {top.length === 0 ? (
            <Empty text="Top releases show up once people open your links." />
          ) : (
            <ol className="space-y-2">
              {top.map((t, i) => (
                <li key={t.l.id}>
                  <button onClick={() => go("releases", t.r!.id)} className="flex w-full items-center gap-2.5 text-left">
                    <span className="w-4 text-[12px] text-[var(--dx-dim)]">{i + 1}</span>
                    <Cover path={t.r!.artwork_path} size={32} />
                    <span className="min-w-0 flex-1 truncate text-[14px]">{t.r!.title}</span>
                    <span className="text-[13px] text-[var(--dx-sub)]">{t.n.toLocaleString()}</span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>

      <Panel title="Releases" href={() => go("releases")} pad={false}>
        <ReleaseTable rows={releases.slice(0, 6)} onOpen={(id) => go("releases", id)} empty={<Empty text="No releases yet." action={<button onClick={() => go("releases", "new")} className="dx-btn dx-btn-primary">New release</button>} />} />
      </Panel>

      <Panel title="Statistics" pad={false}>
        <div className="grid grid-cols-2 border-t border-[var(--dx-line)] md:grid-cols-4">
          {[
            ["Artists", counts.artists],
            ["Releases", releases.length],
            ["Tracks", counts.tracks],
            ["Link views", sum?.views ?? 0],
          ].map(([k, v], i) => (
            <div key={k as string} className={cn("px-4 py-4", i > 0 && "border-l border-[var(--dx-line)]", i === 2 && "max-md:border-l-0 max-md:border-t", i === 3 && "max-md:border-t")}>
              <div className="text-[14px] text-[var(--dx-sub)]">{k}</div>
              <div className="mt-1 text-[24px] font-medium">{Number(v).toLocaleString()}</div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

/** banner: your own covers in a strip (or a grainy gradient in your brand colour) */
function BannerArt({ releases }: { releases: DistRelease[] }) {
  const brand = useBrand();
  const arts = releases.filter((r) => r.artwork_path).slice(0, 10);
  if (!arts.length)
    return (
      <div className="absolute inset-0" style={{ background: `radial-gradient(120% 140% at 20% 0%, ${brand.accent}55, transparent 55%), radial-gradient(90% 120% at 90% 100%, #3b2a7a88, transparent 60%), #141414` }}>
        <div className="dx-grain absolute inset-0" />
      </div>
    );
  return (
    <div className="absolute inset-0 flex">
      {arts.concat(arts).slice(0, 10).map((r, i) => (
        <BannerTile key={`${r.id}-${i}`} path={r.artwork_path} />
      ))}
      <div className="dx-grain absolute inset-0" />
    </div>
  );
}
function BannerTile({ path }: { path: string | null }) {
  const u = useCover(path);
  return <div className="h-full min-w-[180px] flex-1 bg-cover bg-center opacity-80 saturate-[.85]" style={u ? { backgroundImage: `url(${JSON.stringify(u)})` } : { background: "#1c1c1c" }} />;
}

/* ───────────────────────── Releases ───────────────────────── */

function ReleaseTable({ rows, onOpen, empty }: { rows: DistRelease[]; onOpen: (id: string) => void; empty: React.ReactNode }) {
  return (
    <div className="border-t border-[var(--dx-line)]">
      <div className="hidden grid-cols-[1fr_160px_200px] border-b border-[var(--dx-line)] px-4 py-3 sm:grid">
        <span className="dx-label">Release</span>
        <span className="dx-label">Release date</span>
        <span className="dx-label">Status</span>
      </div>
      {rows.length === 0
        ? empty
        : rows.map((r) => (
            <button key={r.id} onClick={() => onOpen(r.id)} className="grid w-full grid-cols-[1fr_auto] items-center gap-3 border-b border-[var(--dx-line)] px-4 py-3 text-left last:border-0 hover:bg-[var(--dx-raise)] sm:grid-cols-[1fr_160px_200px]">
              <span className="flex min-w-0 items-center gap-3">
                <Cover path={r.artwork_path} size={44} />
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-medium text-white">{r.title}</span>
                  <span className="block truncate text-[13px] text-[var(--dx-muted)]">
                    {r.primary_artist_name} · {r.release_type}
                    {r.upc ? ` · ${r.upc}` : ""}
                  </span>
                </span>
              </span>
              <span className="hidden text-[14px] text-[var(--dx-sub-2)] sm:block">{new Date(r.release_date).toLocaleDateString([], { dateStyle: "medium" })}</span>
              <span>
                <StatusTag s={r.status} />
              </span>
            </button>
          ))}
    </div>
  );
}

type RelTab = "all" | "needs" | "progress" | "live" | "draft";
export function DxReleases({ releases, onReload }: { releases: DistRelease[]; onReload: () => void }) {
  const [tab, setTab] = useState<RelTab>("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"needs" | "newest" | "oldest" | "date" | "title">("needs");
  useEffect(onReload, []); // eslint-disable-line react-hooks/exhaustive-deps
  const counts = {
    all: releases.length,
    needs: releases.filter((r) => NEEDS.includes(r.status)).length,
    progress: releases.filter((r) => PROGRESS.includes(r.status)).length,
    live: releases.filter((r) => r.status === "live").length,
    draft: releases.filter((r) => r.status === "draft").length,
  };
  const rows = useMemo(() => {
    let l = releases.filter((r) => (tab === "all" ? true : tab === "needs" ? NEEDS.includes(r.status) : tab === "progress" ? PROGRESS.includes(r.status) : tab === "live" ? r.status === "live" : r.status === "draft"));
    const n = q.trim().toLowerCase();
    if (n) l = l.filter((r) => [r.title, r.primary_artist_name, r.upc, r.label_name].some((v) => v && v.toLowerCase().includes(n)));
    const t = (r: DistRelease) => Date.parse(r.updated_at);
    return [...l].sort((a, b) =>
      sort === "needs" ? Number(NEEDS.includes(b.status)) - Number(NEEDS.includes(a.status)) || t(b) - t(a) : sort === "newest" ? t(b) - t(a) : sort === "oldest" ? t(a) - t(b) : sort === "date" ? Date.parse(b.release_date) - Date.parse(a.release_date) : a.title.localeCompare(b.title),
    );
  }, [releases, tab, q, sort]);
  const newRelease = () => useStudio.setState({ section: "releases", releaseId: "new" });

  return (
    <div>
      <DxHeader
        title="Releases"
        sub="Your catalog: drafts, submissions, and what is live."
        actions={
          <>
            <button
              disabled={!releases.length}
              onClick={async () => {
                const { data } = releases.length ? await supabase.from("dist_tracks").select("*").in("release_id", releases.map((r) => r.id).slice(0, 300)) : { data: [] };
                exportCatalogCsv(releases, (data ?? []) as DistTrack[]);
              }}
              className="dx-btn"
            >
              <Download className="size-4" /> Export CSV
            </button>
            <button onClick={newRelease} className="dx-btn dx-btn-primary pr-0">
              New release
              <span className="ml-2 grid h-full w-9 place-items-center border-l border-black/15">
                <Plus className="size-4" />
              </span>
            </button>
          </>
        }
      />
      <div className="dx-panel">
        <div className="flex flex-col gap-3 border-b border-[var(--dx-line)] p-4 lg:flex-row lg:items-center">
          <div className="dx-seg max-w-full overflow-x-auto">
            {(
              [
                ["all", "All"],
                ["needs", "Needs you"],
                ["progress", "In progress"],
                ["live", "Live"],
                ["draft", "Drafts"],
              ] as const
            ).map(([k, l]) => (
              <button key={k} aria-pressed={tab === k} onClick={() => setTab(k)}>
                {l}
                <i>{counts[k]}</i>
              </button>
            ))}
          </div>
          <div className="flex flex-1 gap-2 lg:justify-end">
            <label className="relative min-w-0 flex-1 lg:max-w-[300px]">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--dx-dim)]" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search titles, artists, codes" className="dx-input pl-9" />
            </label>
            <div className="relative">
              <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="dx-input appearance-none pr-8">
                <option value="needs">Needs you first</option>
                <option value="newest">Recently updated</option>
                <option value="oldest">Oldest</option>
                <option value="date">Release date</option>
                <option value="title">Title A–Z</option>
              </select>
              <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-[var(--dx-muted)]" />
            </div>
          </div>
        </div>
        <ReleaseTable
          rows={rows}
          onOpen={(id) => useStudio.setState({ section: "releases", releaseId: id })}
          empty={<Empty text={q ? "No releases match." : "Nothing here yet."} action={!q && tab === "all" ? <button onClick={newRelease} className="dx-btn dx-btn-primary">New release</button> : undefined} />}
        />
      </div>
    </div>
  );
}

/* ───────────────────────── Artists ───────────────────────── */

export function DxArtists({ releases }: { releases: DistRelease[] }) {
  const [list, setList] = useState<DistArtist[] | null>(null);
  const [name, setName] = useState("");
  const [spotify, setSpotify] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void listArtists().then(setList);
  }, []);
  const relCount = (a: DistArtist) => releases.filter((r) => r.artist_ids?.includes(a.id) || r.primary_artist_name === a.name).length;
  return (
    <div>
      <DxHeader title="Artists" sub="Everyone you release music for, with their store profiles." />
      <div className="dx-panel mb-5 p-4">
        <div className="dx-label mb-2">Add an artist</div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Artist name" className="dx-input" />
          <input value={spotify} onChange={(e) => setSpotify(e.target.value)} placeholder="Spotify artist link or ID (optional)" className="dx-input" />
          <button
            disabled={busy || !name.trim()}
            onClick={async () => {
              setBusy(true);
              const id = spotify.match(/artist\/([A-Za-z0-9]+)/)?.[1] ?? (spotify.trim() || null);
              const a = await createArtist({ name: name.trim(), spotify_id: id });
              if (a) {
                setList((l) => [...(l ?? []), a].sort((x, y) => x.name.localeCompare(y.name)));
                setName("");
                setSpotify("");
              }
              setBusy(false);
            }}
            className="dx-btn dx-btn-primary"
          >
            Add artist
          </button>
        </div>
      </div>
      <div className="dx-panel">
        <div className="hidden grid-cols-[1fr_120px_220px] border-b border-[var(--dx-line)] px-4 py-3 sm:grid">
          <span className="dx-label">Artist</span>
          <span className="dx-label">Releases</span>
          <span className="dx-label">Profiles</span>
        </div>
        {list === null ? (
          <Empty text="Loading…" />
        ) : list.length === 0 ? (
          <Empty text="No artists yet." />
        ) : (
          list.map((a) => (
            <div key={a.id} className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-[var(--dx-line)] px-4 py-3 last:border-0 sm:grid-cols-[1fr_120px_220px]">
              <span className="flex min-w-0 items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center bg-[var(--dx-active)] text-[13px] font-semibold">{a.name.slice(0, 2).toUpperCase()}</span>
                <span className="truncate text-[14px] font-medium">{a.name}</span>
              </span>
              <span className="hidden text-[14px] text-[var(--dx-sub-2)] sm:block">{relCount(a)}</span>
              <span className="flex gap-1.5">
                {a.spotify_id ? (
                  <a href={`https://open.spotify.com/artist/${a.spotify_id}`} target="_blank" rel="noreferrer" className="dx-btn dx-btn-sm">
                    Spotify <ArrowUpRight className="size-3.5" />
                  </a>
                ) : (
                  <span className="text-[13px] text-[var(--dx-dim)]">No store profile yet</span>
                )}
                {a.apple_id && (
                  <a href={`https://music.apple.com/artist/${a.apple_id}`} target="_blank" rel="noreferrer" className="dx-btn dx-btn-sm">
                    Apple <ArrowUpRight className="size-3.5" />
                  </a>
                )}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ───────────────────────── Analytics ───────────────────────── */

export function DxAnalytics({ releases }: { releases: DistRelease[] }) {
  const [range, setRange] = useState<7 | 30 | 90>(30);
  const [rows, setRows] = useState<LinkStatRow[] | null>(null);
  const [links, setLinks] = useState<SmartLink[]>([]);
  useEffect(() => {
    setRows(null);
    void linkStats(range).then(setRows);
  }, [range]);
  useEffect(() => {
    void listSmartLinks().then(setLinks);
  }, []);
  const s = rows ? summarize(rows) : null;
  const bar = (entries: [string, number][]) => {
    const mx = Math.max(1, ...entries.map((e) => e[1]));
    return entries.length === 0 ? (
      <Empty text="No data yet." />
    ) : (
      <div className="space-y-2">
        {entries.slice(0, 8).map(([k, v]) => (
          <div key={k}>
            <div className="mb-1 flex justify-between text-[13px]">
              <span className="capitalize">{k.replace(/_/g, " ") || "Unknown"}</span>
              <span className="text-[var(--dx-sub)]">{v.toLocaleString()}</span>
            </div>
            <div className="h-1.5 bg-[var(--dx-active)]">
              <div className="h-full bg-[var(--dx-hi)]" style={{ width: `${(v / mx) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    );
  };
  const byRelease = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of rows ?? []) m[r.link_id] = (m[r.link_id] ?? 0) + r.n;
    return links.map((l) => [releases.find((r) => r.id === l.release_id)?.title ?? l.slug, m[l.id] ?? 0] as [string, number]).filter((x) => x[1] > 0).sort((a, b) => b[1] - a[1]);
  }, [rows, links, releases]);
  return (
    <div>
      <DxHeader
        title="Analytics"
        sub="Who opens your release links, where they listen, and from which country."
        actions={
          <div className="dx-seg">
            {([7, 30, 90] as const).map((r) => (
              <button key={r} aria-pressed={range === r} onClick={() => setRange(r)}>
                {r}D
              </button>
            ))}
          </div>
        }
      />
      <div className="dx-panel mb-5 grid grid-cols-2 md:grid-cols-4">
        {[
          ["Link views", s?.views ?? 0],
          ["Store clicks", s?.clicks ?? 0],
          ["Click-through", s && s.views ? `${Math.round((s.clicks / s.views) * 100)}%` : "—"],
          ["Countries", s ? Object.keys(s.byCountry).length : 0],
        ].map(([k, v], i) => (
          <div key={k as string} className={cn("p-4", i > 0 && "border-l border-[var(--dx-line)]", i === 2 && "max-md:border-t max-md:border-l-0", i === 3 && "max-md:border-t")}>
            <div className="text-[14px] text-[var(--dx-sub)]">{k}</div>
            <div className="mt-1 text-[26px] font-medium">{typeof v === "number" ? v.toLocaleString() : v}</div>
          </div>
        ))}
      </div>
      <div className="grid gap-5 md:grid-cols-3">
        <Panel title="Stores">{rows === null ? <Empty text="Loading…" /> : bar(Object.entries(s?.byService ?? {}).sort((a, b) => b[1] - a[1]))}</Panel>
        <Panel title="Countries">{rows === null ? <Empty text="Loading…" /> : bar(Object.entries(s?.byCountry ?? {}).sort((a, b) => b[1] - a[1]))}</Panel>
        <Panel title="Releases">{rows === null ? <Empty text="Loading…" /> : bar(byRelease)}</Panel>
      </div>
      <p className="mt-4 text-[12px] text-[var(--dx-dim)]">Store stream counts arrive with royalty reports in Earnings; this page tracks your Nexus release links in real time.</p>
    </div>
  );
}

/* ───────────────────────── Tools ───────────────────────── */

type FoundTrack = { name?: string; title?: string; isrc?: string | null; artists?: { name: string }[]; url?: string | null };
export function DxTools({ go }: { go: (s: DxSection) => void }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ title: string; upc: string | null; tracks: { title: string; artist: string; isrc: string | null }[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const find = async () => {
    const v = q.trim();
    if (!v) return;
    setBusy(true);
    setErr(null);
    setRes(null);
    try {
      const isrc = v.toUpperCase().replace(/[^A-Z0-9]/g, "");
      const digits = v.replace(/\D/g, "");
      const body = /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(isrc) && !/^https?:/.test(v) ? { action: "isrc", isrc } : /^\d{12,14}$/.test(digits) && digits.length === v.replace(/\s/g, "").length ? { action: "upc", upc: digits } : { action: "reverse", url: v };
      const { data, error } = await supabase.functions.invoke("spotify", { body });
      if (error) {
        let m = error.message;
        try {
          m = (await (error as { context?: Response }).context?.json())?.error ?? m;
        } catch {
          /* not json */
        }
        throw new Error(m);
      }
      const name = (t: FoundTrack) => t.name ?? t.title ?? "";
      const artist = (t: FoundTrack) => (t.artists ?? []).map((a) => a.name).join(", ");
      if (body.action === "isrc") {
        const t = (data?.tracks ?? []) as FoundTrack[];
        if (!t.length) throw new Error("No release found for that ISRC");
        setRes({ title: name(t[0]), upc: null, tracks: t.map((x) => ({ title: name(x), artist: artist(x), isrc: x.isrc ?? isrc })) });
      } else if (body.action === "upc") {
        const a = (data?.albums ?? [])[0];
        if (!a) throw new Error("No album found for that UPC");
        setRes({ title: a.name ?? a.title, upc: digits, tracks: ((a.tracks ?? []) as FoundTrack[]).map((x) => ({ title: name(x), artist: artist(x), isrc: x.isrc ?? null })) });
      } else {
        const tracks = (data?.tracks ?? (data?.track ? [data.track] : [])) as FoundTrack[];
        setRes({ title: data?.album?.name ?? name(tracks[0] ?? {}), upc: data?.upc ?? null, tracks: tracks.map((x) => ({ title: name(x), artist: artist(x), isrc: x.isrc ?? null })) });
      }
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  };
  const csv = () => {
    if (!res) return;
    const lines = [["title", "artist", "isrc", "upc"].join(","), ...res.tracks.map((t) => [t.title, t.artist, t.isrc ?? "", res.upc ?? ""].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))];
    saveBlob(new Blob([lines.join("\r\n")], { type: "text/csv" }), `${res.title.replace(/[^\w-]+/g, "-").slice(0, 40) || "codes"}.csv`);
  };

  return (
    <div>
      <DxHeader title="Tools" sub="Small utilities that sit beside your catalog rather than inside a release." />
      <div className="dx-panel flex flex-col sm:flex-row">
        <div className="relative grid h-40 shrink-0 place-items-center overflow-hidden border-b border-[var(--dx-line)] bg-[var(--dx-bg)] sm:h-auto sm:w-44 sm:border-r sm:border-b-0">
          <div className="absolute inset-0" style={{ background: "repeating-radial-gradient(circle at 70% 60%, #ffffff10 0 2px, transparent 3px 9px)" }} />
          <div className="dx-grain absolute inset-0" />
          <span className="relative grid size-14 place-items-center border border-white/30 bg-black">
            <Search className="size-6" />
          </span>
        </div>
        <div className="min-w-0 flex-1 p-4">
          <span className="dx-tag">Look up a code</span>
          <h3 className="mt-2 text-[18px] font-medium">ISRC + UPC finder</h3>
          <p className="mt-1 text-[14px] text-[var(--dx-sub)]">Paste a Spotify link and get the ISRC of every track plus the release UPC. Paste a bare ISRC or UPC to go the other way.</p>
          <div className="mt-3 flex gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void find()} placeholder="Paste a track or album link, or an ISRC or UPC" className="dx-input" />
            <button disabled={busy || !q.trim()} onClick={() => void find()} className="dx-btn">
              {busy ? <Loader2 className="size-4 animate-spin" /> : "Find codes"}
            </button>
          </div>
          {err && <p className="mt-2 text-[13px] text-[#ff8a8a]">{err}</p>}
          {res && (
            <div className="mt-3 border border-[var(--dx-line)]">
              <div className="flex items-center gap-2 border-b border-[var(--dx-line)] px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{res.title}</span>
                {res.upc && (
                  <button onClick={() => void navigator.clipboard.writeText(res.upc!).then(() => toast("UPC copied", "success"))} className="font-mono text-[12px] text-[var(--dx-sub-2)] hover:text-white">
                    UPC {res.upc}
                  </button>
                )}
                <button onClick={csv} className="dx-btn dx-btn-sm">
                  <Download className="size-3.5" /> CSV
                </button>
              </div>
              {res.tracks.map((t, i) => (
                <div key={i} className="flex items-center gap-2 border-b border-[var(--dx-line)] px-3 py-2 text-[13px] last:border-0">
                  <span className="w-5 text-[var(--dx-dim)]">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {t.title} <span className="text-[var(--dx-muted)]">— {t.artist}</span>
                  </span>
                  {t.isrc && (
                    <button onClick={() => void navigator.clipboard.writeText(t.isrc!).then(() => toast("ISRC copied", "success"))} className="font-mono text-[var(--dx-sub-2)] hover:text-white">
                      {t.isrc}
                    </button>
                  )}
                </div>
              ))}
              {res.tracks.length > 1 && (
                <div className="px-3 py-2">
                  <button onClick={() => void navigator.clipboard.writeText(res.tracks.map((t) => t.isrc).filter(Boolean).join("\n")).then(() => toast("All ISRCs copied", "success"))} className="text-[13px] text-[var(--dx-sub)] hover:text-white">
                    Copy all ISRCs
                  </button>
                </div>
              )}
            </div>
          )}
          <p className="mt-3 text-[12px] text-[var(--dx-dim)]">Codes come from the stores, so a release that has not been delivered yet will not have any.</p>
        </div>
      </div>

      <div className="my-8 border-t border-[var(--dx-line)]" />
      <h2 className="text-[20px] font-medium">Store profiles</h2>
      <p className="mt-1 mb-4 text-[14px] text-[var(--dx-sub)]">Claiming your artist page unlocks store stats, profile controls and pitching. We deliver the music; the claim is yours to make.</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { name: "Spotify for Artists", body: "Your image and bio, audience numbers, and playlist pitching for unreleased music.", from: "#0b3d1d", to: "#1DB954", url: "https://artists.spotify.com/claim", need: "Needs a live release", cta: "How to claim it" },
          { name: "Apple Music for Artists", body: "Plays, listeners and Shazams, the profile image and the milestones page.", from: "#4a0710", to: "#FA243C", url: "https://artists.apple.com", need: "Needs a live release", cta: "How to claim it" },
          { name: "Deezer for Creators", body: "Image and bio, a highlighted release, and a notification to your followers.", from: "#2a0a4a", to: "#A238FF", url: "https://www.deezer.com/en/creators", need: "Needs a live release", cta: "How to claim it" },
          { name: "YouTube Official Artist Channel", body: "One channel instead of three: your topic channel, music videos and subscribers included.", from: "#4a0000", to: "#FF0000", url: "https://support.google.com/youtube/answer/7336634", need: "Requested by your distributor", cta: "How to get one" },
        ].map((c) => (
          <div key={c.name} className="dx-panel flex flex-col">
            <div className="relative h-24 overflow-hidden border-b border-[var(--dx-line)]" style={{ background: `radial-gradient(120% 120% at 30% 120%, ${c.to}, ${c.from} 55%, #0b0b0b)` }}>
              <div className="dx-grain absolute inset-0" />
              <span className="absolute top-1/2 left-1/2 grid size-10 -translate-x-1/2 -translate-y-1/2 place-items-center border border-white/40 text-[18px] font-black text-white" style={{ background: c.to }}>
                ♪
              </span>
            </div>
            <div className="flex flex-1 flex-col p-4">
              <h3 className="text-[15px] font-semibold">{c.name}</h3>
              <p className="mt-1 flex-1 text-[13px] text-[var(--dx-sub)]">{c.body}</p>
              <div className="dx-label mt-4 mb-2">{c.need}</div>
              <a href={c.url} target="_blank" rel="noreferrer" className="dx-btn dx-btn-sm self-start">
                {c.cta} <ArrowUpRight className="size-3.5" />
              </a>
            </div>
          </div>
        ))}
      </div>

      <div className="my-8 border-t border-[var(--dx-line)]" />
      <h2 className="text-[20px] font-medium">Protection</h2>
      <p className="mt-1 mb-4 text-[14px] text-[var(--dx-sub)]">Fingerprint unreleased songs, catch re-uploads and keep fake profiles off your page.</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {(
          [
            ["shield", "Shield 360", "Lock unreleased songs so leaks get blocked everywhere on Nexus."],
            ["content-id", "Content ID", "ACRCloud + Audible Magic scans and the global block switch."],
            ["defender", "Profile Defender", "Watch up to 50 artist profiles for releases that aren't yours."],
            ["takedowns", "Takedowns", "Send official copyright notices to the stores in one go."],
          ] as [DxSection, string, string][]
        ).map(([s, t, b]) => (
          <button key={s} onClick={() => go(s)} className="dx-panel group p-4 text-left hover:bg-[var(--dx-panel)]">
            <div className="flex items-center justify-between">
              <h3 className="text-[15px] font-semibold">{t}</h3>
              <ArrowRight className="size-4 text-[var(--dx-dim)] transition group-hover:translate-x-0.5 group-hover:text-white" />
            </div>
            <p className="mt-1 text-[13px] text-[var(--dx-sub)]">{b}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ───────────────────────── Settings ───────────────────────── */

type SetKey = "plan" | "prefs" | "security" | "data" | "labels" | "branding" | "agreements" | "platform" | "toolost" | "ddex";
export function DxSettings() {
  const me = useApp((s) => s.userId)!;
  const profile = useApp((s) => s.profiles[me]);
  const staff = myRank() >= 3;
  const [k, setK] = useState<SetKey>(() => {
    const sub = typeof window !== "undefined" ? window.location.hash.split("/")[1] : "";
    return (["plan", "prefs", "security", "data", "labels", "branding", "agreements", "platform", "toolost", "ddex"] as SetKey[]).includes(sub as SetKey) ? (sub as SetKey) : "plan";
  });
  const plan = activePlan(profile);
  const groups: { label: string; items: [SetKey, string, string, React.ComponentType<{ className?: string }>][] }[] = [
    {
      label: "Account",
      items: [
        ["plan", "Plan & billing", plan ? plan.short : "Free plan", CreditCard],
        ["security", "Security", "Two-factor, sign-in and password", Lock],
        ["prefs", "Preferences", "Sound effects and volume", Volume2],
        ["data", "Your data", "Take a copy, or close the account", Archive],
      ],
    },
    {
      label: "Workspace",
      items: [
        ["labels", "Labels", "Labels and the releases under them", Library],
        ["branding", "Branding", "Your own name and logo", ImageIcon],
      ],
    },
    { label: "Legal", items: [["agreements", "Agreements", "What you accepted, and when", FileText]] },
    ...(staff ? [{ label: "Admin", items: [["platform", "Platform branding", "Default look for every workspace", PaletteIcon], ["toolost", "Too Lost", "Deliver releases via the API", KeyRound], ["ddex", "DDEX", "Party ID and recipients", FileText]] as [SetKey, string, string, React.ComponentType<{ className?: string }>][] }] : []),
  ];
  const cur = groups.flatMap((g) => g.items).find((i) => i[0] === k)!;
  const CurIcon = cur[3];
  const initials = (profile?.display_name || "N").slice(0, 2).toUpperCase();

  return (
    <div>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <h1 className="text-[34px] leading-[1.1] font-medium tracking-[-0.02em] sm:text-[40px]">Settings</h1>
          <p className="mt-2 text-[15px] text-[var(--dx-sub)]">Your account, what it is allowed to do, and what we hold about you.</p>
        </div>
        <div className="flex items-center gap-3 border border-[var(--dx-line-2)] p-2 pr-4">
          <span className="grid size-10 place-items-center bg-[var(--dx-active)] text-[13px] font-semibold">{initials}</span>
          <div>
            <div className="text-[14px] font-medium">{profile?.display_name ?? profile?.username}</div>
            <div className="text-[12px] text-[var(--dx-muted)]">
              {plan ? plan.short : "Free plan"} • {staff ? "Admin" : "Artist"} • since {profile?.created_at ? new Date(profile.created_at).toLocaleDateString([], { month: "short", year: "numeric" }) : "—"}
            </div>
          </div>
        </div>
      </div>
      <div className="grid border-t border-[var(--dx-line)] md:grid-cols-[230px_1fr]">
        <nav className="border-[var(--dx-line)] py-3 md:border-r md:pr-3">
          {groups.map((g) => (
            <div key={g.label} className="mb-3">
              <div className="dx-label px-2 py-2">{g.label}</div>
              {g.items.map(([id, t, s, I]) => (
                <button key={id} onClick={() => setK(id)} className={cn("relative flex w-full items-center gap-3 rounded-[7px] px-2 py-2 text-left", k === id ? "bg-[var(--dx-active)]" : "hover:bg-[var(--dx-raise)]")}>
                  {k === id && <span className="absolute inset-y-0 -left-px w-0.5 bg-[var(--dx-hi)]" />}
                  <span className="grid size-7 shrink-0 place-items-center rounded-[6px] border border-[var(--dx-line-2)] bg-[var(--dx-raise)]">
                    <I className="size-3.5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-medium">{t}</span>
                    <span className="block truncate text-[12px] text-[var(--dx-muted)]">{s}</span>
                  </span>
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="min-w-0 py-5 md:pl-7">
          <div className="mb-5 flex items-start gap-4 border-b border-[var(--dx-line)] pb-5">
            <span className="grid size-12 shrink-0 place-items-center border border-[var(--dx-line-2)] bg-[var(--dx-raise)]">
              <CurIcon className="size-5" />
            </span>
            <div>
              <div className="dx-label">{groups.find((g) => g.items.some((i) => i[0] === k))?.label}</div>
              <h2 className="text-[24px] font-medium">{cur[1]}</h2>
              <p className="text-[14px] text-[var(--dx-sub)]">{SET_SUB[k]}</p>
            </div>
          </div>
          {k === "plan" && <PlanPane />}
          {k === "security" && <SecurityPane />}
          {k === "data" && <DataPane />}
          {k === "labels" && <LabelsPane />}
          {k === "branding" && <BrandingPane scope="mine" />}
          {k === "agreements" && <AgreementsPane />}
          {k === "platform" && staff && <BrandingPane scope="global" />}
          {k === "prefs" && <PrefsPane />}
          {k === "toolost" && staff && <TooLostPane />}
          {k === "ddex" && staff && <DdexPane />}
        </div>
      </div>
    </div>
  );
}
const SET_SUB: Record<SetKey, string> = {
  plan: "Your plan, catalogue allowances and billing in one place.",
  security: "Keep the account that holds your catalogue and royalties locked down.",
  data: "Everything we hold about your releases, as a download.",
  labels: "The label names your releases go out under.",
  branding: "White-label the workspace: your name, logo and colour instead of ours.",
  agreements: "The terms you agreed to when you signed up and released music.",
  platform: "The default brand every workspace sees unless it sets its own.",
  prefs: "How the workspace feels on this device.",
  toolost: "Connect your Too Lost account so approved releases are delivered straight from Nexus.",
  ddex: "Your DDEX Party ID and the DSPs or distributors you deliver ERN 4.3 packages to.",
};

function PlanPane() {
  const me = useApp((s) => s.userId)!;
  const profile = useApp((s) => s.profiles[me]);
  const plan = activePlan(profile);
  return (
    <div className="space-y-4">
      <div className="dx-panel p-4">
        <div className="dx-label">Current plan</div>
        <div className="mt-1 text-[22px] font-medium">{plan ? plan.name : "Free"}</div>
        {plan && profile?.premium_until && <div className="text-[13px] text-[var(--dx-muted)]">Renews or ends {new Date(profile.premium_until).toLocaleDateString([], { dateStyle: "long" })}</div>}
        <ul className="mt-3 space-y-1 text-[14px] text-[var(--dx-sub-2)]">{(plan?.perks ?? ["Release music for free", "Smart links and analytics", "Upgrade for Shield, distribution and more"]).slice(0, 6).map((p) => <li key={p}>— {p}</li>)}</ul>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {PLANS.filter((p) => p.rank >= 2).slice(0, 4).map((p) => (
          <div key={p.id} className={cn("dx-panel p-4", plan?.id === p.id && "border-white")}>
            <div className="flex items-baseline justify-between">
              <span className="text-[15px] font-semibold">{p.short}</span>
              <span className="text-[14px] text-[var(--dx-sub-2)]">${p.price}/mo</span>
            </div>
            <p className="mt-1 text-[12px] text-[var(--dx-muted)]">{p.perks.slice(0, 2).join(" · ")}</p>
          </div>
        ))}
      </div>
      <button onClick={() => openModal("premium")} className="dx-btn dx-btn-primary">
        Explore plans <ArrowRight className="size-4" />
      </button>
    </div>
  );
}

function SecurityPane() {
  const [factors, setFactors] = useState<number | null>(null);
  useEffect(() => {
    void supabase.auth.mfa.listFactors().then(({ data }) => setFactors((data?.all ?? []).filter((f) => f.status === "verified").length));
  }, []);
  return (
    <div className="space-y-3">
      <div className="dx-panel flex items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-medium">Two-factor authentication</div>
          <div className="text-[13px] text-[var(--dx-muted)]">{factors === null ? "Checking…" : factors > 0 ? `On — ${factors} method${factors === 1 ? "" : "s"}` : "Off — turn it on to protect payouts and releases"}</div>
        </div>
        <a href="/" className="dx-btn dx-btn-sm">
          Manage <ArrowUpRight className="size-3.5" />
        </a>
      </div>
      <div className="dx-panel flex items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-medium">Password & sign-in</div>
          <div className="text-[13px] text-[var(--dx-muted)]">Same Nexus account everywhere — change it in Nexus → Settings → Account.</div>
        </div>
        <a href="/" className="dx-btn dx-btn-sm">
          Open Nexus <ArrowUpRight className="size-3.5" />
        </a>
      </div>
    </div>
  );
}

function DataPane() {
  const [busy, setBusy] = useState(false);
  const exportAll = async () => {
    setBusy(true);
    try {
      const me = useApp.getState().userId;
      const { data: rels } = await supabase.from("dist_releases").select("*").eq("owner_id", me);
      const ids = (rels ?? []).map((r) => r.id as string);
      const { data: tracks } = ids.length ? await supabase.from("dist_tracks").select("*").in("release_id", ids) : { data: [] };
      const { data: artists } = await supabase.from("dist_artists").select("*").eq("owner_id", me);
      const blob = await makeZip([
        { name: "nexus-distro/releases.json", data: JSON.stringify(rels ?? [], null, 2) },
        { name: "nexus-distro/tracks.json", data: JSON.stringify(tracks ?? [], null, 2) },
        { name: "nexus-distro/artists.json", data: JSON.stringify(artists ?? [], null, 2) },
        { name: "nexus-distro/README.txt", data: `Exported ${new Date().toISOString()}\nAudio and artwork stay in your releases — open each one in Releases to download them.` },
      ]);
      saveBlob(blob, `nexus-distro-export-${new Date().toISOString().slice(0, 10)}.zip`);
      toast("Export downloaded", "success");
    } catch (e) {
      toast((e as Error).message, "error");
    }
    setBusy(false);
  };
  return (
    <div className="space-y-3">
      <div className="dx-panel flex items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-medium">Take a copy</div>
          <div className="text-[13px] text-[var(--dx-muted)]">Releases, tracks, credits, splits and artists as JSON in a zip.</div>
        </div>
        <button disabled={busy} onClick={() => void exportAll()} className="dx-btn dx-btn-sm">
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />} Download
        </button>
      </div>
      <div className="dx-panel flex items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-medium">Close the account</div>
          <div className="text-[13px] text-[var(--dx-muted)]">Takes down live releases and deletes your Nexus account. Do it from Nexus → Settings → Account.</div>
        </div>
        <a href="/" className="dx-btn dx-btn-sm">
          Open Nexus <ArrowUpRight className="size-3.5" />
        </a>
      </div>
    </div>
  );
}

function LabelsPane() {
  const [rows, setRows] = useState<{ label: string; n: number; live: number }[] | null>(null);
  useEffect(() => {
    void supabase
      .from("dist_releases")
      .select("label_name, status")
      .eq("owner_id", useApp.getState().userId)
      .then(({ data }) => {
        const m: Record<string, { n: number; live: number }> = {};
        for (const r of (data ?? []) as { label_name: string; status: string }[]) {
          const k = r.label_name || "—";
          m[k] = m[k] ?? { n: 0, live: 0 };
          m[k].n++;
          if (r.status === "live") m[k].live++;
        }
        setRows(Object.entries(m).map(([label, v]) => ({ label, ...v })).sort((a, b) => b.n - a.n));
      });
  }, []);
  return (
    <div className="dx-panel">
      <div className="grid grid-cols-[1fr_90px_90px] border-b border-[var(--dx-line)] px-4 py-3">
        <span className="dx-label">Label</span>
        <span className="dx-label">Releases</span>
        <span className="dx-label">Live</span>
      </div>
      {rows === null ? (
        <Empty text="Loading…" />
      ) : rows.length === 0 ? (
        <Empty text="Labels show up here once you create a release." />
      ) : (
        rows.map((r) => (
          <div key={r.label} className="grid grid-cols-[1fr_90px_90px] border-b border-[var(--dx-line)] px-4 py-3 text-[14px] last:border-0">
            <span className="truncate font-medium">{r.label}</span>
            <span>{r.n}</span>
            <span>{r.live}</span>
          </div>
        ))
      )}
      <p className="px-4 py-3 text-[12px] text-[var(--dx-dim)]">Set the label on each release (Release → Label). Your Branding name is used as the default label for new releases.</p>
    </div>
  );
}

function AgreementsPane() {
  const me = useApp((s) => s.userId)!;
  const profile = useApp((s) => s.profiles[me]);
  return (
    <div className="dx-panel">
      {[
        ["Terms of service", "/privacy#terms", profile?.created_at],
        ["Privacy policy", "/privacy", profile?.created_at],
        ["Distribution terms (rights, royalties, takedowns)", "/privacy#distribution", profile?.created_at],
      ].map(([t, href, at]) => (
        <a key={t as string} href={href as string} className="flex items-center gap-3 border-b border-[var(--dx-line)] px-4 py-3 last:border-0 hover:bg-[var(--dx-raise)]">
          <FileText className="size-4 text-[var(--dx-muted)]" />
          <span className="min-w-0 flex-1 text-[14px]">{t}</span>
          <span className="text-[12px] text-[var(--dx-muted)]">{at ? `Accepted ${new Date(at as string).toLocaleDateString([], { dateStyle: "medium" })}` : ""}</span>
        </a>
      ))}
    </div>
  );
}

const ACCENTS = ["#ededed", "#8b0000", "#1DB954", "#FA243C", "#A238FF", "#2aabee", "#f0b232", "#ff5c35", "#e11d48"];

function BrandingPane({ scope }: { scope: "mine" | "global" }) {
  const mine = useBrandStore((s) => s.mine);
  const global = useBrandStore((s) => s.global);
  const src = scope === "mine" ? mine : global;
  const [f, setF] = useState<DistBrand>({ name: src?.name ?? "", logo_url: src?.logo_url ?? "", accent: src?.accent ?? "", tagline: src?.tagline ?? "", support_email: src?.support_email ?? "", hide_nexus: !!src?.hide_nexus, theme: src?.theme ?? (scope === "global" ? "classic" : null) });
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const theme: DxTheme = f.theme || (scope === "mine" ? global?.theme : null) || "classic";
  const accent: string = f.accent || (scope === "mine" && !f.theme ? global?.accent : null) || themeAccent(theme);
  const name: string = f.name || (scope === "mine" ? global?.name : null) || DEFAULT_BRAND.name || "Nexus Distro";

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <div className="space-y-4">
        <div>
          <span className="dx-label">Theme</span>
          <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {DX_THEMES.map((t) => (
              <button
                key={t.id}
                onClick={() => setF({ ...f, theme: t.id, accent: DX_THEMES.some((x) => x.accent.toLowerCase() === (f.accent ?? "").toLowerCase()) ? "" : f.accent })}
                aria-pressed={theme === t.id}
                className={cn("dx-ctl border p-2 text-left transition", theme === t.id ? "border-[var(--dx-hi)] bg-[var(--dx-raise)]" : "border-[var(--dx-line-2)] hover:border-[var(--dx-line-3)]")}
              >
                <span className="relative block h-14 overflow-hidden rounded-[5px] border border-black/40" style={{ background: t.swatch }}>
                  {t.mark && <span className="absolute right-1.5 bottom-0 text-[26px] leading-none font-black tracking-tighter opacity-40" style={{ color: t.mark }}>999</span>}
                  <span className="absolute bottom-1.5 left-1.5 h-3 w-12 rounded-[3px]" style={{ background: t.accent }} />
                </span>
                <span className="mt-1.5 block text-[14px] font-medium">{t.name}</span>
                <span className="block truncate text-[12px] text-[var(--dx-muted)]">{t.desc}</span>
              </button>
            ))}
          </div>
          {scope === "mine" && f.theme && (
            <button onClick={() => setF({ ...f, theme: null })} className="mt-1.5 text-[12px] text-[var(--dx-muted)] hover:text-white">
              Follow the platform theme instead
            </button>
          )}
        </div>
        <label className="block">
          <span className="dx-label">Workspace name</span>
          <input value={f.name ?? ""} maxLength={48} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={scope === "mine" ? "Your label or artist name" : "Nexus Distro"} className="dx-input mt-1.5" />
        </label>
        <div>
          <span className="dx-label">Logo</span>
          <div className="mt-1.5 flex items-center gap-3">
            <span className="grid size-14 shrink-0 place-items-center overflow-hidden border border-[var(--dx-line-2)] bg-[var(--dx-raise)]">
              {f.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={f.logo_url} alt="" className="size-full object-cover" />
              ) : (
                <ImageIcon className="size-5 text-[var(--dx-dim)]" />
              )}
            </span>
            <input ref={file} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif" hidden onChange={async (e) => {
              const fl = e.target.files?.[0];
              if (!fl) return;
              setBusy(true);
              const u = await uploadBrandLogo(fl);
              if (u) setF((x) => ({ ...x, logo_url: u }));
              setBusy(false);
              e.target.value = "";
            }} />
            <button disabled={busy} onClick={() => file.current?.click()} className="dx-btn dx-btn-sm">
              <Upload className="size-3.5" /> Upload
            </button>
            {f.logo_url && (
              <button onClick={() => setF({ ...f, logo_url: "" })} className="text-[13px] text-[var(--dx-muted)] hover:text-white">
                Remove
              </button>
            )}
          </div>
          <p className="mt-1 text-[12px] text-[var(--dx-dim)]">Square PNG/SVG, at least 256×256.</p>
        </div>
        <div>
          <span className="dx-label">Accent</span>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {ACCENTS.map((c) => (
              <button key={c} onClick={() => setF({ ...f, accent: c })} className={cn("size-8 border", accent.toLowerCase() === c.toLowerCase() ? "border-white ring-1 ring-white" : "border-[var(--dx-line-2)]")} style={{ background: c }} aria-label={`Accent ${c}`} />
            ))}
            <label className="flex h-8 items-center gap-2 border border-[var(--dx-line-2)] px-2 text-[13px]">
              <input type="color" value={/^#[0-9a-f]{6}$/i.test(accent) ? accent : "#ededed"} onChange={(e) => setF({ ...f, accent: e.target.value })} className="size-5 bg-transparent" />
              {accent}
            </label>
          </div>
        </div>
        <label className="block">
          <span className="dx-label">Tagline</span>
          <input value={f.tagline ?? ""} maxLength={120} onChange={(e) => setF({ ...f, tagline: e.target.value })} placeholder="Shown on your overview banner" className="dx-input mt-1.5" />
        </label>
        <label className="block">
          <span className="dx-label">Support email</span>
          <input value={f.support_email ?? ""} maxLength={120} onChange={(e) => setF({ ...f, support_email: e.target.value })} placeholder="help@yourlabel.com" className="dx-input mt-1.5" />
        </label>
        {scope === "mine" && (
          <label className="flex items-center gap-2 text-[14px]">
            <input type="checkbox" checked={!!f.hide_nexus} onChange={(e) => setF({ ...f, hide_nexus: e.target.checked })} />
            Hide &ldquo;Powered by Nexus&rdquo;
          </label>
        )}
        <div className="flex gap-2 pt-2">
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await saveBrand({ name: f.name || "", logo_url: f.logo_url || "", accent: f.accent || "", tagline: f.tagline || "", support_email: f.support_email || "", theme: f.theme || (scope === "global" ? "classic" : ""), ...(scope === "mine" ? { hide_nexus: !!f.hide_nexus } : {}) } as Partial<DistBrand>, scope);
              setBusy(false);
            }}
            className="dx-btn dx-btn-primary"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null} Save branding
          </button>
          <button onClick={() => setF({ name: "", logo_url: "", accent: "", tagline: "", support_email: "", hide_nexus: false, theme: scope === "global" ? "classic" : null })} className="dx-btn">
            Reset to default
          </button>
        </div>
      </div>

      {/* live preview */}
      <div>
        <div className="dx-label mb-2">Preview</div>
        <div className="dx border border-[var(--dx-line)] p-3" data-dx-theme={theme} style={{ ["--dx-accent" as string]: accent, ["--dx-on-accent" as string]: onColor(accent) } as React.CSSProperties}>
          <div className="flex items-center gap-2.5 p-1.5">
            <span className="grid size-8 place-items-center overflow-hidden bg-[var(--dx-hi)] text-[11px] font-black text-black">
              {f.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={f.logo_url} alt="" className="size-full object-cover" />
              ) : (
                name.slice(0, 2).toUpperCase()
              )}
            </span>
            <div className="min-w-0">
              <div className="truncate text-[14px] font-semibold">{name}</div>
              <div className="text-[12px] text-[var(--dx-muted)]">Workspace</div>
            </div>
          </div>
          <div className="mt-3 space-y-1 text-[13px] text-[var(--dx-sub-2)]">
            <div className="bg-[var(--dx-active)] px-2 py-1.5 text-white">Overview</div>
            <div className="px-2 py-1.5">Releases</div>
            <div className="px-2 py-1.5">Artists</div>
          </div>
          <button className="dx-btn dx-btn-primary mt-3 w-full">New release</button>
          {f.tagline && <p className="mt-2 text-[12px] text-[var(--dx-muted)]">{f.tagline}</p>}
        </div>
        <p className="mt-2 text-[12px] text-[var(--dx-dim)]">{scope === "mine" ? "Applies to your workspace and the artists who log in to it." : "Every workspace without its own branding uses this."}</p>
      </div>
    </div>
  );
}

function PrefsPane() {
  const { on, volume, loaded } = useDxSound();
  useEffect(() => {
    if (!loaded) loadDxSound();
  }, [loaded]);
  return (
    <div className="space-y-3">
      <div className="dx-panel flex items-center gap-4 p-4">
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-medium">Sound effects</div>
          <div className="text-[13px] text-[var(--dx-muted)]">Soft clicks on buttons, a chime when something saves, a low tone when it fails.</div>
        </div>
        <button role="switch" aria-checked={on} aria-label="Sound effects" onClick={() => setDxSound({ on: !on })} className="dx-switch" />
      </div>
      <div className={cn("dx-panel p-4 transition", !on && "pointer-events-none opacity-50")}>
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-medium">Volume</div>
            <div className="text-[13px] text-[var(--dx-muted)]">{Math.round(volume * 100)}%</div>
          </div>
          <button onClick={() => dxSfx.preview()} className="dx-btn dx-btn-sm">
            <Volume2 className="size-3.5" /> Test
          </button>
        </div>
        <input type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => setDxSound({ volume: Number(e.target.value) })} onPointerUp={() => dxSfx.click()} className="dx-range mt-3" aria-label="Sound volume" />
      </div>
      <p className="text-[12px] text-[var(--dx-dim)]">Saved on this browser only.</p>
    </div>
  );
}

function TooLostPane() {
  const [st, setSt] = useState<TooLostStatus | null>(null);
  const [env, setEnv] = useState<TooLostEnv>("sandbox");
  const [cid, setCid] = useState("");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const redirect = TOOLOST_REDIRECT();
  const act = async <T,>(key: string, fn: () => Promise<T>, ok?: string) => {
    setBusy(key);
    try {
      const r = await fn();
      if (ok) toast(ok, "success");
      return r;
    } catch (e) {
      toast((e as Error).message, "error");
      return null;
    } finally {
      setBusy(null);
    }
  };
  const reload = () =>
    tooLostStatus()
      .then((s) => {
        setSt(s);
        return s;
      })
      .catch((e) => {
        toast((e as Error).message, "error");
        return null;
      });
  useEffect(() => {
    void reload().then((s) => s && setEnv(s.env));
  }, []);
  const cur = st?.envs?.[env];
  const ready = !!cur?.client_id;

  return (
    <div className="space-y-4">
      <div className="dx-panel p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-medium">Environment</div>
            <div className="text-[13px] text-[var(--dx-muted)]">Sandbox has its own credentials and never reaches the stores. Switch to production to deliver for real.</div>
          </div>
          <div className="dx-seg">
            {(["sandbox", "production"] as const).map((e) => (
              <button key={e} aria-pressed={env === e} onClick={() => setEnv(e)}>
                {e === "sandbox" ? "Sandbox" : "Production"}
                {st?.env === e && <i>active</i>}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="dx-panel p-4">
        <div className="flex items-center gap-2">
          <span className="grid size-6 place-items-center rounded-full bg-[var(--dx-active)] text-[12px] font-semibold dx-round">1</span>
          <div className="text-[15px] font-medium">App credentials</div>
          <span className="dx-tag ml-auto">{ready ? (cur?.has_secret ? "Saved" : "ID only (PKCE)") : "Not set"}</span>
        </div>
        <p className="mt-1.5 text-[13px] text-[var(--dx-muted)]">
          From your approved app in the{" "}
          <a href="https://developer.toolost.com/dashboard" target="_blank" rel="noreferrer" className="underline decoration-[var(--dx-line-3)] underline-offset-2 hover:text-white">
            Too Lost Developer Portal
          </a>{" "}
          ({env} credentials). Request the scopes <span className="font-mono text-[12px] text-[var(--dx-sub-2)]">read:profile read:catalog read:releases write:releases read:analytics read:sales</span>.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <input value={cid} onChange={(e) => setCid(e.target.value)} placeholder={cur?.client_id ?? "Client ID"} autoComplete="off" spellCheck={false} className="dx-input font-mono" />
          <input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={cur?.has_secret ? "Client Secret saved — paste to replace" : "Client Secret (blank for a Public/PKCE app)"} autoComplete="new-password" spellCheck={false} className="dx-input font-mono" />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            disabled={!!busy || !(cid.trim() || (ready && secret.trim()))}
            onClick={() =>
              void act("save", () => saveTooLostClient(env, cid.trim() || "", secret.trim()), "Credentials saved").then((s) => {
                if (s) {
                  setSt(s);
                  setCid("");
                  setSecret("");
                }
              })
            }
            className="dx-btn dx-btn-primary"
          >
            {busy === "save" ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />} Save credentials
          </button>
          {ready && (
            <button disabled={!!busy} onClick={() => confirm(`Remove the ${env} credentials and disconnect?`) && void act("clear", () => saveTooLostClient(env, "", ""), "Removed").then((s) => s && setSt(s))} className="dx-btn dx-btn-danger">
              Remove
            </button>
          )}
        </div>
        <div className="mt-3 rounded-[7px] border border-[var(--dx-line)] bg-[var(--dx-input-bg)] p-2.5">
          <div className="dx-label">Redirect URI — add this exact URL to your Too Lost app</div>
          <div className="mt-1 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate text-[13px] text-[var(--dx-sub-2)]">{redirect}</code>
            <button onClick={() => void navigator.clipboard.writeText(redirect).then(() => toast("Copied", "success"))} className="dx-btn dx-btn-sm">
              Copy
            </button>
          </div>
        </div>
      </div>

      <div className={cn("dx-panel p-4", !ready && "opacity-60")}>
        <div className="flex items-center gap-2">
          <span className="grid size-6 place-items-center rounded-full bg-[var(--dx-active)] text-[12px] font-semibold dx-round">2</span>
          <div className="text-[15px] font-medium">Connect your Too Lost account</div>
          <span className="dx-tag ml-auto">{cur?.connected ? "Connected" : "Not connected"}</span>
        </div>
        {cur?.connected ? (
          <p className="mt-1.5 text-[13px] text-[var(--dx-muted)]">
            <span className="text-[var(--dx-sub-2)]">{cur.account || "Connected"}</span>
            {cur.connected_at && <> · since {new Date(cur.connected_at).toLocaleDateString([], { dateStyle: "medium" })}</>}
            {cur.expires_at && <> · reconnect by {new Date(cur.expires_at).toLocaleDateString([], { dateStyle: "medium" })} if unused</>}
          </p>
        ) : (
          <p className="mt-1.5 text-[13px] text-[var(--dx-muted)]">You'll sign in on Too Lost and approve Nexus. Releases you approve are then created, uploaded and submitted on that account.</p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <button disabled={!ready || !!busy} onClick={() => void act("connect", () => connectTooLost(env))} className="dx-btn dx-btn-primary">
            {busy === "connect" ? <Loader2 className="size-4 animate-spin" /> : null} {cur?.connected ? "Reconnect" : "Connect Too Lost"}
          </button>
          {cur?.connected && (
            <>
              <button disabled={!!busy} onClick={() => void act("test", () => toolost<{ account: string | null; releases: number | null }>("test", { env }), undefined).then((r) => r && toast(`Working — ${r.account ?? "account OK"}${r.releases != null ? ` · ${r.releases} releases` : ""}`, "success"))} className="dx-btn">
                {busy === "test" ? <Loader2 className="size-4 animate-spin" /> : null} Test connection
              </button>
              {st?.env !== env && (
                <button disabled={!!busy} onClick={() => void act("env", () => setTooLostEnv(env), `Deliveries now use ${env}`).then((s) => s && setSt(s))} className="dx-btn">
                  Use {env} for deliveries
                </button>
              )}
              <button disabled={!!busy} onClick={() => void act("disc", () => toolost("disconnect", { env }), "Disconnected").then(() => void reload())} className="dx-btn dx-btn-danger">
                Disconnect
              </button>
            </>
          )}
        </div>
      </div>

      {cur?.connected && <TooLostInsights env={env} />}

      <p className="text-[12px] leading-relaxed text-[var(--dx-dim)]">
        Credentials and tokens stay on the server and are only ever shown masked. Once connected, open any release in Manage releases and press <b className="text-[var(--dx-sub)]">Send to Too Lost</b> — artwork, audio, credits and metadata go across, and status, UPC and ISRCs sync back.
      </p>
    </div>
  );
}

function TooLostInsights({ env }: { env: TooLostEnv }) {
  const [period, setPeriod] = useState<string>("lastThirtyDays");
  const [a, setA] = useState<TooLostAnalytics | null>(null);
  const [months, setMonths] = useState<{ date: string; total: number }[] | null>(null);
  const [quota, setQuota] = useState<TooLostQuota>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const load = async (p = period) => {
    setBusy(true);
    setErr(null);
    try {
      const [an, sales] = await Promise.all([tooLostAnalytics(p, env), tooLostSales(env).catch(() => null)]);
      setA(an);
      setMonths(sales);
      setQuota(await tooLostQuota(env).catch(() => null));
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  };
  const max = Math.max(1, ...(a?.chart ?? []).map((c) => c.totalStreams));
  const fmt = (n: number) => new Intl.NumberFormat(undefined, { notation: n >= 100000 ? "compact" : "standard" }).format(n);
  return (
    <div className="dx-panel p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="grid size-6 place-items-center rounded-full bg-[var(--dx-active)] text-[12px] font-semibold dx-round">3</span>
        <div className="text-[15px] font-medium">Streams & earnings from Too Lost</div>
        <div className="dx-seg ml-auto">
          {TL_PERIODS.map(([id, label]) => (
            <button key={id} aria-pressed={period === id} onClick={() => (setPeriod(id), a && void load(id))}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {!a && !err && (
        <button disabled={busy} onClick={() => void load()} className="dx-btn mt-3">
          {busy ? <Loader2 className="size-4 animate-spin" /> : null} Load insights
        </button>
      )}
      {err && <p className="mt-3 text-[13px] text-[var(--dx-muted)]">{err}</p>}
      {a && (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["Streams", fmt(a.totalStreams)],
              ["Saves", fmt(a.totalSaves)],
              ["Skips", fmt(a.totalSkips)],
              ["Engagement", `${Math.round((a.engagement ?? 0) * (a.engagement <= 1 ? 100 : 1))}%`],
            ].map(([k, v]) => (
              <div key={k} className="rounded-[7px] border border-[var(--dx-line)] bg-[var(--dx-input-bg)] p-2.5">
                <div className="dx-label">{k}</div>
                <div className="mt-0.5 text-[18px] font-semibold tabular-nums">{v}</div>
              </div>
            ))}
          </div>
          {a.chart?.length > 0 && (
            <div className="mt-3 flex h-24 items-end gap-[2px]" aria-label="Streams per day">
              {a.chart.slice(-60).map((c) => (
                <div key={c.date} title={`${c.date}: ${c.totalStreams}`} className="h-full flex-1 flex items-end">
                  <div className="w-full rounded-t-[2px]" style={{ height: `${Math.max(2, (c.totalStreams / max) * 100)}%`, background: "var(--dx-hi, #e5e5e5)", opacity: 0.85 }} />
                </div>
              ))}
            </div>
          )}
          {months && months.length > 0 && (
            <div className="mt-3">
              <div className="dx-label mb-1">Earnings by month</div>
              <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
                {months.slice(0, 12).map((m) => (
                  <div key={m.date} className="rounded-[6px] border border-[var(--dx-line)] px-2 py-1.5 text-[12px]">
                    <div className="text-[var(--dx-muted)]">{m.date}</div>
                    <div className="font-semibold tabular-nums">${Number(m.total || 0).toFixed(2)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
      {quota && (
        <p className="mt-3 text-[12px] text-[var(--dx-dim)]">
          API plan {quota.plan ?? "—"} · {fmt(quota.used)}{quota.limit ? ` / ${fmt(quota.limit)}` : ""} calls this month · {fmt(quota.remaining)} left
        </p>
      )}
    </div>
  );
}

function DdexPane() {
  const [cfg, setCfg] = useState<DdexConfig | null>(null);
  const [f, setF] = useState({ sender_dpid: "", sender_name: "", label_name: "", test_mode: true });
  const [recips, setRecips] = useState<DdexRecipient[]>([]);
  const [nr, setNr] = useState<DdexRecipient>({ dpid: "", name: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void getDdex()
      .then((c) => {
        setCfg(c);
        setF({ sender_dpid: c.sender_dpid ?? "", sender_name: c.sender_name ?? "", label_name: c.label_name ?? "", test_mode: c.test_mode });
        setRecips(c.recipients ?? []);
      })
      .catch((e) => toast((e as Error).message, "error"));
  }, []);
  const dpidOk = !f.sender_dpid || DPID_RE.test(f.sender_dpid.toUpperCase());
  const save = async () => {
    setBusy(true);
    try {
      const c = await saveDdex({ ...f, recipients: recips });
      setCfg(c);
      setRecips(c.recipients);
      toast("DDEX settings saved", "success");
    } catch (e) {
      toast((e as Error).message, "error");
    }
    setBusy(false);
  };
  return (
    <div className="space-y-4">
      <div className="dx-panel space-y-3 p-4">
        <div className="text-[15px] font-medium">Sender</div>
        <label className="block">
          <span className="dx-label">Your DDEX Party ID (DPID)</span>
          <input value={f.sender_dpid} onChange={(e) => setF({ ...f, sender_dpid: e.target.value.toUpperCase().replace(/\s/g, "") })} placeholder="PADPIDA2014120301A" spellCheck={false} className={cn("dx-input mt-1.5 font-mono", !dpidOk && "border-[#a33]")} />
          <span className="mt-1 block text-[12px] text-[var(--dx-dim)]">
            Issued free by DDEX —{" "}
            <a href="https://dpid.ddex.net" target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-white">
              request one at dpid.ddex.net
            </a>
            .
          </span>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="dx-label">Sender name</span>
            <input value={f.sender_name} onChange={(e) => setF({ ...f, sender_name: e.target.value })} placeholder="Audia Music Recordings LLC" className="dx-input mt-1.5" />
          </label>
          <label className="block">
            <span className="dx-label">Default label (ReleaseLabel)</span>
            <input value={f.label_name} onChange={(e) => setF({ ...f, label_name: e.target.value })} placeholder="Uses each release's label if empty" className="dx-input mt-1.5" />
          </label>
        </div>
        <label className="flex items-center gap-3 pt-1">
          <button role="switch" aria-checked={f.test_mode} onClick={() => setF({ ...f, test_mode: !f.test_mode })} className="dx-switch" aria-label="Test messages" />
          <span className="text-[14px]">
            Send as <b>TestMessage</b> by default <span className="text-[var(--dx-muted)]">— switch off once the recipient has approved your test deliveries</span>
          </span>
        </label>
      </div>

      <div className="dx-panel p-4">
        <div className="text-[15px] font-medium">Recipients</div>
        <p className="mt-1 text-[13px] text-[var(--dx-muted)]">DSPs or distributors you have a direct DDEX feed with. Each gives you their DPID and an SFTP/S3 drop.</p>
        <ul className="mt-3 divide-y divide-[var(--dx-line)] rounded-[7px] border border-[var(--dx-line)]">
          {recips.length === 0 && <li className="px-3 py-3 text-[13px] text-[var(--dx-muted)]">No recipients yet.</li>}
          {recips.map((r, i) => (
            <li key={r.dpid} className="flex items-center gap-3 px-3 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium">{r.name}</span>
                <span className="block font-mono text-[12px] text-[var(--dx-muted)]">{r.dpid}</span>
              </span>
              <button onClick={() => setRecips(recips.filter((_, k) => k !== i))} className="dx-btn dx-btn-sm dx-btn-danger">
                Remove
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input value={nr.name} onChange={(e) => setNr({ ...nr, name: e.target.value })} placeholder="Recipient name (e.g. Spotify)" className="dx-input" />
          <input value={nr.dpid} onChange={(e) => setNr({ ...nr, dpid: e.target.value.toUpperCase().replace(/\s/g, "") })} placeholder="Recipient DPID" spellCheck={false} className="dx-input font-mono" />
          <button
            disabled={!DPID_RE.test(nr.dpid) || recips.some((r) => r.dpid === nr.dpid)}
            onClick={() => {
              setRecips([...recips, { dpid: nr.dpid, name: nr.name.trim() || nr.dpid }]);
              setNr({ dpid: "", name: "" });
            }}
            className="dx-btn shrink-0"
          >
            <Plus className="size-4" /> Add
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button disabled={busy || !dpidOk} onClick={() => void save()} className="dx-btn dx-btn-primary">
          {busy ? <Loader2 className="size-4 animate-spin" /> : null} Save DDEX settings
        </button>
        {cfg?.updated_at && <span className="text-[12px] text-[var(--dx-dim)]">Saved {new Date(cfg.updated_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</span>}
      </div>
      <p className="text-[12px] leading-relaxed text-[var(--dx-dim)]">
        Build a package from any release in <b className="text-[var(--dx-sub)]">Manage releases → DDEX delivery</b>. Releases need a UPC and an ISRC on every track. Validate your first messages with the recipient (or DDEX&apos;s validator) before switching off test mode.
      </p>
    </div>
  );
}
