"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Clapperboard,
  Barcode,
  BadgeCheck,
  ScrollText,
  Fingerprint,
  UserRoundCheck,
  Vault,
  ShieldAlert,
  ArrowLeft,
  AudioWaveform,
  ChartColumn,
  Crown,
  Copy,
  Disc3,
  ExternalLink,
  Gauge,
  Eye,
  EyeOff,
  LayoutDashboard,
  Link2,
  Lock,
  Menu,
  MessageSquare,
  Music,
  Palette,
  Pencil,
  Plus,
  Radio,
  Settings,
  ShieldCheck,
  Trash2,
  Upload,
  Wallet,
  X,
} from "lucide-react";
import { useApp, toast, openModal } from "@/store/app";
import { studioGo, useStudio, videosGo, type StudioSection } from "@/store/studio";
import { dailyViews, deleteVideo, fmtDuration, fmtViews, myVideos, qualityLabel, removeComment, timeAgo, useUploads, videoLink } from "@/lib/videos";
import { listReleases, STATUS_INFO } from "@/lib/dist";
import { supabase, errorText } from "@/lib/supabase";
import { updateMyProfile, uploadBanner } from "@/lib/data";
import { myRank } from "@/lib/admin";
import { cn } from "@/lib/utils";
import Avatar from "@/components/ui/Avatar";
import NameTag from "@/components/ui/NameTag";
import { Thumb } from "@/components/videos/VideoCard";
import UploadDialog from "./UploadDialog";
import { Releases, ReviewQueue, Royalties, DistSettings } from "./Distribution";
import DistOverview from "./DistOverview";
import LiveCatalog from "./LiveCatalog";
import OrdersAdmin from "./OrdersAdmin";
import { NEED, gate, useCanReview } from "@/lib/premium";
import ShieldStudio from "./ShieldStudio";
import TakedownTool from "@/components/music/Takedown";
import SpotifyTakedown from "@/components/music/SpotifyTakedown";
import ContentId from "@/components/protect/ContentId";
import Licenses, { LicensesCard } from "./Licenses";
import Defender from "@/components/protect/Defender";
import Checkmark from "@/components/protect/Checkmark";
import MyVault from "@/components/protect/Vault";
import ToolView, { IsrcTool, ToolsGrid, type ToolId } from "@/components/music/Tools";
import ProfileClaims from "./ProfileClaims";
import type { DistRelease, Video, VideoComment } from "@/lib/types";

const NAV: { id: StudioSection; label: string; icon: React.ReactNode; group?: string; staff?: boolean; reviewer?: boolean }[] = [
  { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard className="size-5" /> },
  { id: "content", label: "Content", icon: <Upload className="size-5" /> },
  { id: "analytics", label: "Analytics", icon: <ChartColumn className="size-5" /> },
  { id: "comments", label: "Comments", icon: <MessageSquare className="size-5" /> },
  { id: "customization", label: "Customization", icon: <Palette className="size-5" /> },
  { id: "dist-overview", label: "Overview", icon: <Gauge className="size-5" />, group: "Music distribution" },
  { id: "live-catalog", label: "Live catalog", icon: <Radio className="size-5" />, group: "Music distribution" },
  { id: "releases", label: "Releases", icon: <Disc3 className="size-5" />, group: "Music distribution" },
  { id: "royalties", label: "Royalties", icon: <Wallet className="size-5" />, group: "Music distribution" },
  { id: "isrc", label: "ISRC codes", icon: <Barcode className="size-5" />, group: "Music distribution" },
  { id: "claims", label: "Profile claims", icon: <BadgeCheck className="size-5" />, group: "Music distribution" },
  { id: "licenses", label: "Licenses", icon: <ScrollText className="size-5" />, group: "Music distribution" },
  { id: "tools", label: "Music tools", icon: <AudioWaveform className="size-5" />, group: "Music distribution" },
  { id: "shield", label: "Shield 360", icon: <ShieldCheck className="size-5" />, group: "Protection" },
  { id: "content-id", label: "Content ID", icon: <Fingerprint className="size-5" />, group: "Protection" },
  { id: "checkmark", label: "Verification", icon: <BadgeCheck className="size-5" />, group: "Protection" },
  { id: "defender", label: "Profile Defender", icon: <UserRoundCheck className="size-5" />, group: "Protection" },
  { id: "takedowns", label: "Takedowns", icon: <ShieldAlert className="size-5" />, group: "Protection" },
  { id: "vault", label: "My Vault", icon: <Vault className="size-5" />, group: "Protection" },
  { id: "review", label: "Review queue", icon: <ShieldCheck className="size-5" />, group: "Admin", reviewer: true },
  { id: "orders", label: "Orders & requests", icon: <Crown className="size-5" />, group: "Admin", staff: true },
  { id: "dist-settings", label: "Distribution settings", icon: <Settings className="size-5" />, group: "Admin", staff: true },
];

/** Nexus Studio — creator portal for videos + music distribution */
export default function Studio() {
  const section = useStudio((s) => s.section);
  const me = useApp((s) => s.userId)!;
  const [navOpen, setNavOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [pending, setPending] = useState(0);
  const staff = myRank() >= 3;
  const reviewer = useCanReview();

  useEffect(() => {
    if (!reviewer) return;
    const load = () =>
      void supabase
        .from("dist_releases")
        .select("id", { count: "exact", head: true })
        .in("status", ["in_review", "error"])
        .then(({ count }) => setPending(count ?? 0));
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [reviewer]);

  const nav = (
    <nav className="flex h-full flex-col overflow-y-auto py-3">
      <div className="flex flex-col items-center gap-2 px-4 pb-4 text-center">
        <Avatar userId={me} size={88} plain />
        <div>
          <div className="text-sm font-semibold">Your channel</div>
          <NameTag userId={me} className="text-sm text-sub" badges={false} />
        </div>
      </div>
      {NAV.filter((n) => (n.reviewer ? reviewer : !n.staff || staff)).map((n, i, arr) => (
        <div key={n.id}>
          {n.group && n.group !== arr[i - 1]?.group && <div className="mx-4 mt-4 mb-1 border-t border-line pt-3 text-[11px] font-bold tracking-wide text-sub uppercase">{n.group}</div>}
          <button
            onClick={() => {
              studioGo(n.id);
              setNavOpen(false);
            }}
            className={cn(
              "relative flex w-full items-center gap-5 px-6 py-2.5 text-[15px] transition",
              section === n.id ? "bg-active font-semibold text-txt before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-accent" : "text-sub hover:bg-hover hover:text-txt",
            )}
          >
            {n.icon}
            <span className="flex-1 text-left">{n.label}</span>
            {n.id === "review" && pending > 0 && <span className="rounded-full bg-dnd px-1.5 text-[11px] font-bold text-white">{pending}</span>}
          </button>
        </div>
      ))}
      <div className="mt-auto px-3 pt-4">
        <button onClick={() => openModal("premium")} className="mb-1 flex w-full items-center gap-3 rounded-lg bg-gradient-to-r from-[#ffd400]/15 to-[#ff2bd6]/15 px-3 py-2.5 text-sm font-semibold hover:from-[#ffd400]/25 hover:to-[#ff2bd6]/25">
          <Crown className="size-4 text-[#ffd400]" /> Nexus Premium
        </button>
        <button onClick={() => useApp.setState({ hub: null })} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-sub hover:bg-hover hover:text-txt">
          <ArrowLeft className="size-4" /> Back to Nexus
        </button>
      </div>
    </nav>
  );

  return (
    <div className="flex h-full w-full flex-col bg-chat">
      {/* top bar */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-black/25 bg-side px-3 pt-safe md:pt-0">
        <button onClick={() => setNavOpen(true)} className="grid size-10 place-items-center rounded-full hover:bg-hover lg:hidden" aria-label="Menu">
          <Menu className="size-5" />
        </button>
        <button onClick={() => studioGo("dashboard")} className="flex items-center gap-2 font-black tracking-tight">
          <span className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-accent to-[#eb459e] text-white">
            <Music className="size-4" />
          </span>
          <span className="text-lg">Studio</span>
        </button>
        <div className="flex-1" />
        <UploadPill />
        <div className="relative">
          <button onClick={() => setCreateOpen((v) => !v)} className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-semibold hover:bg-hover">
            <Plus className="size-4" /> Create
          </button>
          {createOpen && (
            <div className="absolute top-11 right-0 z-30 w-56 animate-pop rounded-xl bg-menu p-1.5 shadow-2xl" onMouseLeave={() => setCreateOpen(false)}>
              <MenuBtn
                icon={<Upload className="size-4" />}
                label="Upload video"
                onClick={() => {
                  setCreateOpen(false);
                  useStudio.setState({ uploadOpen: true });
                }}
              />
              <MenuBtn
                icon={<Disc3 className="size-4" />}
                label="New music release"
                onClick={() => {
                  setCreateOpen(false);
                  useStudio.setState({ section: "releases", releaseId: "new" });
                }}
              />
            </div>
          )}
        </div>
        <button onClick={() => useApp.setState({ hub: "videos" })} className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-sub hover:bg-hover hover:text-txt sm:block">
          View videos
        </button>
        <button onClick={() => useApp.setState({ hub: null })} className="grid size-10 place-items-center rounded-full hover:bg-hover" aria-label="Close Studio" title="Back to Nexus">
          <X className="size-5" />
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-64 shrink-0 border-r border-black/20 bg-side lg:block">{nav}</aside>
        {navOpen && (
          <div className="fixed inset-0 z-[65] lg:hidden" onClick={() => setNavOpen(false)}>
            <div className="absolute inset-0 animate-fade bg-black/50" />
            <aside className="absolute inset-y-0 left-0 w-72 animate-push bg-side pt-safe shadow-2xl" onClick={(e) => e.stopPropagation()}>
              {nav}
            </aside>
          </div>
        )}
        <main className="min-w-0 flex-1 overflow-y-auto pb-safe-2">
          <div className="mx-auto max-w-6xl px-3 py-5 sm:px-6">
            {section === "dashboard" && <Dashboard />}
            {section === "content" && <Content />}
            {section === "analytics" && <Analytics />}
            {section === "comments" && <CommentsSection />}
            {section === "customization" && <Customization />}
            {section === "dist-overview" && <DistOverview />}
            {section === "live-catalog" && <LiveCatalog />}
            {section === "releases" && <Releases />}
            {section === "royalties" && <Royalties />}
            {section === "tools" && <StudioTools />}
            {section === "shield" && <ShieldStudio />}
            {section === "isrc" && (
              <>
                <H>ISRC codes</H>
                <IsrcTool />
              </>
            )}
            {section === "claims" && (
              <>
                <H>Profile claims</H>
                <ProfileClaims />
              </>
            )}
            {section === "licenses" && (
              <>
                <H>Licenses</H>
                <Licenses />
              </>
            )}
            {section === "content-id" && <ContentId />}
            {section === "defender" && <Defender />}
            {section === "checkmark" && <Checkmark />}
            {section === "vault" && <MyVault />}
            {section === "takedowns" && (
              <>
                <H>Takedown notices</H>
                <p className="-mt-3 mb-4 text-sm text-sub">
                  Someone uploaded your music to Spotify, Apple Music, Deezer, YouTube Claim / Content ID, SoundCloud, TIDAL, Amazon Music, TikTok or Snapchat? Fill this in and send an official copyright notice in one go.
                </p>
                <div className="mb-6">
                  <SpotifyTakedown />
                </div>
                <TakedownTool />
              </>
            )}
            {section === "review" && reviewer && <ReviewQueue />}
            {section === "orders" && staff && <OrdersAdmin />}
            {section === "dist-settings" && staff && <DistSettings />}
          </div>
        </main>
      </div>
      <UploadDialog />
    </div>
  );
}

function MenuBtn({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-hover">
      {icon}
      {label}
    </button>
  );
}

function UploadPill() {
  const all = useUploads((s) => s.items);
  const items = useMemo(() => Object.values(all).filter((i) => i.status === "uploading"), [all]);
  if (!items.length) return null;
  const sent = items.reduce((a, i) => a + i.sent, 0);
  const total = items.reduce((a, i) => a + i.bytes, 0);
  const pct = Math.round((sent / Math.max(total, 1)) * 100);
  return (
    <span className="hidden items-center gap-2 rounded-full bg-accent/15 px-3 py-1.5 text-xs font-semibold text-accent sm:flex">
      <Upload className="size-3.5" /> {items.length} uploading · {pct}%
    </span>
  );
}

export function H({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-3">
      <h1 className="flex-1 text-2xl font-bold">{children}</h1>
      {right}
    </div>
  );
}
export function Card({ children, className, title, right }: { children: React.ReactNode; className?: string; title?: string; right?: React.ReactNode }) {
  return (
    <section className={cn("rounded-2xl border border-line/70 bg-side p-4", className)}>
      {(title || right) && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {title && <h2 className="min-w-0 flex-1 font-bold">{title}</h2>}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

// ------------------------------------------------------------------ dashboard
function Dashboard() {
  const me = useApp((s) => s.userId)!;
  const [videos, setVideos] = useState<Video[] | null>(null);
  const [days, setDays] = useState<{ day: string; views: number; watch_seconds: number }[]>([]);
  const [subs, setSubs] = useState(0);
  const [releases, setReleases] = useState<DistRelease[]>([]);
  useEffect(() => {
    void myVideos().then(setVideos);
    void dailyViews(28).then(setDays);
    void supabase
      .from("channel_subs")
      .select("channel_id", { count: "exact", head: true })
      .eq("channel_id", me)
      .then(({ count }) => setSubs(count ?? 0));
    void listReleases().then(setReleases);
  }, [me]);
  const latest = videos?.find((v) => v.status === "ready");
  const views28 = days.reduce((a, d) => a + Number(d.views), 0);
  const hours28 = days.reduce((a, d) => a + Number(d.watch_seconds), 0) / 3600;

  return (
    <>
      <H>Channel dashboard</H>
      <div className="mb-5">
        <LicensesCard />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {videos && videos.length === 0 ? (
          <Card className="flex flex-col items-center justify-center gap-3 py-10 text-center">
            <div className="grid size-28 place-items-center rounded-full bg-black/25 text-5xl">🎬</div>
            <p className="text-sm text-sub">Want to see metrics on your recent video? Upload and publish a video to get started.</p>
            <button onClick={() => useStudio.setState({ uploadOpen: true })} className="rounded-full bg-accent px-5 py-2 font-semibold text-white">
              Upload videos
            </button>
          </Card>
        ) : (
          <Card title="Latest video performance">
            {latest ? (
              <>
                <Thumb v={latest} />
                <div className="mt-2 line-clamp-2 font-semibold">{latest.title}</div>
                <div className="mt-3 space-y-1.5 text-sm">
                  <Row k="Views" v={latest.views.toLocaleString()} />
                  <Row k="Likes" v={latest.likes.toLocaleString()} />
                  <Row k="Comments" v={latest.comment_count.toLocaleString()} />
                  <Row k="Quality" v={qualityLabel(latest.height, latest.width) || "—"} />
                </div>
                <button onClick={() => {
                    videosGo({ view: "watch", key: latest.slug ?? latest.id });
                    useApp.setState({ hub: "videos" });
                  }} className="mt-3 text-sm font-semibold text-accent">
                  Go to video
                </button>
              </>
            ) : (
              <p className="text-sm text-sub">{videos ? "Your upload is still processing." : "Loading…"}</p>
            )}
          </Card>
        )}
        <Card title="Channel analytics">
          <div className="text-sm text-sub">Current subscribers</div>
          <div className="text-3xl font-bold">{subs.toLocaleString()}</div>
          <div className="my-3 h-px bg-line" />
          <div className="text-xs font-semibold text-sub">Summary · last 28 days</div>
          <div className="mt-2 space-y-1.5 text-sm">
            <Row k="Views" v={views28.toLocaleString()} />
            <Row k="Watch time (hours)" v={hours28.toFixed(1)} />
            <Row k="Videos" v={String(videos?.length ?? "…")} />
          </div>
          <MiniChart data={days.map((d) => Number(d.views))} className="mt-3 h-16" />
          <button onClick={() => studioGo("analytics")} className="mt-3 text-sm font-semibold text-accent">
            Go to channel analytics
          </button>
        </Card>
        <Card title="Music distribution">
          {releases.length === 0 ? (
            <div className="text-sm text-sub">
              Release your music to Spotify, Apple Music, TikTok, Snapchat, YouTube Music and 150+ stores.
              <button onClick={() => useStudio.setState({ section: "releases", releaseId: "new" })} className="mt-3 block rounded-full bg-accent px-4 py-2 font-semibold text-white">
                New release
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {releases.slice(0, 5).map((r) => (
                <button key={r.id} onClick={() => useStudio.setState({ section: "releases", releaseId: r.id })} className="flex w-full items-center gap-2 rounded-lg p-1.5 text-left hover:bg-hover">
                  <Disc3 className="size-4 shrink-0 text-sub" />
                  <span className="min-w-0 flex-1 truncate text-sm">{r.title}</span>
                  <StatusPill status={r.status} />
                </button>
              ))}
              <div className="flex gap-4">
                <button onClick={() => studioGo("dist-overview")} className="text-sm font-semibold text-accent">
                  Distribution overview
                </button>
                <button onClick={() => studioGo("releases")} className="text-sm font-semibold text-accent">
                  All releases
                </button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

export function StatusPill({ status }: { status: DistRelease["status"] }) {
  const s = STATUS_INFO[status];
  return (
    <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: `${s.color}22`, color: s.color }} title={s.hint}>
      {s.label}
    </span>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-sub">{k}</span>
      <span className="font-semibold tabular-nums">{v}</span>
    </div>
  );
}

function MiniChart({ data, className }: { data: number[]; className?: string }) {
  if (data.length < 2) return null;
  const max = Math.max(1, ...data);
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * 100},${100 - (v / max) * 92}`).join(" ");
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className={cn("w-full", className)} aria-hidden>
      <polygon points={`0,100 ${pts} 100,100`} fill="currentColor" className="text-accent/15" />
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" className="text-accent" />
    </svg>
  );
}

// ------------------------------------------------------------------ content
function Content() {
  const [videos, setVideos] = useState<Video[] | null>(null);
  const [filter, setFilter] = useState("");
  const uploads = useUploads((s) => s.items);
  const load = useCallback(() => void myVideos().then(setVideos), []);
  useEffect(load, [load]);
  useEffect(() => {
    window.addEventListener("nexus:video-ready", load);
    return () => window.removeEventListener("nexus:video-ready", load);
  }, [load]);
  // refresh when an upload starts
  const n = Object.keys(uploads).length;
  useEffect(() => {
    if (n) load();
  }, [n, load]);

  const list = (videos ?? []).filter((v) => !filter || v.title.toLowerCase().includes(filter.toLowerCase()));

  return (
    <>
      <H
        right={
          <button onClick={() => useStudio.setState({ uploadOpen: true })} className="flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white">
            <Upload className="size-4" /> Upload
          </button>
        }
      >
        Channel content
      </H>
      <div className="mb-3 flex gap-4 border-b border-line text-sm font-semibold">
        <span className="border-b-2 border-txt pb-2">Videos</span>
        <button onClick={() => studioGo("releases")} className="pb-2 text-sub hover:text-txt">
          Music releases
        </button>
      </div>
      <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter" className="mb-3 w-full rounded-lg border border-line bg-transparent px-3 py-2 text-sm outline-none focus:border-accent sm:w-72" />
      {videos === null ? (
        <p className="text-sub">Loading…</p>
      ) : list.length === 0 ? (
        <Card className="py-12 text-center text-sub">No videos yet — upload your first one.</Card>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line/70">
          <div className="hidden grid-cols-[minmax(0,3fr)_110px_120px_90px_90px_90px] gap-3 border-b border-line bg-side px-4 py-2.5 text-xs font-semibold text-sub md:grid">
            <span>Video</span>
            <span>Visibility</span>
            <span>Date</span>
            <span className="text-right">Views</span>
            <span className="text-right">Comments</span>
            <span className="text-right">Likes</span>
          </div>
          {list.map((v) => (
            <ContentRow key={v.id} v={v} onChange={load} />
          ))}
        </div>
      )}
    </>
  );
}

function ContentRow({ v, onChange }: { v: Video; onChange: () => void }) {
  const up = useUploads((s) => s.items[v.id]);
  const vis = v.visibility === "public" ? { icon: <Eye className="size-4 text-ok" />, label: "Public" } : v.visibility === "unlisted" ? { icon: <Link2 className="size-4" />, label: "Unlisted" } : { icon: <Lock className="size-4" />, label: "Private" };
  const scheduled = v.publish_at && new Date(v.publish_at) > new Date();
  const ratio = v.likes + v.dislikes ? Math.round((v.likes / (v.likes + v.dislikes)) * 100) : null;
  return (
    <div className="group grid grid-cols-[120px_minmax(0,1fr)] gap-3 border-b border-line/50 px-3 py-3 last:border-0 hover:bg-white/[.03] md:grid-cols-[minmax(0,3fr)_110px_120px_90px_90px_90px] md:items-center md:px-4">
      <div className="contents md:flex md:min-w-0 md:gap-3">
        <button onClick={() => useStudio.setState({ editVideoId: v.id })} className="relative w-[120px] shrink-0">
          <Thumb v={v} rounded="rounded-md" />
          {up?.status === "uploading" && (
            <span className="absolute inset-x-1 bottom-1 h-1 overflow-hidden rounded-full bg-black/60">
              <span className="block h-full bg-accent" style={{ width: `${Math.round((up.sent / Math.max(up.bytes, 1)) * 100)}%` }} />
            </span>
          )}
        </button>
        <div className="min-w-0">
          <div className="line-clamp-2 text-sm font-semibold">{v.title}</div>
          {v.mv_status && <div className="mt-0.5 text-[11px] font-semibold text-[#ff2bd6]">🎬 Music video · {v.mv_status}</div>}
          <div className="mt-0.5 line-clamp-1 text-xs text-sub group-hover:hidden">{v.status === "uploading" ? "Uploading…" : v.status === "failed" ? "Upload failed" : v.description || "Add description"}</div>
          <div className="mt-0.5 hidden items-center gap-0.5 group-hover:flex">
            <IconBtn title="Details" onClick={() => useStudio.setState({ editVideoId: v.id })}>
              <Pencil className="size-4" />
            </IconBtn>
            <IconBtn
              title="Copy link"
              onClick={() => {
                void navigator.clipboard?.writeText(videoLink(v));
                toast("Link copied", "success");
              }}
            >
              <Copy className="size-4" />
            </IconBtn>
            <IconBtn
              title="Watch"
              onClick={() => {
                videosGo({ view: "watch", key: v.slug ?? v.id });
                useApp.setState({ hub: "videos" });
              }}
            >
              <ExternalLink className="size-4" />
            </IconBtn>
            <IconBtn
              title={v.mv_status ? `Official music video: ${v.mv_status}` : "Distribute as official music video"}
              onClick={async () => {
                if (v.mv_status && v.mv_status !== "rejected") return toast(`Music video request: ${v.mv_status}${v.mv_note ? ` — ${v.mv_note}` : ""}`, "info");
                if (!gate(NEED.musicVideo, "Official music video distribution")) return;
                if (!confirm(`Send "${v.title}" to the label for official music video distribution (YouTube & video stores)?`)) return;
                const { error } = await supabase.rpc("request_mv_distribution", { p_video: v.id });
                if (error) return toast(errorText(error), "error");
                toast("Requested — the label will review it", "success");
                onChange();
              }}
            >
              <Clapperboard className="size-4" />
            </IconBtn>
            <IconBtn
              title="Delete forever"
              onClick={async () => {
                if (confirm(`Delete "${v.title}" forever?`) && (await deleteVideo(v))) onChange();
              }}
            >
              <Trash2 className="size-4" />
            </IconBtn>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-sub md:hidden">
            <span className="flex items-center gap-1">
              {vis.icon} {vis.label}
            </span>
            <span>{fmtViews(v.views)} views</span>
            <span>{fmtDuration(v.duration)}</span>
          </div>
        </div>
      </div>
      <span className="hidden items-center gap-1.5 text-sm md:flex">
        {vis.icon} {vis.label}
      </span>
      <span className="hidden text-xs text-sub md:block">
        {scheduled ? (
          <>
            Scheduled
            <br />
            {new Date(v.publish_at!).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
          </>
        ) : (
          <>
            {new Date(v.published_at ?? v.created_at).toLocaleDateString([], { dateStyle: "medium" })}
            <br />
            {v.published_at ? "Published" : "Uploaded"}
          </>
        )}
      </span>
      <span className="hidden text-right text-sm tabular-nums md:block">{v.views.toLocaleString()}</span>
      <span className="hidden text-right text-sm tabular-nums md:block">{v.comment_count.toLocaleString()}</span>
      <span className="hidden text-right text-sm tabular-nums md:block">
        {ratio === null ? "—" : `${ratio}%`}
        <span className="block text-xs text-sub">{v.likes} likes</span>
      </span>
    </div>
  );
}

function IconBtn({ children, title, onClick }: { children: React.ReactNode; title: string; onClick: () => void }) {
  return (
    <button onClick={onClick} title={title} aria-label={title} className="grid size-8 place-items-center rounded-full text-sub hover:bg-hover hover:text-txt">
      {children}
    </button>
  );
}

// ------------------------------------------------------------------ analytics
function Analytics() {
  const [range, setRange] = useState(28);
  const [days, setDays] = useState<{ day: string; views: number; watch_seconds: number }[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [metric, setMetric] = useState<"views" | "watch">("views");
  useEffect(() => {
    void dailyViews(range).then(setDays);
  }, [range]);
  useEffect(() => {
    void myVideos().then(setVideos);
  }, []);
  const views = days.reduce((a, d) => a + Number(d.views), 0);
  const hours = days.reduce((a, d) => a + Number(d.watch_seconds), 0) / 3600;
  const data = days.map((d) => (metric === "views" ? Number(d.views) : Number(d.watch_seconds) / 3600));
  const max = Math.max(1, ...data);
  const top = [...videos].sort((a, b) => b.views - a.views).slice(0, 10);

  return (
    <>
      <H
        right={
          <select value={range} onChange={(e) => setRange(Number(e.target.value))} className="rounded-lg border border-line bg-side px-3 py-2 text-sm outline-none">
            {[7, 28, 90, 365].map((d) => (
              <option key={d} value={d}>
                Last {d} days
              </option>
            ))}
          </select>
        }
      >
        Channel analytics
      </H>
      <Card>
        <div className="mb-4 grid grid-cols-2 overflow-hidden rounded-xl border border-line text-left sm:max-w-md">
          {(
            [
              ["views", "Views", views.toLocaleString()],
              ["watch", "Watch time (hours)", hours.toFixed(1)],
            ] as const
          ).map(([id, label, val]) => (
            <button key={id} onClick={() => setMetric(id)} className={cn("p-3", metric === id ? "bg-active" : "hover:bg-hover")}>
              <div className="text-xs text-sub">{label}</div>
              <div className="text-2xl font-bold tabular-nums">{val}</div>
            </button>
          ))}
        </div>
        {/* bar chart */}
        <div className="flex h-56 items-end gap-[2px]" role="img" aria-label={`${metric} per day`}>
          {data.map((v, i) => (
            <div key={i} className="group relative flex h-full flex-1 items-end">
              <div className="w-full rounded-t bg-accent/80 transition group-hover:bg-accent" style={{ height: `${Math.max(1, (v / max) * 100)}%` }} />
              <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 rounded bg-menu px-2 py-1 text-[11px] whitespace-nowrap shadow-xl group-hover:block">
                {new Date(days[i].day).toLocaleDateString([], { month: "short", day: "numeric" })}: {metric === "views" ? v : v.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[11px] text-sub">
          <span>{days[0] && new Date(days[0].day).toLocaleDateString([], { month: "short", day: "numeric" })}</span>
          <span>Today</span>
        </div>
      </Card>
      <Card title="Top content" className="mt-4">
        {top.length === 0 ? (
          <p className="text-sm text-sub">No videos yet.</p>
        ) : (
          <div className="space-y-2">
            {top.map((v, i) => (
              <div key={v.id} className="flex items-center gap-3">
                <span className="w-5 text-right text-sm text-sub">{i + 1}</span>
                <Thumb v={v} className="w-24 shrink-0" rounded="rounded-md" />
                <span className="min-w-0 flex-1 truncate text-sm">{v.title}</span>
                <span className="text-sm font-semibold tabular-nums">{v.views.toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

// ------------------------------------------------------------------ comments
function CommentsSection() {
  const me = useApp((s) => s.userId)!;
  const [rows, setRows] = useState<(VideoComment & { video?: Video })[] | null>(null);
  const load = useCallback(async () => {
    const vids = await myVideos();
    if (!vids.length) return setRows([]);
    const { data } = await supabase.from("video_comments").select("*").in("video_id", vids.map((v) => v.id)).is("deleted_at", null).order("created_at", { ascending: false }).limit(200);
    const byId = Object.fromEntries(vids.map((v) => [v.id, v]));
    setRows(((data ?? []) as VideoComment[]).map((c) => ({ ...c, video: byId[c.video_id] })));
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <>
      <H>Channel comments</H>
      {rows === null ? (
        <p className="text-sub">Loading…</p>
      ) : rows.length === 0 ? (
        <Card className="py-12 text-center text-sub">No comments yet.</Card>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line/70">
          {rows.map((c) => (
            <div key={c.id} className="flex gap-3 border-b border-line/50 p-3 last:border-0">
              <Avatar userId={c.author_id} size={36} plain />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-xs">
                  <NameTag userId={c.author_id} className="font-semibold" maxBadges={2} /> <span className="text-sub">· {timeAgo(c.created_at)}</span>
                </div>
                <div className="mt-0.5 text-sm break-words whitespace-pre-wrap">{c.content}</div>
                <div className="mt-1 flex items-center gap-3 text-xs">
                  <button
                    onClick={() => {
                      if (!c.video) return;
                      videosGo({ view: "watch", key: c.video.slug ?? c.video.id });
                      useApp.setState({ hub: "videos" });
                    }}
                    className="font-semibold text-accent"
                  >
                    Reply on video
                  </button>
                  {(c.author_id === me || c.video?.owner_id === me) && (
                    <button onClick={async () => (await removeComment(c.id)) && void load()} className="text-sub hover:text-dnd">
                      Delete
                    </button>
                  )}
                </div>
              </div>
              {c.video && <Thumb v={c.video} className="hidden w-28 shrink-0 sm:block" rounded="rounded-md" />}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ------------------------------------------------------------------ customization
function Customization() {
  const me = useApp((s) => (s.userId ? s.profiles[s.userId] : undefined));
  const [name, setName] = useState(me?.display_name ?? "");
  const [desc, setDesc] = useState(me?.channel_description ?? "");
  const [busy, setBusy] = useState(false);
  const dirty = useMemo(() => !!me && (name !== me.display_name || desc !== (me.channel_description ?? "")), [me, name, desc]);
  if (!me) return null;
  return (
    <>
      <H
        right={
          <div className="flex gap-2">
            <button
              onClick={() => {
                videosGo({ view: "channel", userId: me.id });
                useApp.setState({ hub: "videos" });
              }}
              className="rounded-full px-4 py-2 text-sm font-semibold text-accent hover:bg-accent/10"
            >
              View channel
            </button>
            <button disabled={!dirty} onClick={() => void updateMyProfile({ display_name: name.trim() || me.display_name, channel_description: desc.trim() || null })} className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
              Publish
            </button>
          </div>
        }
      >
        Channel customization
      </H>
      <div className="space-y-4">
        <Card title="Banner image">
          <div className="aspect-[6/1] rounded-xl bg-black/30 bg-cover bg-center" style={me.banner_url ? { backgroundImage: `url("${me.banner_url}")` } : undefined} />
          <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-full bg-black/30 px-4 py-2 text-sm font-semibold hover:bg-black/40">
            <Upload className="size-4" /> {busy ? "Uploading…" : "Change banner"}
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                setBusy(true);
                await uploadBanner(f);
                setBusy(false);
              }}
            />
          </label>
          <p className="mt-2 text-xs text-sub">Use at least 2048×1152 px; the center 1546×423 shows on every screen.</p>
        </Card>
        <Card title="Basic info">
          <label className="block">
            <div className="mb-1 text-sm text-sub">Name</div>
            <input value={name} maxLength={32} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg border border-line bg-transparent px-3 py-2.5 outline-none focus:border-accent" />
          </label>
          <div className="mt-3 text-sm text-sub">
            Handle: <b className="text-txt">@{me.username}</b>
          </div>
          <label className="mt-3 block">
            <div className="mb-1 text-sm text-sub">Description</div>
            <textarea value={desc} maxLength={1000} rows={5} onChange={(e) => setDesc(e.target.value)} placeholder="Tell viewers about your channel" className="w-full resize-y rounded-lg border border-line bg-transparent px-3 py-2.5 outline-none focus:border-accent" />
          </label>
          <p className="mt-2 text-xs text-sub">Channel links come from your profile links (Settings → My Account → Links).</p>
        </Card>
        <Card title="Visibility">
          <p className="flex items-center gap-2 text-sm text-sub">
            <EyeOff className="size-4" /> Private and unlisted videos never appear on your channel page.
          </p>
        </Card>
      </div>
    </>
  );
}

function StudioTools() {
  const [tool, setTool] = useState<ToolId>("analyzer");
  return (
    <>
      <H>Music tools</H>
      <ToolsGrid onPick={setTool} active={tool} />
      <div className="-mx-3 mt-2 sm:-mx-5">
        <ToolView key={tool} tool={tool} />
      </div>
    </>
  );
}
