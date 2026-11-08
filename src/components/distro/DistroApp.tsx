"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  ArrowRight,
  ArrowUpRight,
  Bell,
  ChartLine,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  CircleDot,
  CreditCard,
  Fingerprint,
  LayoutGrid,
  LifeBuoy,
  LogOut,
  Menu,
  MoreHorizontal,
  PanelLeft,
  Plus,
  Receipt,
  Search,
  Settings,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  Wallet,
  Wrench,
  X,
} from "lucide-react";
import { supabase, isConfigured } from "@/lib/supabase";
import { mfaNeedsChallenge } from "@/lib/mfa";
import { useApp, openModal } from "@/store/app";
import { useStudio, type StudioSection } from "@/store/studio";
import { loadProfiles } from "@/lib/data";
import { listReleases, STATUS_INFO } from "@/lib/dist";
import { activePlan } from "@/lib/premium";
import { myRank } from "@/lib/admin";
import { brandVars, loadBrands, useBrand, useBrandStore } from "@/lib/distBrand";
import { cn } from "@/lib/utils";
import AuthScreen, { ResetPasswordScreen } from "@/components/AuthScreen";
import Toasts from "@/components/ui/Toasts";
import Modals from "@/components/modals/Modals";
import { Releases, Royalties, DistSettings } from "@/components/studio/Distribution";
import { ManageReleases } from "@/components/studio/ReleaseHandoff";
import ShieldStudio from "@/components/studio/ShieldStudio";
import OrdersAdmin from "@/components/studio/OrdersAdmin";
import { DxAnalytics, DxArtists, DxOverview, DxReleases, DxSettings, DxTools, DxEmbed } from "./DxPages";
import type { DistRelease } from "@/lib/types";
import { dxSfx, loadDxSound } from "@/lib/dxSound";
import { NotificationsPanel, ShortcutsHelp, useNotifications, useShortcuts } from "./DxExtras";

export type DxSection =
  | "overview"
  | "releases"
  | "artists"
  | "analytics"
  | "earnings"
  | "tools"
  | "shield"
  | "content-id"
  | "defender"
  | "takedowns"
  | "isrc"
  | "review"
  | "orders"
  | "dist-settings"
  | "settings";

const TITLES: Record<DxSection, string> = {
  overview: "Overview",
  releases: "Releases",
  artists: "Artists",
  analytics: "Analytics",
  earnings: "Earnings",
  tools: "Tools",
  shield: "Shield 360",
  "content-id": "Content ID",
  defender: "Profile Defender",
  takedowns: "Takedowns",
  isrc: "ISRC codes",
  review: "Manage releases",
  orders: "Orders",
  "dist-settings": "Distribution settings",
  settings: "Settings",
};
const ICONS: Record<DxSection, React.ComponentType<{ className?: string }>> = {
  overview: LayoutGrid,
  releases: CircleDot,
  artists: Users,
  analytics: ChartLine,
  earnings: Wallet,
  tools: Wrench,
  shield: Shield,
  "content-id": Fingerprint,
  defender: ShieldCheck,
  takedowns: Receipt,
  isrc: Receipt,
  review: ShieldCheck,
  orders: CreditCard,
  "dist-settings": SlidersHorizontal,
  settings: Settings,
};
/** Studio sections the reused screens navigate to → workspace sections */
const FROM_STUDIO: Partial<Record<StudioSection, DxSection>> = {
  "dist-overview": "overview",
  releases: "releases",
  royalties: "earnings",
  "live-catalog": "analytics",
  tools: "tools",
  shield: "shield",
  "content-id": "content-id",
  defender: "defender",
  takedowns: "takedowns",
  isrc: "isrc",
  review: "review",
  orders: "orders",
  "dist-settings": "dist-settings",
};

export const STORE_CLAIMS = [
  { key: "spotify", label: "Claim Spotify profile", color: "#1DB954", url: "https://artists.spotify.com/claim" },
  { key: "apple", label: "Claim Apple Music profile", color: "#FA243C", url: "https://artists.apple.com" },
  { key: "deezer", label: "Claim Deezer profile", color: "#A238FF", url: "https://www.deezer.com/en/creators" },
  { key: "youtube", label: "Claim YouTube channel", color: "#FF0000", url: "https://support.google.com/youtube/answer/7336634" },
];

function readHash(): DxSection {
  if (typeof window === "undefined") return "overview";
  const h = window.location.hash.replace(/^#\/?/, "").split("/")[0] as DxSection;
  return h in TITLES ? h : "overview";
}

/* ───────────────────────── auth + bootstrap (same Nexus account) ───────────────────────── */
export default function DistroApp() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [recovering, setRecovering] = useState(false);
  const [needsMfa, setNeedsMfa] = useState(false);
  const bootstrapped = useApp((s) => s.bootstrapped);
  const userId = session?.user?.id ?? null;

  useEffect(() => {
    if (!isConfigured) return;
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!session) return setNeedsMfa(false);
    let off = false;
    void mfaNeedsChallenge().then((n) => !off && setNeedsMfa(n));
    return () => {
      off = true;
    };
  }, [session]);
  useEffect(() => {
    if (!userId || needsMfa) return;
    let off = false;
    useApp.setState({ userId, bootstrapped: false });
    void (async () => {
      await Promise.all([loadProfiles([userId]), loadBrands()]);
      if (!off) useApp.setState({ bootstrapped: true });
    })();
    return () => {
      off = true;
    };
  }, [userId, needsMfa]);

  const spinner = (
    <div className="dx grid h-dvh place-items-center" data-dx-theme={useBrandStore.getState().global?.theme ?? undefined}>
      <div className="size-8 animate-spin rounded-full border-2 border-white/80 border-t-transparent" />
    </div>
  );
  if (!isConfigured || session === undefined) return spinner;
  if (recovering && session) return <ResetPasswordScreen onDone={() => setRecovering(false)} />;
  if (!session) return <AuthScreen initialMode="login" />;
  if (needsMfa) return <AuthScreen initialMode="mfa" />;
  if (!bootstrapped) return spinner;
  return <Workspace />;
}

/* ───────────────────────── workspace shell ───────────────────────── */
function Workspace() {
  const brand = useBrand();
  const me = useApp((s) => s.userId)!;
  const profile = useApp((s) => s.profiles[me]);
  const releaseId = useStudio((s) => s.releaseId);
  const studioSection = useStudio((s) => s.section);
  const [section, setSection] = useState<DxSection>(readHash);
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({ releases: true, tools: false });
  const [palette, setPalette] = useState(false);
  const [userMenu, setUserMenu] = useState(false);
  const [releases, setReleases] = useState<DistRelease[]>([]);
  const staff = myRank() >= 3;
  // sound effects: clicks/toggles from the DOM, success/error from toasts
  useEffect(() => {
    loadDxSound();
    return useApp.subscribe((s, prev) => {
      if (s.toasts.length <= prev.toasts.length) return;
      const t = s.toasts[s.toasts.length - 1];
      if (t?.kind === "success") dxSfx.success();
      else if (t?.kind === "error") dxSfx.error();
    });
  }, []);
  const onPress = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>('button, a, [role="button"], input[type="checkbox"], input[type="radio"], select');
    if (!el || (el as HTMLButtonElement).disabled) return;
    if (el.closest(".dx-seg") || el.hasAttribute("aria-pressed") || el.matches('input[type="checkbox"], input[type="radio"], [role="switch"]')) dxSfx.toggle();
    else dxSfx.click();
  };
  const reviewer = myRank() >= 2;
  const plan = activePlan(profile);

  const go = (s: DxSection, rel: string | null = null) => {
    setSection(s);
    useStudio.setState({ releaseId: rel, section: s === "overview" ? "dist-overview" : s === "earnings" ? "royalties" : (s as StudioSection) });
    setDrawer(false);
    setPalette(false);
    try {
      history.replaceState(null, "", `#${s}`);
    } catch {
      /* ignore */
    }
  };
  // reused Studio screens call studioGo()/openRelease() — follow them
  useEffect(() => {
    const s = FROM_STUDIO[studioSection];
    if (s && s !== section) setSection(s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studioSection]);
  useEffect(() => {
    if (releaseId && section !== "releases") setSection("releases");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [releaseId]);
  useEffect(() => {
    const onHash = () => setSection(readHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => {
    void listReleases().then(setReleases);
  }, [section, releaseId]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
      }
      if (e.key === "Escape") setPalette(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const needsYou = releases.filter((r) => ["changes_requested", "rejected", "error"].includes(r.status)).length;
  const notif = useNotifications(releases);
  const [notifOpen, setNotifOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const goRef = useRef(go);
  goRef.current = go;
  const shortcutHandlers = useMemo(() => ({ go: (s: DxSection, rel?: string | null) => goRef.current(s, rel ?? null), search: () => setPalette(true), help: () => setHelp(true) }), []);
  useShortcuts(shortcutHandlers);
  const initials = (profile?.display_name || profile?.username || "N").replace(/[^\p{L}\p{N} ]/gu, "").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "N";
  const Title = ICONS[section];

  const item = (s: DxSection, label = TITLES[s], extra?: React.ReactNode) => {
    const I = ICONS[s];
    const on = section === s;
    return (
      <button
        key={s}
        onClick={() => go(s)}
        title={collapsed ? label : undefined}
        className={cn("flex h-9 w-full items-center gap-3 px-3 text-left text-[14px] transition", on ? "bg-[var(--dx-active)] text-white" : "text-[var(--dx-sub-2)] hover:bg-[var(--dx-raise)]", collapsed && "justify-center px-0")}
      >
        <I className="size-4 shrink-0 text-[var(--dx-sub)]" />
        {!collapsed && <span className="min-w-0 flex-1 truncate">{label}</span>}
        {!collapsed && extra}
      </button>
    );
  };
  const group = (label: string) => (!collapsed ? <div className="mt-4 mb-1 px-3 text-[12px] text-[var(--dx-dim)]">{label}</div> : <div className="mx-3 mt-3 mb-1 border-t border-[var(--dx-line)]" />);

  const sidebar = (
    <aside className={cn("dx-safe-side flex h-full flex-col bg-[var(--dx-bg)]", collapsed ? "w-[64px]" : "w-[232px]")}>
      {/* workspace switcher */}
      <div className="relative px-2 pt-3">
        <button onClick={() => setUserMenu(false)} className={cn("flex w-full items-center gap-2.5 p-2 text-left hover:bg-[var(--dx-raise)]", collapsed && "justify-center")}>
          <span className="grid size-8 shrink-0 place-items-center overflow-hidden bg-[var(--dx-hi)] text-[11px] font-black text-black">
            {brand.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brand.logo_url} alt="" className="size-full object-cover" />
            ) : (
              brand.name.slice(0, 2).toUpperCase()
            )}
          </span>
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-semibold text-white">{brand.name}</span>
                <span className="block truncate text-[12px] text-[var(--dx-muted)]">{plan ? plan.short : "Free plan"}</span>
              </span>
              <ChevronsUpDown className="size-4 text-[var(--dx-muted)]" />
            </>
          )}
        </button>
      </div>
      <div className="px-2 pt-2">
        <button onClick={() => go("releases", "new")} className={cn("flex h-10 w-full items-center gap-3 px-2 text-[15px] font-medium text-white hover:bg-[var(--dx-raise)]", collapsed && "justify-center px-0")}>
          <span className="grid size-6 place-items-center border border-[var(--dx-line-2)] bg-[var(--dx-raise)]">
            <Plus className="size-3.5" />
          </span>
          {!collapsed && "New release"}
        </button>
      </div>
      <nav className="dx-scroll min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {group("Catalog")}
        {item("overview")}
        <div>
          {item(
            "releases",
            "Releases",
            <span
              role="button"
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
                setOpen((o) => ({ ...o, releases: !o.releases }));
              }}
              className="grid size-5 place-items-center text-[var(--dx-muted)]"
            >
              {open.releases ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
            </span>,
          )}
          {open.releases && !collapsed && (
            <div className="py-0.5">
              <SubItem icon={<Plus className="size-3.5" />} label="New release" onClick={() => go("releases", "new")} />
              {needsYou > 0 && <SubItem icon={<span className="size-1.5 bg-[#f0b232]" />} label={`Needs you · ${needsYou}`} onClick={() => go("releases")} />}
            </div>
          )}
        </div>
        {item("artists")}
        {group("Insights")}
        {item("analytics")}
        {item("earnings")}
        {group("Resources")}
        {item(
          "tools",
          "Tools",
          <span
            role="button"
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation();
              setOpen((o) => ({ ...o, tools: !o.tools }));
            }}
            className="grid size-5 place-items-center text-[var(--dx-muted)]"
          >
            {open.tools ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          </span>,
        )}
        {open.tools && !collapsed && (
          <div className="py-0.5">
            <SubItem icon={<Search className="size-3.5" />} label="ISRC + UPC finder" onClick={() => go("tools")} />
            {STORE_CLAIMS.map((c) => (
              <a key={c.key} href={c.url} target="_blank" rel="noreferrer" className="flex h-8 items-center gap-2.5 pr-2 pl-8 text-[13px] text-[var(--dx-sub-2)] hover:bg-[var(--dx-raise)]">
                <span className="grid size-4 place-items-center text-[9px] font-black text-white" style={{ background: c.color }}>
                  ♪
                </span>
                <span className="min-w-0 flex-1 truncate">{c.label}</span>
                <ArrowUpRight className="size-3.5 text-[var(--dx-muted)]" />
              </a>
            ))}
          </div>
        )}
        {item("shield")}
        {item("content-id")}
        {item("defender")}
        {reviewer && group("Admin")}
        {reviewer && item("review", "Manage releases")}
        {staff && item("orders")}
        {staff && item("dist-settings", "Distribution settings")}
      </nav>
      <div className="px-2 pb-2">
        {item("settings")}
        <a href={brand.support_email ? `mailto:${brand.support_email}` : "/contact"} className={cn("flex h-9 items-center gap-3 px-3 text-[14px] text-[var(--dx-sub-2)] hover:bg-[var(--dx-raise)]", collapsed && "justify-center px-0")}>
          <LifeBuoy className="size-4 text-[var(--dx-sub)]" /> {!collapsed && "Support"}
        </a>
        <button onClick={() => setCollapsed((c) => !c)} className={cn("hidden h-9 w-full items-center gap-3 px-3 text-[14px] text-[var(--dx-sub-2)] hover:bg-[var(--dx-raise)] md:flex", collapsed && "justify-center px-0")}>
          <PanelLeft className="size-4 text-[var(--dx-sub)]" /> {!collapsed && "Collapse sidebar"}
        </button>
      </div>
      {!collapsed && (
        <button onClick={() => openModal("premium")} className="mx-2 mb-2 flex items-center gap-3 border-t border-[var(--dx-line)] px-2 pt-3 pb-2 text-left hover:bg-[var(--dx-raise)]">
          <CreditCard className="size-4 text-[var(--dx-sub)]" />
          <span className="min-w-0 flex-1">
            <span className="block text-[12px] text-[var(--dx-muted)]">{plan ? `${plan.short} plan` : "Free"} • {releases.length} release{releases.length === 1 ? "" : "s"}</span>
            <span className="block text-[14px] font-semibold text-white">Explore plans</span>
          </span>
          <ArrowRight className="size-4 text-[var(--dx-muted)]" />
        </button>
      )}
      <div className="relative px-2 pb-3">
        <button onClick={() => setUserMenu((u) => !u)} className={cn("flex w-full items-center gap-2.5 p-1.5 text-left hover:bg-[var(--dx-raise)]", collapsed && "justify-center")}>
          <span className="grid size-8 shrink-0 place-items-center bg-[var(--dx-active)] text-[12px] font-semibold text-white">{initials}</span>
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-semibold text-white">{profile?.display_name ?? profile?.username}</span>
                <span className="block text-[12px] text-[var(--dx-muted)]">{staff ? "Admin account" : "Artist account"}</span>
              </span>
              <MoreHorizontal className="size-4 text-[var(--dx-muted)]" />
            </>
          )}
        </button>
        {userMenu && (
          <div className="absolute bottom-full left-2 z-30 mb-1 w-56 border border-[var(--dx-line-2)] bg-[var(--dx-panel)] p-1 shadow-2xl">
            <a href="/" className="flex h-9 items-center gap-2 px-2 text-[14px] hover:bg-[var(--dx-active)]">
              <ArrowUpRight className="size-4" /> Open Nexus
            </a>
            <button onClick={() => go("settings")} className="flex h-9 w-full items-center gap-2 px-2 text-left text-[14px] hover:bg-[var(--dx-active)]">
              <Settings className="size-4" /> Settings
            </button>
            <button onClick={() => void supabase.auth.signOut()} className="flex h-9 w-full items-center gap-2 px-2 text-left text-[14px] text-[#ff7b7b] hover:bg-[var(--dx-active)]">
              <LogOut className="size-4" /> Sign out
            </button>
          </div>
        )}
      </div>
    </aside>
  );

  return (
    <div className="dx flex h-dvh min-h-0 overflow-hidden" data-dx-theme={brand.theme} style={brandVars(brand.accent)} onPointerDownCapture={onPress}>
      <div className="hidden border-r border-[var(--dx-line)] md:block">{sidebar}</div>
      {drawer && (
        <div className="fixed inset-0 z-50 flex md:hidden" onClick={() => setDrawer(false)}>
          <div className="h-full border-r border-[var(--dx-line)] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {sidebar}
          </div>
          <div className="flex-1 bg-black/60" />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="dx-safe-top flex h-[60px] shrink-0 items-center gap-3 border-b border-[var(--dx-line)] px-3 sm:px-4">
          <button onClick={() => setDrawer(true)} className="grid size-9 place-items-center border border-[var(--dx-line-2)] md:hidden" aria-label="Menu">
            <Menu className="size-4" />
          </button>
          <Title className="size-4 text-[var(--dx-sub)]" />
          <div className="min-w-0 flex-1 truncate text-[15px] font-medium">{TITLES[section]}</div>
          <button onClick={() => setPalette(true)} className="hidden h-9 w-56 items-center gap-2 border border-[var(--dx-line-2)] px-3 text-left text-[14px] text-[var(--dx-muted)] hover:border-[var(--dx-line-3)] sm:flex">
            <Search className="size-4" />
            <span className="flex-1">Search workspace</span>
            <kbd className="border border-[var(--dx-line-2)] px-1 text-[10px] text-[var(--dx-muted)]">⌘K</kbd>
          </button>
          <button onClick={() => setPalette(true)} className="grid size-9 place-items-center border border-[var(--dx-line-2)] sm:hidden" aria-label="Search">
            <Search className="size-4" />
          </button>
          <button onClick={() => setNotifOpen((o) => !o)} className="relative grid size-9 place-items-center border border-[var(--dx-line-2)] hover:bg-[var(--dx-raise)]" aria-label="Notifications">
            <Bell className="size-4" />
            {needsYou + notif.unread > 0 && <span className="absolute -top-1 -right-1 grid min-w-4 place-items-center rounded-[4px] bg-[#f0b232] px-1 text-[10px] font-bold text-black">{needsYou + notif.unread}</span>}
          </button>
          <button onClick={() => go("settings")} className="grid size-9 place-items-center border border-[var(--dx-line-2)] bg-[var(--dx-raise)] text-[12px] font-semibold" aria-label="Account">
            {initials}
          </button>
        </header>
        <main className="dx-scroll min-h-0 flex-1 overflow-y-auto">
          <div className="dx-safe-main mx-auto min-h-full max-w-[1120px] border-[var(--dx-line)] px-4 py-6 sm:px-8 sm:py-9 lg:border-x">
            {section === "overview" && <DxOverview go={go} releases={releases} />}
            {section === "releases" && (releaseId ? <DxEmbed><Releases /></DxEmbed> : <DxReleases releases={releases} onReload={() => void listReleases().then(setReleases)} />)}
            {section === "artists" && <DxArtists releases={releases} />}
            {section === "analytics" && <DxAnalytics releases={releases} />}
            {section === "earnings" && <DxEmbed title="Earnings" sub="Royalties reported by the stores, by month, source and territory."><Royalties /></DxEmbed>}
            {section === "tools" && <DxTools go={go} />}
            {section === "shield" && <DxEmbed><ShieldStudio /></DxEmbed>}
            {section === "content-id" && <LazySection name="content-id" />}
            {section === "defender" && <LazySection name="defender" />}
            {section === "takedowns" && <LazySection name="takedowns" />}
            {section === "isrc" && <LazySection name="isrc" />}
            {section === "review" && reviewer && <DxEmbed><ManageReleases /></DxEmbed>}
            {section === "orders" && staff && <DxEmbed><OrdersAdmin /></DxEmbed>}
            {section === "dist-settings" && staff && <DxEmbed><DistSettings /></DxEmbed>}
            {section === "settings" && <DxSettings />}
            {!brand.hide_nexus && <div className="mt-12 text-center text-[11px] text-[var(--dx-line-3)]">Powered by Nexus</div>}
          </div>
        </main>
      </div>
      {palette && <Palette releases={releases} onGo={go} onClose={() => setPalette(false)} reviewer={reviewer} staff={staff} />}
      <a href={brand.support_email ? `mailto:${brand.support_email}` : "/contact"} className="dx-safe-fab fixed right-4 bottom-4 z-20 grid size-11 place-items-center rounded-[12px] shadow-lg border border-[var(--dx-line-2)] bg-[var(--dx-panel)] hover:bg-[var(--dx-raise)]" aria-label="Help">
        <LifeBuoy className="size-5" />
      </a>
      {notifOpen && (
        <NotificationsPanel
          log={notif.log}
          seen={notif.seen}
          releases={releases}
          onOpen={(id) => {
            setNotifOpen(false);
            notif.markRead();
            go("releases", id);
          }}
          onClose={() => {
            setNotifOpen(false);
            notif.markRead();
          }}
          onMarkRead={notif.markRead}
        />
      )}
      {help && <ShortcutsHelp onClose={() => setHelp(false)} />}
      <Modals />
      <Toasts />
    </div>
  );
}

function SubItem({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex h-8 w-full items-center gap-2.5 pr-2 pl-8 text-left text-[13px] text-[var(--dx-sub-2)] hover:bg-[var(--dx-raise)]">
      <span className="grid size-4 place-items-center text-[var(--dx-sub)]">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  );
}

/** heavier protect screens load on demand */
function LazySection({ name }: { name: "content-id" | "defender" | "takedowns" | "isrc" }) {
  const [C, setC] = useState<React.ComponentType | null>(null);
  useEffect(() => {
    let live = true;
    const load = async (): Promise<React.ComponentType> => {
      if (name === "content-id") return (await import("@/components/protect/ContentId")).default;
      if (name === "defender") return (await import("@/components/protect/Defender")).default;
      if (name === "isrc") return (await import("@/components/music/Tools")).IsrcTool;
      const [tk, sp, sh] = await Promise.all([import("@/components/music/Takedown"), import("@/components/music/SpotifyTakedown"), import("@/components/music/TakedownShield")]);
      const T = tk.default, S = sp.default, Sh = sh.default;
      return function TakedownsPage() {
        return (
          <>
            <Sh />
            <div className="mt-8" />
            <S />
            <div className="mt-6" />
            <T />
          </>
        );
      };
    };
    void load()
      .then((c) => live && setC(() => c as React.ComponentType))
      .catch(() => live && setC(() => () => <p className="text-[var(--dx-muted)]">This tool couldn&apos;t load.</p>));
    return () => {
      live = false;
    };
  }, [name]);
  return C ? (
    <DxEmbed>
      <C />
    </DxEmbed>
  ) : (
    <p className="text-[var(--dx-muted)]">Loading…</p>
  );
}

/* ───────────────────────── ⌘K palette ───────────────────────── */
function Palette({ releases, onGo, onClose, reviewer, staff }: { releases: DistRelease[]; onGo: (s: DxSection, rel?: string | null) => void; onClose: () => void; reviewer: boolean; staff: boolean }) {
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const items = useMemo(() => {
    const secs = (Object.keys(TITLES) as DxSection[])
      .filter((s) => (s !== "review" || reviewer) && ((s !== "orders" && s !== "dist-settings") || staff))
      .map((s) => ({ key: `s-${s}`, label: TITLES[s], hint: "Go to", run: () => onGo(s) }));
    const rels = releases.map((r) => ({ key: `r-${r.id}`, label: r.title, hint: `${r.primary_artist_name} · ${STATUS_INFO[r.status]?.label ?? r.status}`, run: () => onGo("releases", r.id) }));
    const all = [{ key: "new", label: "New release", hint: "Create", run: () => onGo("releases", "new") }, ...secs, ...rels];
    const n = q.trim().toLowerCase();
    return (n ? all.filter((x) => `${x.label} ${x.hint}`.toLowerCase().includes(n)) : all).slice(0, 12);
  }, [q, releases, onGo, reviewer, staff]);
  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/60 p-4 pt-[12vh]" onClick={onClose}>
      <div className="w-full max-w-lg border border-[var(--dx-line-2)] bg-[var(--dx-bg)] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-[var(--dx-line)] px-3">
          <Search className="size-4 text-[var(--dx-muted)]" />
          <input
            ref={ref}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setI(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") setI((x) => Math.min(items.length - 1, x + 1));
              if (e.key === "ArrowUp") setI((x) => Math.max(0, x - 1));
              if (e.key === "Enter") items[i]?.run();
            }}
            placeholder="Search releases, pages…"
            className="h-12 min-w-0 flex-1 bg-transparent text-[15px] outline-none"
          />
          <button onClick={onClose} aria-label="Close">
            <X className="size-4 text-[var(--dx-muted)]" />
          </button>
        </div>
        <div className="max-h-[50vh] overflow-y-auto p-1">
          {items.map((x, k) => (
            <button key={x.key} onMouseEnter={() => setI(k)} onClick={x.run} className={cn("flex h-10 w-full items-center gap-3 px-3 text-left text-[14px]", k === i ? "bg-[var(--dx-active)]" : "")}>
              <span className="min-w-0 flex-1 truncate">{x.label}</span>
              <span className="truncate text-[12px] text-[var(--dx-muted)]">{x.hint}</span>
            </button>
          ))}
          {items.length === 0 && <div className="p-6 text-center text-[14px] text-[var(--dx-muted)]">Nothing found</div>}
        </div>
      </div>
    </div>
  );
}
