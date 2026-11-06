"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, BadgeCheck, ChevronDown, ChevronUp, Copy, Download, ExternalLink, Link2, Lock, LogOut, Plus, Settings2, Shield, Sparkles, Star, Trash2 } from "lucide-react";
import QRCode from "qrcode";
import { supabase } from "@/lib/supabase";
import { useApp, toast } from "@/store/app";
import { roleRank } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { sanitizeDownloadName } from "@/lib/fileSafety";
import { normalizeLink, PLATFORMS } from "@/lib/links";
import {
  LINKBIO_BACKGROUNDS,
  LINKBIO_BUTTONS,
  LINKBIO_FONTS,
  LINKBIO_LAYOUTS,
  LINKBIO_THEMES,
  linkbioMine,
  linkbioSave,
  linkbioStats,
  linkbioUploadMusic,
  openLinkBio,
  publicLinkBioUrl,
  type LinkBioBackground,
  type LinkBioButtonStyle,
  type LinkBioFont,
  type LinkBioLayout,
  type LinkBioLink,
  type LinkBioPage,
  type LinkBioStats,
  type LinkBioStatsSeriesDay,
  type LinkBioTheme,
} from "@/lib/linkbio";
import { SOCIAL_VERIFY_LIST, linkVerifyReadiness } from "@/lib/linkVerify";
import { resolveMusicEmbed } from "@/lib/links";
import { studioGo } from "@/store/studio";
import LinkBioAdmin from "@/components/linkbio/LinkBioAdmin";
import PinToLinkPanel from "@/components/music/PinToLinkPanel";

export { openLinkBio };

function LinkStatsSparkline({ series }: { series: LinkBioStatsSeriesDay[] }) {
  const max = Math.max(1, ...series.map((d) => Math.max(d.views, d.clicks)));
  return (
    <div className="flex h-16 items-end gap-0.5 sm:gap-1">
      {series.map((d) => {
        const vh = Math.max(d.views ? 8 : 0, Math.round((d.views / max) * 100));
        const ch = Math.max(d.clicks ? 6 : 0, Math.round((d.clicks / max) * 100));
        return (
          <div key={d.day} className="group relative flex min-w-0 flex-1 flex-col items-center justify-end gap-0.5" title={`${d.day}: ${d.views} views · ${d.clicks} clicks`}>
            <div className="flex w-full items-end justify-center gap-px" style={{ height: "100%" }}>
              <span className="w-[45%] rounded-t-sm bg-[#c084fc]/80" style={{ height: `${vh}%` }} />
              <span className="w-[45%] rounded-t-sm bg-emerald-400/80" style={{ height: `${ch}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function LinkBioHub({
  mobile,
  onBack,
  standalone,
  initialAdmin,
}: {
  mobile?: boolean;
  onBack?: () => void;
  standalone?: boolean;
  initialAdmin?: boolean;
}) {
  const me = useApp((s) => (s.userId ? s.profiles[s.userId] : null));
  const canAdmin = roleRank(me?.site_role) >= 2;
  const [tab, setTab] = useState<"dashboard" | "edit" | "settings" | "stats" | "admin">(
    initialAdmin && canAdmin ? "admin" : "dashboard",
  );

  useEffect(() => {
    if (initialAdmin && canAdmin) setTab("admin");
  }, [initialAdmin, canAdmin]);
  const [page, setPage] = useState<LinkBioPage | null>(null);
  const [busy, setBusy] = useState(false);
  const [linkInput, setLinkInput] = useState("");
  const [plat, setPlat] = useState("website");
  const [pagePw, setPagePw] = useState("");
  const [stats, setStats] = useState<LinkBioStats | null>(null);
  const [statsDays, setStatsDays] = useState(7);

  useEffect(() => {
    void linkbioMine().then(setPage);
  }, []);

  useEffect(() => {
    if (tab === "stats" || tab === "dashboard") void linkbioStats(statsDays).then(setStats);
  }, [tab, statsDays]);

  async function save(patch: Record<string, unknown>) {
    setBusy(true);
    const next = await linkbioSave(patch);
    if (next) setPage(next);
    setBusy(false);
  }

  async function syncFromNexus() {
    if (!me) return;
    setBusy(true);
    const patch: Record<string, unknown> = {
      display_name: (me.display_name || me.username || "").slice(0, 48),
      avatar_url: me.avatar_url ?? "",
      bio: (me.bio ?? "").slice(0, 280),
      custom_status: (me.custom_status ?? "").slice(0, 80),
    };
    if (me.username && /^[a-z0-9_]{2,24}$/.test(me.username)) {
      patch.username = me.username;
    }
    const next = await linkbioSave(patch);
    if (next) setPage(next);
    setBusy(false);
  }

  if (tab === "admin" && canAdmin) {
    return <LinkBioAdmin onBack={() => setTab("dashboard")} />;
  }

  if (!page) {
    return (
      <div className="grid h-full place-items-center bg-[#0a0214] text-white/60">
        <div className="size-10 animate-spin rounded-full border-4 border-[#a855f7] border-t-transparent" />
      </div>
    );
  }

  const links = page.links ?? [];
  const publicUrl = publicLinkBioUrl(page.username);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#07060f] text-white">
      <header className={cn("flex shrink-0 items-center gap-2 border-b border-white/10 px-3", mobile || standalone ? "pt-safe-3 pb-2" : "h-12")}>
        {(onBack || mobile) && (
          <button
            type="button"
            onClick={() => (onBack ? onBack() : useApp.setState({ mobileTab: "me", appsTool: null, hub: null }))}
            className="grid size-9 place-items-center rounded-full hover:bg-white/10"
            aria-label="Back"
          >
            <ArrowLeft className="size-5" />
          </button>
        )}
        <Sparkles className="size-5 text-[#c084fc]" />
        <div className="min-w-0 flex-1">
          <div className={cn("font-bold tracking-tight", mobile || standalone ? "text-xl" : "text-base")}>Nexus Link</div>
          <div className="truncate text-[11px] text-white/45">Dashboard · online · themes</div>
        </div>
        <button
          type="button"
          onClick={() => setTab("dashboard")}
          className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold hover:bg-white/10", tab === "dashboard" && "bg-white/10 text-[#c084fc]")}
          title="Dashboard"
        >
          Home
        </button>
        <button
          type="button"
          onClick={() => setTab("edit")}
          className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold hover:bg-white/10", tab === "edit" && "bg-white/10 text-[#c084fc]")}
          title="Edit profile"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={() => setTab("stats")}
          className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold hover:bg-white/10", tab === "stats" && "bg-white/10 text-[#c084fc]")}
          title="Analytics"
        >
          Stats
        </button>
        <button
          type="button"
          onClick={() => setTab(tab === "settings" ? "dashboard" : "settings")}
          className={cn("grid size-9 place-items-center rounded-full hover:bg-white/10", tab === "settings" && "bg-white/10")}
          title="Settings"
        >
          <Settings2 className="size-4 text-[#c084fc]" />
        </button>
        {canAdmin && (
          <button type="button" onClick={() => setTab("admin")} className="grid size-9 place-items-center rounded-full hover:bg-white/10" title="Link Admin">
            <Shield className="size-4 text-[#a855f7]" />
          </button>
        )}
        <a href={publicUrl} target="_blank" rel="noreferrer" className="grid size-9 place-items-center rounded-full hover:bg-white/10" title="Open public page">
          <ExternalLink className="size-4" />
        </a>
        {standalone && (
          <button
            type="button"
            onClick={() => void supabase.auth.signOut()}
            className="grid size-9 place-items-center rounded-full hover:bg-white/10"
            title="Log out"
          >
            <LogOut className="size-4" />
          </button>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid max-w-5xl gap-5 p-3 sm:grid-cols-2 sm:p-5">
          {/* Editor */}
          <div className="space-y-4">
            {page.suspended && (
              <section className="rounded-2xl bg-red-500/15 p-4 ring-1 ring-red-400/40">
                <div className="font-bold text-red-200">Page suspended</div>
                <p className="mt-1 text-sm text-red-100/80">{page.suspend_reason || "Contact Nexus Link admin — edits are locked while suspended."}</p>
              </section>
            )}

            {tab === "dashboard" && (
              <section className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="text-sm font-bold tracking-wide text-white/70 uppercase">Dashboard</h2>
                  {page.premium ? (
                    <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] font-bold text-amber-300">⭐ Premium</span>
                  ) : (
                    <span className="text-[11px] text-white/40">Free · ask admin for Premium</span>
                  )}
                </div>
                <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-xl bg-black/30 p-3">
                    <div className="text-[11px] text-white/45">Views ({statsDays}d)</div>
                    <div className="font-mono text-xl font-black tabular-nums">{(stats?.views_period ?? 0).toLocaleString()}</div>
                  </div>
                  <div className="rounded-xl bg-black/30 p-3">
                    <div className="text-[11px] text-white/45">Clicks ({statsDays}d)</div>
                    <div className="font-mono text-xl font-black tabular-nums">{(stats?.clicks ?? 0).toLocaleString()}</div>
                  </div>
                  <div className="rounded-xl bg-black/30 p-3">
                    <div className="text-[11px] text-white/45">Links</div>
                    <div className="font-mono text-xl font-black tabular-nums">{links.length}</div>
                  </div>
                  <div className="rounded-xl bg-black/30 p-3">
                    <div className="text-[11px] text-white/45">Status</div>
                    <div className="text-sm font-bold">{page.published !== false ? "Live" : "Draft"}</div>
                  </div>
                </div>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold",
                      page.show_presence !== false ? "bg-emerald-500/15 text-emerald-300" : "bg-white/10 text-white/45",
                    )}
                  >
                    <span className={cn("size-2 rounded-full", page.show_presence !== false ? "bg-emerald-400" : "bg-white/30")} />
                    {page.show_presence !== false ? "Online visibility on" : "Online hidden"}
                  </span>
                  <span className="text-[11px] text-white/40">Synced with Nexus when you&apos;re in the app</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy || !me}
                    onClick={() => void syncFromNexus()}
                    className="rounded-xl bg-[#a855f7] px-3 py-2 text-sm font-bold disabled:opacity-40"
                  >
                    Sync from Nexus profile
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void save({ published: page.published === false })}
                    className="rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/15"
                  >
                    {page.published !== false ? "Unpublish" : "Publish page"}
                  </button>
                  <button type="button" onClick={() => setTab("edit")} className="rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/15">
                    Edit profile
                  </button>
                  <button type="button" onClick={() => setTab("settings")} className="rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/15">
                    Page settings
                  </button>
                </div>
                <p className="mt-3 text-[11px] text-white/40">
                  Sync copies your Nexus display name, avatar, bio, and status into this Link page. Extra Nexus usernames (up to 10) live in Settings → My Account.
                </p>
              </section>
            )}

            {tab === "dashboard" && (
              <section className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
                <div className="mb-3 flex items-center gap-2">
                  <BadgeCheck className="size-4 text-[#c084fc]" />
                  <h2 className="text-sm font-bold tracking-wide text-white/70 uppercase">Verification · eligible website</h2>
                </div>
                <p className="mb-3 text-sm text-white/60">
                  TikTok, Snapchat, and Facebook accept a public website on their verification forms. Your Nexus Link page is eligible — copy it as Website.
                </p>
                {(() => {
                  const checks = linkVerifyReadiness(page);
                  const score = Math.round((checks.filter((c) => c.ok).length / checks.length) * 100);
                  return (
                    <>
                      <div className="mb-3 flex items-center gap-3">
                        <div className="text-2xl font-black tabular-nums" style={{ color: score >= 80 ? "#23a55a" : score >= 50 ? "#f0b232" : "#ed4245" }}>
                          {score}%
                        </div>
                        <div className="text-xs text-white/45">page readiness for verification reviewers</div>
                      </div>
                      <div className="mb-3 grid gap-1 sm:grid-cols-2">
                        {checks.map((c) => (
                          <div key={c.label} className="flex gap-2 text-xs">
                            <span className={c.ok ? "text-emerald-400" : "text-amber-300"}>{c.ok ? "✓" : "!"}</span>
                            <span className="text-white/70">{c.label}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  );
                })()}
                <div className="mb-3 flex flex-wrap gap-2">
                  {SOCIAL_VERIFY_LIST.map((p) => (
                    <a
                      key={p.id}
                      href={p.applyUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-full px-3 py-1.5 text-xs font-bold text-black"
                      style={{ background: p.color, color: p.id === "snapchat" ? "#111" : "#fff" }}
                    >
                      {p.emoji} {p.short}
                    </a>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-xl bg-[#a855f7] px-3 py-2 text-sm font-bold"
                    onClick={() => {
                      void navigator.clipboard?.writeText(publicUrl);
                      toast("Nexus Link copied — paste as Website", "success");
                    }}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <Copy className="size-3.5" /> Copy as Website
                    </span>
                  </button>
                  <button
                    type="button"
                    className="rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/15"
                    onClick={() => {
                      studioGo("checkmark");
                      useApp.setState({ hub: "studio", appsTool: null, mobileTab: "me" });
                    }}
                  >
                    Full verification guides
                  </button>
                </div>
              </section>
            )}

            {tab === "edit" && (
            <section className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-sm font-bold tracking-wide text-white/70 uppercase">Profile</h2>
                <button
                  type="button"
                  disabled={busy || !me}
                  onClick={() => void syncFromNexus()}
                  className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-bold hover:bg-white/15 disabled:opacity-40"
                >
                  Sync Nexus
                </button>
              </div>
              <label className="mb-1 block text-xs font-semibold text-white/50">Username</label>
              <div className="mb-3 flex gap-2">
                <span className="grid place-items-center rounded-xl bg-black/30 px-3 text-white/40">@</span>
                <input
                  defaultValue={page.username}
                  key={`u-${page.username}`}
                  onBlur={(e) => {
                    const v = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 24);
                    if (v && v !== page.username) void save({ username: v });
                  }}
                  className="min-w-0 flex-1 rounded-xl bg-black/30 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-[#a855f7]"
                />
              </div>
              <label className="mb-1 block text-xs font-semibold text-white/50">Display name</label>
              <input
                defaultValue={page.display_name}
                key={`d-${page.display_name}`}
                onBlur={(e) => {
                  const v = e.target.value.trim().slice(0, 48);
                  if (v && v !== page.display_name) void save({ display_name: v });
                }}
                className="mb-3 w-full rounded-xl bg-black/30 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-[#a855f7]"
              />
              <label className="mb-1 block text-xs font-semibold text-white/50">Bio</label>
              <textarea
                defaultValue={page.bio ?? ""}
                key={`b-${page.bio ?? ""}`}
                rows={3}
                maxLength={280}
                onBlur={(e) => {
                  const v = e.target.value.trim().slice(0, 280);
                  if (v !== (page.bio ?? "")) void save({ bio: v });
                }}
                className="w-full resize-none rounded-xl bg-black/30 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-[#a855f7]"
              />
              <label className="mt-3 mb-1 block text-xs font-semibold text-white/50">Avatar URL</label>
              <input
                defaultValue={page.avatar_url ?? ""}
                key={`av-${page.avatar_url ?? ""}`}
                placeholder="https://…"
                onBlur={(e) => {
                  const v = e.target.value.trim().slice(0, 500);
                  if (v !== (page.avatar_url ?? "")) void save({ avatar_url: v });
                }}
                className="mb-3 w-full rounded-xl bg-black/30 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-[#a855f7]"
              />
              <label className="mb-1 block text-xs font-semibold text-white/50">Accent color</label>
              <div className="mb-3 flex items-center gap-2">
                <input
                  type="color"
                  value={page.accent && /^#[0-9A-Fa-f]{6}$/.test(page.accent) ? page.accent : "#a855f7"}
                  onChange={(e) => void save({ accent: e.target.value })}
                  className="size-10 cursor-pointer rounded-lg border-0 bg-transparent"
                />
                <span className="font-mono text-xs text-white/50">{page.accent || "#a855f7"}</span>
              </div>
              <label className="mt-1 mb-1 flex items-center gap-2 text-sm font-semibold">
                <input type="checkbox" checked={page.published !== false} onChange={(e) => void save({ published: e.target.checked })} />
                Published
              </label>
            </section>
            )}

            {tab === "stats" && (
              <section className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="text-sm font-bold tracking-wide text-white/70 uppercase">Analytics</h2>
                  <div className="flex gap-1">
                    {[7, 30, 90].map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setStatsDays(d)}
                        className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-bold", statsDays === d ? "bg-[#a855f7] text-white" : "bg-white/10 text-white/60")}
                      >
                        {d}d
                      </button>
                    ))}
                  </div>
                </div>
                {!stats ? (
                  <div className="text-sm text-white/40">Loading…</div>
                ) : (
                  <>
                    <div className="mb-4 grid grid-cols-3 gap-2 sm:gap-3">
                      <div className="rounded-xl bg-black/30 p-3">
                        <div className="text-[11px] text-white/45">Views ({stats.days}d)</div>
                        <div className="font-mono text-xl font-black tabular-nums sm:text-2xl">{stats.views_period.toLocaleString()}</div>
                      </div>
                      <div className="rounded-xl bg-black/30 p-3">
                        <div className="text-[11px] text-white/45">Clicks ({stats.days}d)</div>
                        <div className="font-mono text-xl font-black tabular-nums sm:text-2xl">{stats.clicks.toLocaleString()}</div>
                      </div>
                      <div className="rounded-xl bg-black/30 p-3">
                        <div className="text-[11px] text-white/45">All-time views</div>
                        <div className="font-mono text-xl font-black tabular-nums sm:text-2xl">{stats.views_all.toLocaleString()}</div>
                      </div>
                    </div>
                    {stats.series.length > 0 && (
                      <div className="mb-4 rounded-xl bg-black/25 p-3">
                        <div className="mb-2 flex items-center justify-between text-[11px] font-bold text-white/50 uppercase">
                          <span>Daily activity</span>
                          <span className="font-medium normal-case tracking-normal text-white/35">Views · Clicks</span>
                        </div>
                        <LinkStatsSparkline series={stats.series} />
                      </div>
                    )}
                    <div className="text-xs font-bold text-white/50 uppercase">Top links ({stats.days}d)</div>
                    <div className="mt-2 space-y-1.5">
                      {stats.top.length === 0 && <div className="text-sm text-white/40">No clicks yet — share your page.</div>}
                      {stats.top.map((t) => (
                        <div key={t.url} className="flex items-center gap-2 rounded-lg bg-black/25 px-2.5 py-1.5 text-sm">
                          <span className="min-w-0 flex-1 truncate text-white/80">{t.url}</span>
                          <span className="font-mono text-xs font-bold text-[#c084fc]">{t.hits}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </section>
            )}

            {tab === "edit" && (
            <section className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
              <h2 className="mb-3 text-sm font-bold tracking-wide text-white/70 uppercase">Links</h2>
              <div className="mb-3 space-y-2">
                {links.map((l, i) => (
                  <div key={`${l.url}-${i}`} className="flex items-center gap-1.5 rounded-xl bg-black/25 px-2 py-2">
                    <Link2 className="size-4 shrink-0 text-white/40" />
                    <div className="min-w-0 flex-1 truncate text-sm">{l.label || l.url}</div>
                    <button
                      type="button"
                      title={l.featured ? "Unfeature" : "Feature as CTA"}
                      className="grid size-8 place-items-center rounded-full hover:bg-white/10"
                      onClick={() => {
                        const next = links.map((x, j) => ({ ...x, featured: j === i ? !l.featured : false }));
                        void save({ links: next });
                      }}
                    >
                      <Star className={cn("size-3.5", l.featured ? "fill-amber-300 text-amber-300" : "text-white/40")} />
                    </button>
                    <button
                      type="button"
                      disabled={i === 0}
                      className="grid size-8 place-items-center rounded-full hover:bg-white/10 disabled:opacity-30"
                      onClick={() => {
                        const next = [...links];
                        [next[i - 1], next[i]] = [next[i], next[i - 1]];
                        void save({ links: next });
                      }}
                      aria-label="Move up"
                    >
                      <ChevronUp className="size-3.5 text-white/50" />
                    </button>
                    <button
                      type="button"
                      disabled={i === links.length - 1}
                      className="grid size-8 place-items-center rounded-full hover:bg-white/10 disabled:opacity-30"
                      onClick={() => {
                        const next = [...links];
                        [next[i + 1], next[i]] = [next[i], next[i + 1]];
                        void save({ links: next });
                      }}
                      aria-label="Move down"
                    >
                      <ChevronDown className="size-3.5 text-white/50" />
                    </button>
                    <button
                      type="button"
                      className="grid size-8 place-items-center rounded-full hover:bg-white/10"
                      onClick={() => void save({ links: links.filter((_, j) => j !== i) })}
                      aria-label="Remove link"
                    >
                      <Trash2 className="size-3.5 text-white/50" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <select value={plat} onChange={(e) => setPlat(e.target.value)} className="rounded-xl bg-black/30 px-3 py-2 text-sm outline-none ring-1 ring-white/10">
                  {PLATFORMS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <input
                  value={linkInput}
                  onChange={(e) => setLinkInput(e.target.value)}
                  placeholder="URL or @handle"
                  className="min-w-0 flex-1 rounded-xl bg-black/30 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-[#a855f7]"
                />
                <button
                  type="button"
                  disabled={busy || links.length >= 20}
                  className="inline-flex items-center justify-center gap-1 rounded-xl bg-[#a855f7] px-3 py-2 text-sm font-bold disabled:opacity-40"
                  onClick={() => {
                    const n = normalizeLink(linkInput, plat);
                    if (!n) return;
                    const row: LinkBioLink = { ...n, label: n.label };
                    void save({ links: [...links, row] });
                    setLinkInput("");
                  }}
                >
                  <Plus className="size-4" /> Add
                </button>
              </div>
            </section>
            )}

            {tab === "edit" && (
            <section className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
              <h2 className="mb-3 text-sm font-bold tracking-wide text-white/70 uppercase">Theme</h2>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {LINKBIO_THEMES.map((t) => {
                  const locked = Boolean(t.premium && !page.premium);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      disabled={locked || busy}
                      onClick={() => void save({ theme: t.id as LinkBioTheme })}
                      className={cn(
                        "rounded-xl px-3 py-2.5 text-left ring-1 transition",
                        page.theme === t.id ? "bg-[#a855f7]/25 ring-[#a855f7]" : "bg-black/25 ring-white/10 hover:bg-white/5",
                        locked && "opacity-40",
                      )}
                    >
                      <div className="text-sm font-bold">{t.name}</div>
                      <div className="text-[11px] text-white/45">{t.tag}{t.premium ? " · ⭐" : ""}</div>
                    </button>
                  );
                })}
              </div>

              <h3 className="mt-4 mb-2 text-xs font-bold tracking-wide text-white/50 uppercase">Animated background</h3>
              <div className="flex flex-wrap gap-2">
                {LINKBIO_BACKGROUNDS.map((b) => {
                  const locked = Boolean(b.premium && !page.premium);
                  return (
                    <button
                      key={b.id}
                      type="button"
                      disabled={locked || busy}
                      onClick={() => void save({ background: b.id as LinkBioBackground })}
                      className={cn(
                        "rounded-full px-3 py-1.5 text-xs font-bold ring-1",
                        page.background === b.id ? "bg-[#a855f7]/30 ring-[#a855f7]" : "bg-black/25 ring-white/10",
                        locked && "opacity-40",
                      )}
                    >
                      {b.name}
                      {b.premium ? " ⭐" : ""}
                    </button>
                  );
                })}
              </div>

              <h3 className="mt-4 mb-2 text-xs font-bold tracking-wide text-white/50 uppercase">Font</h3>
              <div className="flex flex-wrap gap-2">
                {LINKBIO_FONTS.map((f) => {
                  const locked = Boolean(f.premium && !page.premium);
                  return (
                    <button
                      key={f.id}
                      type="button"
                      disabled={locked || busy}
                      onClick={() => void save({ font: f.id as LinkBioFont })}
                      className={cn(
                        "rounded-full px-3 py-1.5 text-xs font-bold ring-1",
                        page.font === f.id ? "bg-[#a855f7]/30 ring-[#a855f7]" : "bg-black/25 ring-white/10",
                        locked && "opacity-40",
                      )}
                    >
                      {f.name}
                      {f.premium ? " ⭐" : ""}
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm font-semibold">
                  <input type="checkbox" checked={page.animated_bg} onChange={(e) => void save({ animated_bg: e.target.checked })} />
                  Animate background
                </label>
                <label className="flex items-center gap-2 text-sm font-semibold">
                  <input type="checkbox" checked={page.glow} onChange={(e) => void save({ glow: e.target.checked })} />
                  Glowing username
                </label>
              </div>
            </section>
            )}

            {tab === "settings" && (
              <section className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-bold tracking-wide text-white/70 uppercase">
                  <Lock className="size-4 text-[#c084fc]" /> Settings
                </h2>

                <div className="mb-4 rounded-xl bg-black/25 p-3 ring-1 ring-white/10">
                  <div className="mb-2 text-xs font-bold text-white/60 uppercase">Password protect page</div>
                  <label className="mb-2 flex items-center gap-2 text-sm font-semibold">
                    <input
                      type="checkbox"
                      checked={Boolean(page.password_enabled)}
                      onChange={(e) => {
                        if (!e.target.checked) void save({ password_enabled: false, page_password: "" });
                        else if (pagePw.length >= 4) void save({ page_password: pagePw });
                      }}
                    />
                    Require password to view links
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={pagePw}
                      onChange={(e) => setPagePw(e.target.value)}
                      placeholder={page.password_enabled ? "Change page password" : "Set page password"}
                      className="min-w-0 flex-1 rounded-xl bg-black/40 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-[#a855f7]"
                    />
                    <button
                      type="button"
                      disabled={busy || pagePw.length < 4}
                      className="rounded-xl bg-[#a855f7] px-3 py-2 text-sm font-bold disabled:opacity-40"
                      onClick={() => {
                        void save({ page_password: pagePw }).then(() => setPagePw(""));
                      }}
                    >
                      Save
                    </button>
                  </div>
                  <p className="mt-2 text-[11px] text-white/40">Visitors unlock once; cookie lasts ~7 days. Min 4 characters.</p>
                </div>

                <label className="mb-1 block text-xs font-semibold text-white/50">Custom status</label>
                <input
                  defaultValue={page.custom_status ?? ""}
                  key={`st-${page.custom_status ?? ""}`}
                  onBlur={(e) => {
                    const v = e.target.value.trim().slice(0, 80);
                    if (v !== (page.custom_status ?? "")) void save({ custom_status: v });
                  }}
                  placeholder="999 forever"
                  className="mb-3 w-full rounded-xl bg-black/30 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-[#a855f7]"
                />

                <label className="mb-1 block text-xs font-semibold text-white/50">Banner image URL</label>
                <input
                  defaultValue={page.banner_url ?? ""}
                  key={`bn-${page.banner_url ?? ""}`}
                  onBlur={(e) => {
                    const v = e.target.value.trim().slice(0, 500);
                    if (v !== (page.banner_url ?? "")) void save({ banner_url: v });
                  }}
                  placeholder="https://…"
                  className="mb-3 w-full rounded-xl bg-black/30 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-[#a855f7]"
                />

                <label className="mb-1 block text-xs font-semibold text-white/50">Spotify / music URL</label>
                <input
                  defaultValue={page.music_url ?? ""}
                  key={`mu-${page.music_url ?? ""}`}
                  onBlur={(e) => {
                    const raw = e.target.value.trim().slice(0, 800);
                    const resolved = resolveMusicEmbed(raw);
                    const store = resolved && resolved.kind !== "audio" ? resolved.src : raw;
                    if (store !== (page.music_url ?? "")) void save({ music_url: store });
                  }}
                  placeholder="Spotify · Apple Music · SoundCloud · or upload"
                  className="mb-2 w-full rounded-xl bg-black/30 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-[#a855f7]"
                />
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-xs font-bold hover:bg-white/15">
                    <input
                      type="file"
                      accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac"
                      className="hidden"
                      disabled={busy}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (!file) return;
                        setBusy(true);
                        const url = await linkbioUploadMusic(file);
                        if (url) await save({ music_url: url });
                        setBusy(false);
                      }}
                    />
                    Upload track
                  </label>
                  {page.music_url && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void save({ music_url: "" })}
                      className="rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold hover:bg-dnd/30 disabled:opacity-40"
                    >
                      Clear music
                    </button>
                  )}
                  <span className="text-[11px] text-white/40">Spotify · Apple · SoundCloud · MP3 up to 20 MB</span>
                </div>
                {(() => {
                  const emb = page.music_url ? resolveMusicEmbed(page.music_url) : null;
                  if (!emb) return null;
                  if (emb.kind === "audio") {
                    return <audio controls src={emb.src} className="mb-3 w-full" preload="metadata" />;
                  }
                  return (
                    <iframe
                      title={`${emb.kind} preview`}
                      src={emb.src}
                      className="mb-3 w-full rounded-xl border-0"
                      style={{ height: emb.height }}
                      allow="encrypted-media; clipboard-write; autoplay; fullscreen; picture-in-picture"
                      loading="lazy"
                    />
                  );
                })()}
                <div className="mb-3">
                  <PinToLinkPanel compact />
                </div>

                <label className="mb-1 block text-xs font-semibold text-white/50">SEO title</label>
                <input
                  defaultValue={page.seo_title ?? ""}
                  key={`seot-${page.seo_title ?? ""}`}
                  onBlur={(e) => {
                    const v = e.target.value.trim().slice(0, 80);
                    if (v !== (page.seo_title ?? "")) void save({ seo_title: v });
                  }}
                  className="mb-3 w-full rounded-xl bg-black/30 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-[#a855f7]"
                />
                <label className="mb-1 block text-xs font-semibold text-white/50">SEO description</label>
                <textarea
                  defaultValue={page.seo_description ?? ""}
                  key={`seod-${page.seo_description ?? ""}`}
                  rows={2}
                  onBlur={(e) => {
                    const v = e.target.value.trim().slice(0, 200);
                    if (v !== (page.seo_description ?? "")) void save({ seo_description: v });
                  }}
                  className="mb-3 w-full resize-none rounded-xl bg-black/30 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-[#a855f7]"
                />

                <div className="mb-2 text-xs font-bold text-white/50 uppercase">Button style</div>
                <div className="mb-3 flex flex-wrap gap-2">
                  {LINKBIO_BUTTONS.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => void save({ button_style: b.id as LinkBioButtonStyle })}
                      className={cn(
                        "rounded-full px-3 py-1.5 text-xs font-bold ring-1",
                        (page.button_style || "pill") === b.id ? "bg-[#a855f7]/30 ring-[#a855f7]" : "bg-black/25 ring-white/10",
                      )}
                    >
                      {b.name}
                    </button>
                  ))}
                </div>

                <div className="mb-2 text-xs font-bold text-white/50 uppercase">Layout</div>
                <div className="mb-3 flex flex-wrap gap-2">
                  {LINKBIO_LAYOUTS.map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => void save({ layout: l.id as LinkBioLayout })}
                      className={cn(
                        "rounded-full px-3 py-1.5 text-xs font-bold ring-1",
                        (page.layout || "classic") === l.id ? "bg-[#a855f7]/30 ring-[#a855f7]" : "bg-black/25 ring-white/10",
                      )}
                    >
                      {l.name}
                    </button>
                  ))}
                </div>

                <div className="flex flex-col gap-2">
                  <label className="flex items-center gap-2 text-sm font-semibold">
                    <input
                      type="checkbox"
                      checked={page.show_presence !== false}
                      onChange={(e) => void save({ show_presence: e.target.checked })}
                    />
                    Show online status (Nexus presence)
                  </label>
                  <p className="-mt-1 mb-1 text-[11px] text-white/40">Visitors see Online / Away / DND when you&apos;re active in Nexus. Respects Privacy → Show when I&apos;m online.</p>
                  <label className="flex items-center gap-2 text-sm font-semibold">
                    <input type="checkbox" checked={Boolean(page.show_views)} onChange={(e) => void save({ show_views: e.target.checked })} />
                    Show view count
                  </label>
                  <label className="flex items-center gap-2 text-sm font-semibold">
                    <input type="checkbox" checked={Boolean(page.nsfw)} onChange={(e) => void save({ nsfw: e.target.checked })} />
                    Mark page 18+ / NSFW
                  </label>
                  <label className={cn("flex items-center gap-2 text-sm font-semibold", !page.premium && "opacity-50")}>
                    <input
                      type="checkbox"
                      disabled={!page.premium}
                      checked={page.show_branding === false}
                      onChange={(e) => void save({ show_branding: !e.target.checked })}
                    />
                    Hide Nexus branding (Premium)
                  </label>
                </div>
              </section>
            )}
          </div>

          {/* Live preview tip */}
          <div className="space-y-4">
            <section
              className="overflow-hidden rounded-3xl p-5 ring-1 ring-white/10"
              style={{
                background:
                  page.theme === "juice999" || page.theme === "purple999"
                    ? "radial-gradient(ellipse at 50% 0%,#3b0a5c 0%,#0a0214 55%,#000 100%)"
                    : "linear-gradient(180deg,#12101c,#07060f)",
              }}
            >
              <div className="text-[11px] font-bold tracking-[0.14em] text-[#c084fc] uppercase">Live preview</div>
              <div
                className={cn(
                  "mt-4 text-center text-3xl font-black tracking-tight",
                  page.glow && "animate-pulse",
                )}
                style={{
                  textShadow: page.glow ? "0 0 12px #a855f7, 0 0 32px #c084fc88" : undefined,
                  fontFamily: page.font === "juice" || page.font === "marker" ? "Permanent Marker, cursive" : page.font === "display" ? "Bebas Neue, sans-serif" : undefined,
                }}
              >
                {page.display_name}
              </div>
              <div className="mt-1 text-center text-sm text-white/50">@{page.username}</div>
              {page.show_presence !== false && (
                <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-bold text-emerald-300">
                  <span className="size-2 rounded-full bg-emerald-400" />
                  Online on Nexus when active
                </div>
              )}
              {page.bio && <p className="mx-auto mt-3 max-w-xs whitespace-pre-wrap text-center text-sm text-white/65">{page.bio}</p>}
              <div className="mt-4 space-y-2">
                {links.slice(0, 5).map((l, i) => (
                  <div
                    key={i}
                    className={cn("rounded-2xl px-4 py-3 text-sm font-semibold", l.featured ? "bg-amber-400/25 ring-1 ring-amber-300/50" : "bg-white/10")}
                  >
                    {l.featured ? "★ " : ""}
                    {l.label || l.url}
                  </div>
                ))}
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <a
                  href={publicUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex flex-1 items-center justify-center gap-2 rounded-full bg-white px-4 py-3 text-sm font-bold text-[#1a0533]"
                >
                  Open /bio/{page.username} <ExternalLink className="size-4" />
                </a>
                <button
                  type="button"
                  className="grid size-11 place-items-center rounded-full bg-white/15 hover:bg-white/25"
                  title="Copy link"
                  onClick={() => {
                    void navigator.clipboard?.writeText(publicUrl);
                    toast("Link copied", "success");
                  }}
                >
                  <Copy className="size-4" />
                </button>
                <button
                  type="button"
                  className="grid size-11 place-items-center rounded-full bg-white/15 hover:bg-white/25"
                  title="Download themed QR"
                  onClick={() => {
                    const accent = page.accent && /^#[0-9A-Fa-f]{6}$/.test(page.accent) ? page.accent : "#a855f7";
                    const canvas = document.createElement("canvas");
                    void QRCode.toCanvas(canvas, publicUrl, {
                      width: 512,
                      margin: 2,
                      color: { dark: accent, light: "#0b0614" },
                      errorCorrectionLevel: "M",
                    })
                      .then(() => {
                        const a = document.createElement("a");
                        a.href = canvas.toDataURL("image/png");
                        a.download = `${sanitizeDownloadName(page.username || "nexus-link", "link-qr")}.png`;
                        a.click();
                        toast("QR downloaded", "success");
                      })
                      .catch(() => toast("Couldn't make QR", "error"));
                  }}
                >
                  <Download className="size-4" />
                  <span className="sr-only">QR</span>
                </button>
              </div>
              <p className="mt-3 text-center text-[11px] text-white/40">{page.view_count} views · theme {page.theme} · bg {page.background}</p>
            </section>

            <section className="rounded-2xl bg-white/5 p-4 text-sm text-white/60 ring-1 ring-white/10">
              <p>
                Dashboard at <code className="text-white/80">/bio/app</code> · public page{" "}
                <code className="text-white/80">/bio/{page.username}</code>. Online status mirrors Nexus presence. Up to 10 extra usernames in Nexus Settings. Juice 999 + hide branding need Premium.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
