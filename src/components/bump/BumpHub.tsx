"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Bell,
  BellOff,
  Copy,
  Download,
  ExternalLink,
  Hand,
  Link2,
  MapPin,
  MessageCircle,
  Navigation,
  Radio,
  Share2,
  Timer,
  UserPlus,
  UserMinus,
  Users,
  X,
} from "lucide-react";
import { useApp, toast } from "@/store/app";
import { useAppearance } from "@/store/appearance";
import BumpMusicPanel from "@/components/bump/BumpMusicPanel";
import BumpMiniPlayer from "@/components/bump/BumpMiniPlayer";
import {
  bumpAttachAppleMaps,
  bumpClear,
  bumpCreateInvite,
  bumpFollowList,
  bumpGetProfile,
  bumpHeartbeat,
  bumpInbox,
  bumpInviteLink,
  bumpIpaReleasesUrl,
  bumpJoinGroup,
  bumpListFamily,
  bumpMyPresence,
  bumpNearby,
  bumpPublish,
  bumpRedeemInvite,
  bumpRemoveFamily,
  bumpSaveProfile,
  bumpSendMessage,
  bumpSetFollow,
  bumpShareLocationWithFriend,
  bumpSpotifyTrackEmbed,
  bumpSpotifyTrackOk,
  bumpThread,
  bumpWave,
  subscribeBumpLive,
  type BumpInboxRow,
  type BumpMessage,
  type BumpNearby,
  type BumpProfile,
  type BumpVisible,
} from "@/lib/bump";
import { startBumpBackground, stopBumpBackground, updateBumpBackgroundOptions, WUMP_REFRESH_MS } from "@/lib/bumpBackground";
import { appleMapsLink } from "@/lib/appleMaps";
import { formatMeters } from "@/lib/location";
import { fmtClock } from "@/lib/prefs";
import { haptic } from "@/lib/haptics";
import { isBumpApp, isNativeApp } from "@/lib/useMobile";
import { cn } from "@/lib/utils";
import { updateMyProfile, uploadAvatar } from "@/lib/data";
import { changeUsername } from "@/lib/gram";
import { connectSpotify, startSpotifySync, useSpotifyUser } from "@/lib/spotifyUser";
import { NowPlayingCard, liveNow } from "@/components/profile/NowPlaying";
import Avatar from "@/components/ui/Avatar";
import NameTag from "@/components/ui/NameTag";
import WumpMap from "./WumpMap";
import WumpSettings from "./WumpSettings";
import WumpPlusPanel, { PlusBadge } from "./WumpPlusPanel";
import { effectiveLook, useWumpLook, wumpTheme } from "@/lib/wumpLook";
import { useWumpPlus } from "@/lib/wumpPlus";
import { WumpLockedProfile, WumpProfileViews, WumpSongSearch, WumpTrackPlayer } from "./WumpProfileBits";
import WumpGroups from "./WumpGroups";
import { WUMP, WUMP_TAGLINE } from "@/lib/wumpBrand";
import { pauseBumpMusic, playBumpTrack, useBumpMusic } from "@/lib/bumpMusic";
import { fetchWumpPrivacy, loadWumpPrivacyLocal } from "@/lib/wumpPrivacy";
import {
  WUMP_EXPLORE_EMPTY,
  wumpDeleteSavedPlace,
  wumpExploreMark,
  wumpExploreStats,
  wumpListSavedPlaces,
  wumpProfileUrl,
  wumpSavePlace,
  wumpUsernameHandle,
  type WumpExploreStats,
  type WumpSavedPlace,
} from "@/lib/wumpPlaces";
import WumpExplorePanel from "./WumpExplorePanel";
import WumpSavedPlacesPanel from "./WumpSavedPlacesPanel";
import WumpFriendsPanel from "./WumpFriendsPanel";

type Tab = "nearby" | "friends" | "music" | "profile" | "social" | "messages" | "settings" | "groups" | "plus";

export default function BumpHub({
  mobile,
  onBack,
  standalone,
  initialTab,
  hideChromeTabs,
  onTabChange,
}: {
  mobile?: boolean;
  onBack?: () => void;
  /** Standalone Wump IPA shell — hide back-to-Nexus chrome */
  standalone?: boolean;
  /** Seed / control tab from parent shell nav */
  initialTab?: Tab;
  /** Hide top pill tabs (parent provides bottom nav) */
  hideChromeTabs?: boolean;
  /** Notify parent shell when tab changes (standalone bottom nav sync) */
  onTabChange?: (tab: Tab) => void;
}) {
  const me = useApp((s) => s.userId);
  const friendships = useApp((s) => s.friendships);
  const profiles = useApp((s) => s.profiles);
  const [tab, setTabState] = useState<Tab>(initialTab || "nearby");
  const setTab = useCallback(
    (t: Tab) => {
      setTabState(t);
      onTabChange?.(t);
    },
    [onTabChange],
  );

  useEffect(() => {
    if (initialTab) setTabState(initialTab);
  }, [initialTab]);
  const [visible, setVisible] = useState<BumpVisible>("friends");
  const [live, setLive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [nearby, setNearby] = useState<BumpNearby[]>([]);
  const [focusFriend, setFocusFriend] = useState<string | null>(null);
  const plusSt = useWumpPlus();
  const look = effectiveLook(useWumpLook(), !!plusSt?.active);
  const lookVars = wumpTheme(look.theme).vars as React.CSSProperties;
  const [family, setFamily] = useState<string[]>([]);
  const [invite, setInvite] = useState<string | null>(null);
  const [redeem, setRedeem] = useState("");
  const [radius, setRadius] = useState(500);
  const [viewUser, setViewUser] = useState<string | null>(null);
  const [threadUser, setThreadUser] = useState<string | null>(null);
  const [liveLabel, setLiveLabel] = useState("");
  const [bgShare, setBgShare] = useState(true);
  const [alerts, setAlerts] = useState(true);
  const [autoStopMin, setAutoStopMin] = useState(0);
  const [flashUntil, setFlashUntil] = useState<number | null>(null);
  const [shareFriendOpen, setShareFriendOpen] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [myLat, setMyLat] = useState<number | null>(null);
  const [myLng, setMyLng] = useState<number | null>(null);
  const [myHeading, setMyHeading] = useState<number | null>(null);
  const [myAccuracy, setMyAccuracy] = useState<number | null>(null);
  const [myPlaceName, setMyPlaceName] = useState<string | null>(null);
  const [savedPlaces, setSavedPlaces] = useState<WumpSavedPlace[]>([]);
  const [explore, setExplore] = useState<WumpExploreStats>(WUMP_EXPLORE_EMPTY);
  const [placesPanel, setPlacesPanel] = useState(true);
  const bumpOnly = standalone || isBumpApp();
  const myUsername = me ? profiles[me]?.username || null : null;
  const musicPlaying = useBumpMusic((s) => s.playing);
  const musicCurrentId = useBumpMusic((s) => s.currentId);
  const musicTracks = useBumpMusic((s) => s.tracks);

  useEffect(() => {
    if (!me) return;
    void fetchWumpPrivacy(me)
      .then((p) => {
        setVisible(p.wump_default_visible);
        setBgShare(p.wump_allow_background);
        setAlerts(p.wump_allow_nearby_alerts);
      })
      .catch(() => {
        const p = loadWumpPrivacyLocal();
        setVisible(p.wump_default_visible);
        setBgShare(p.wump_allow_background);
        setAlerts(p.wump_allow_nearby_alerts);
      });
  }, [me]);

  const friendIds = useMemo(() => {
    if (!me) return [] as string[];
    return friendships
      .filter((f) => f.status === "accepted")
      .map((f) => (f.requester_id === me ? f.addressee_id : f.requester_id));
  }, [friendships, me]);

  const nearbyById = useMemo(() => {
    const m = new Map<string, BumpNearby>();
    for (const n of nearby) m.set(n.user_id, n);
    return m;
  }, [nearby]);

  const refreshExplore = useCallback(async (lat?: number | null, lng?: number | null) => {
    if (!me) return;
    const stats = await wumpExploreStats(lat ?? myLat, lng ?? myLng);
    setExplore(stats);
  }, [me, myLat, myLng]);

  const refreshPlaces = useCallback(async () => {
    if (!me) return;
    const rows = await wumpListSavedPlaces();
    setSavedPlaces(rows);
    if (rows.length) setPlacesPanel(true);
  }, [me]);

  const refresh = useCallback(async () => {
    if (!me) return;
    const [n, f, mine] = await Promise.all([
      bumpNearby(radius).catch(() => [] as BumpNearby[]),
      bumpListFamily(),
      bumpMyPresence().catch(() => null),
    ]);
    setNearby(n);
    setFamily(f);
    if (mine) {
      setLive(true);
      if (mine.visible) setVisible(mine.visible);
      setMyLat(mine.lat);
      setMyLng(mine.lng);
      setMyHeading(mine.heading ?? null);
      setMyAccuracy(mine.accuracy_m ?? null);
      setMyPlaceName(mine.place_name || mine.place_locality || null);
      void refreshExplore(mine.lat, mine.lng);
      void wumpExploreMark(mine.lat, mine.lng).then((r) => {
        if (!r) return;
        if (typeof r.percent === "number") {
          setExplore((prev) => ({
            ...prev,
            percent: r.percent ?? prev.percent,
            explored_local: r.explored_local ?? prev.explored_local,
            total_local: r.total_local ?? prev.total_local,
            explored_all: r.explored_all ?? prev.explored_all,
            has_location: true,
            lat: mine.lat,
            lng: mine.lng,
          }));
        } else if (r.new) {
          void refreshExplore(mine.lat, mine.lng);
        }
      });
    } else {
      setLive(false);
      setMyLat(null);
      setMyLng(null);
      setMyHeading(null);
      setMyAccuracy(null);
      setMyPlaceName(null);
      void refreshExplore(null, null);
    }
  }, [me, radius, refreshExplore]);

  useEffect(() => {
    void refreshPlaces();
  }, [refreshPlaces]);

  // Restore Live + nearby; poll fast while Live so pins feel realtime
  useEffect(() => {
    void refresh();
    const t = setInterval(
      () => {
        if (live || focusFriend) void refresh();
      },
      focusFriend ? 3_000 : 6_000,
    );
    return () => clearInterval(t);
  }, [refresh, live, focusFriend]);

  // Realtime presence / family — Cap shells pick this up over the live website
  useEffect(() => {
    if (!me) return;
    return subscribeBumpLive({
      onPresence: () => {
        void refresh();
      },
      onFamily: () => {
        void bumpListFamily().then(setFamily);
      },
      onFollow: () => {
        /* friends list uses friendships store; presence refresh is enough for nearby badges */
      },
    });
  }, [me, refresh]);

  // Background watch + heartbeat while Live (works in Bump IPA / Nexus IPA)
  useEffect(() => {
    if (!live || !me) {
      void stopBumpBackground({ clearServer: false });
      return;
    }
    if (!bgShare) {
      void stopBumpBackground({ clearServer: false });
      // 5-minute scheduled refresh when background share is off (foreground poll still moves pins)
      const t = setInterval(() => {
        void bumpHeartbeat(visible, liveLabel.trim() || undefined).then((ok) => {
          if (ok) void refresh();
        });
      }, WUMP_REFRESH_MS);
      void bumpHeartbeat(visible, liveLabel.trim() || undefined);
      return () => clearInterval(t);
    }
    void startBumpBackground({
      visible,
      label: liveLabel,
      alerts,
      autoStopMinutes: autoStopMin,
      radiusM: radius,
      onNearby: setNearby,
      onLocation: (lat, lng, meta) => {
        setMyLat(lat);
        setMyLng(lng);
        if (meta) {
          setMyHeading(meta.heading);
          setMyAccuracy(meta.accuracy);
        }
      },
      onExplore: () => {
        void refreshExplore();
      },
    });
    return () => {
      void stopBumpBackground({ clearServer: false });
    };
  }, [live, me, bgShare]); // eslint-disable-line react-hooks/exhaustive-deps -- restart only on live/bg

  useEffect(() => {
    if (!live) return;
    updateBumpBackgroundOptions({ visible, label: liveLabel.trim() || null, alerts, radiusM: radius });
  }, [live, visible, liveLabel, alerts, radius]);

  // Flash "everyone" countdown
  useEffect(() => {
    if (!flashUntil) return;
    const t = setInterval(() => {
      if (Date.now() >= flashUntil) {
        setFlashUntil(null);
        setVisible("friends");
        toast("Everyone flash ended — back to Friends only", "info");
      }
    }, 1000);
    return () => clearInterval(t);
  }, [flashUntil]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const u0 = new URL(window.location.href);
    const groupCode = u0.searchParams.get("wumpGroup");
    if (groupCode) {
      void bumpJoinGroup(groupCode).then(() => {
        u0.searchParams.delete("wumpGroup");
        window.history.replaceState(null, "", u0.pathname + u0.search);
        setTab("groups");
        void refresh();
      });
      return;
    }
    const q = u0.searchParams.get("bump");
    const pathCode = window.location.pathname.match(/^\/(?:bump|wump)\/([a-z0-9]+)/i)?.[1];
    const code = q || (pathCode && !["app", "g"].includes(pathCode.toLowerCase()) ? pathCode : null);
    if (code) {
      setRedeem(code);
      void bumpRedeemInvite(code).then(() => {
        const u = new URL(window.location.href);
        u.searchParams.delete("bump");
        if (
          (u.pathname.startsWith("/bump/") && !u.pathname.startsWith("/bump/app")) ||
          (u.pathname.startsWith("/wump/") && !u.pathname.startsWith("/wump/app"))
        ) {
          u.pathname = bumpOnly ? "/wump/app" : "/";
        }
        window.history.replaceState(null, "", u.pathname + u.search);
        void refresh();
      });
    }
  }, [refresh, bumpOnly]);

  async function goLive() {
    setBusy(true);
    haptic.medium();
    const row = await bumpPublish(visible, liveLabel.trim() || undefined);
    setBusy(false);
    if (row) {
      setLive(true);
      if (typeof row.lat === "number") setMyLat(row.lat);
      if (typeof row.lng === "number") setMyLng(row.lng);
      setMyHeading(row.heading ?? null);
      setMyAccuracy(row.accuracy_m ?? null);
      setMyPlaceName(row.place_name || row.place_locality || null);
      await refresh();
      const priv = loadWumpPrivacyLocal();
      if (bgShare && priv.wump_allow_background) {
        toast(isNativeApp() ? "Live — background sharing on" : `Live — keep ${WUMP} open for updates`, "success");
      } else if (bgShare && !priv.wump_allow_background) {
        setBgShare(false);
        toast("Background Live is off in privacy — pin updates while the app is open", "info");
      }
    }
  }

  async function stop() {
    setBusy(true);
    await stopBumpBackground({ clearServer: true });
    await bumpClear();
    setBusy(false);
    setLive(false);
    setNearby([]);
    setMyLat(null);
    setMyLng(null);
    setMyHeading(null);
    setMyAccuracy(null);
    setMyPlaceName(null);
    setFlashUntil(null);
  }

  function startEveryoneFlash(minutes: number) {
    setVisible("everyone");
    setFlashUntil(Date.now() + minutes * 60_000);
    toast(`Visible to everyone for ${minutes} min`, "success");
    if (live) void bumpPublish("everyone", liveLabel.trim() || undefined);
  }

  async function makeInvite(kind: "family" | "friend" | "nearby") {
    const code = await bumpCreateInvite(kind);
    if (!code) return;
    setInvite(code);
    const url = bumpInviteLink(code);
    try {
      await navigator.clipboard.writeText(url);
      toast("Invite link copied", "success");
    } catch {
      /* ignore */
    }
    if (navigator.share) {
      void navigator.share({ title: `Join my Nexus ${WUMP} circle`, text: `Find me nearby on ${WUMP}`, url }).catch(() => {});
    }
  }

  function openPerson(userId: string) {
    setViewUser(userId);
    setTab("social");
  }

  function openProfilePage(username: string) {
    const url = wumpProfileUrl(username);
    if (!url) return;
    if (typeof window !== "undefined") {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }

  async function handleSavePlace(input: {
    name: string;
    lat: number;
    lng: number;
    locality?: string | null;
    source: "map" | "live" | "tap";
  }) {
    const row = await wumpSavePlace(input);
    if (row) {
      setSavedPlaces((prev) => [row, ...prev.filter((p) => p.id !== row.id)]);
      setPlacesPanel(true);
    }
  }

  function openMessages(userId: string) {
    setThreadUser(userId);
    setTab("messages");
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "nearby", label: "Nearby" },
    { id: "friends", label: "Friends" },
    { id: "groups", label: "Groups" },
    { id: "music", label: "Music" },
    { id: "profile", label: "Profile" },
    { id: "social", label: "People" },
    { id: "messages", label: "Messages" },
    { id: "settings", label: "Look & privacy" },
    { id: "plus", label: "✦ Plus" },
  ];

  const flashLeft =
    flashUntil && flashUntil > Date.now() ? Math.max(0, Math.ceil((flashUntil - Date.now()) / 1000)) : 0;

  const liveChip = (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        live ? "bg-ok/20 text-ok" : "bg-white/10 text-sub",
      )}
    >
      <span className={cn("size-1.5 animate-pulse rounded-full", live ? "bg-ok" : "bg-faint")} />
      {live ? (bgShare ? "Live · bg" : "Live") : "Off"}
    </span>
  );

  return (
    <>
      {shareFriendOpen && (
        <div className="fixed inset-0 z-[95] flex items-end justify-center bg-black/60 sm:items-center" onClick={() => setShareFriendOpen(false)}>
          <div className="w-full max-w-md rounded-t-3xl bg-chat p-5 pb-safe-4 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center gap-2">
              <MapPin className="size-5 text-accent" />
              <span className="flex-1 text-lg font-bold">Share {WUMP} with a friend</span>
              <button type="button" onClick={() => setShareFriendOpen(false)} className="grid size-8 place-items-center rounded-full hover:bg-hover" aria-label="Close">
                <X className="size-5" />
              </button>
            </div>
            <p className="mb-3 text-sm text-sub">Opens a Nexus DM with your live pin so they can find you on the map.</p>
            {!friendIds.length ? (
              <p className="py-8 text-center text-sm text-sub">Add Nexus friends first, then share your {WUMP} pin.</p>
            ) : (
              <ul className="max-h-[50vh] space-y-1 overflow-y-auto">
                {friendIds.map((id) => (
                  <li key={id}>
                    <button
                      type="button"
                      disabled={shareBusy}
                      onClick={() => {
                        setShareBusy(true);
                        void bumpShareLocationWithFriend(id, liveLabel.trim() || undefined).finally(() => {
                          setShareBusy(false);
                          setShareFriendOpen(false);
                        });
                      }}
                      className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-hover disabled:opacity-50"
                    >
                      <span className="grid size-9 place-items-center rounded-full bg-accent/20 text-sm font-bold text-accent">
                        {(profiles[id]?.display_name || profiles[id]?.username || "?").slice(0, 1).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-semibold">{profiles[id]?.display_name || profiles[id]?.username || "Friend"}</span>
                      <Share2 className="size-4 text-accent" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

    <div
      className={cn("wump-look flex h-full flex-col bg-chat text-txt", (mobile || bumpOnly) && !hideChromeTabs && "pb-safe-2")}
      data-wump-bg={look.bg}
      data-wump-theme={look.theme}
      style={lookVars}
    >
      {hideChromeTabs ? (
        <div className="flex shrink-0 flex-col gap-2 border-b border-white/5 px-3 py-2">
          <div className="flex items-center gap-2">
            {liveChip}
            {flashLeft > 0 && (
              <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-bold text-accent tabular-nums">
                Everyone {Math.floor(flashLeft / 60)}:{String(flashLeft % 60).padStart(2, "0")}
              </span>
            )}
            <span className="ml-auto text-[11px] text-sub">
              {friendIds.length} friends · {nearby.length} nearby
            </span>
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {(
              [
                ["nearby", "Map", <Radio className="size-3.5" key="m" />],
                ["friends", "Friends", <Users className="size-3.5" key="f" />],
                ["messages", "Chat", <MessageCircle className="size-3.5" key="c" />],
                ["groups", "Groups", <UserPlus className="size-3.5" key="g" />],
              ] as const
            ).map(([id, label, icon]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold transition",
                  tab === id ? "bg-emerald-500 text-white" : "bg-white/5 text-sub hover:bg-white/10 hover:text-txt",
                )}
              >
                {icon}
                {label}
              </button>
            ))}
            <button
              type="button"
              disabled={busy}
              onClick={() => void (live ? stop() : goLive())}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold transition",
                live ? "bg-white/10 text-ok" : "bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30",
              )}
            >
              <Navigation className="size-3.5" />
              {live ? "Refresh" : "Go Live"}
            </button>
            <button
              type="button"
              onClick={() => setShareFriendOpen(true)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-sub hover:bg-white/10 hover:text-txt"
            >
              <Share2 className="size-3.5" /> Share pin
            </button>
          </div>
        </div>
      ) : (
        <header
          className={cn(
            "relative shrink-0 overflow-hidden border-b border-line",
            mobile || onBack || bumpOnly ? "pt-safe-3" : "",
          )}
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-90"
            style={{
              background:
                "radial-gradient(ellipse 80% 120% at 0% 0%, color-mix(in oklab, #22c55a 22%, transparent), transparent 55%), radial-gradient(ellipse 60% 80% at 100% 0%, color-mix(in oklab, var(--color-accent) 16%, transparent), transparent 50%)",
            }}
          />
          <div className={cn("relative flex items-center gap-2 px-3 pb-3", mobile || onBack || bumpOnly ? "pt-1" : "pt-3")}>
            {!bumpOnly && (mobile || onBack) && (
              <button
                type="button"
                onClick={() => (onBack ? onBack() : useApp.setState({ hub: null, appsTool: null }))}
                className="grid size-9 place-items-center rounded-full bg-black/20 hover:bg-hover"
                aria-label="Back to apps"
              >
                <ArrowLeft className="size-5" />
              </button>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-base font-extrabold tracking-tight sm:text-lg">{WUMP}</h1>
                {liveChip}
                {flashLeft > 0 && (
                  <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-bold text-accent tabular-nums">
                    Everyone {Math.floor(flashLeft / 60)}:{String(flashLeft % 60).padStart(2, "0")}
                  </span>
                )}
              </div>
              <p className="truncate text-[11px] text-sub">
                {bumpOnly ? `Standalone ${WUMP} · same Nexus account` : WUMP_TAGLINE}
              </p>
            </div>
            <MapPin className={cn("size-5 shrink-0", live ? "text-ok" : "text-sub")} />
          </div>

          <nav className="relative flex gap-1 overflow-x-auto px-3 pb-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  "shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition",
                  tab === t.id ? "bg-accent text-white shadow-sm shadow-accent/25" : "bg-black/25 text-sub hover:bg-white/10 hover:text-txt",
                )}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </header>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
        {tab === "nearby" && (
          <div className="mx-auto max-w-xl space-y-4">
            <WumpMap
              me={me}
              myLat={myLat}
              myLng={myLng}
              myHeading={myHeading}
              myAccuracy={myAccuracy}
              myPlaceName={myPlaceName}
              myUsername={myUsername}
              nearby={nearby}
              live={live}
              viewsToday={friendIds.length + nearby.length + (live ? 1 : 0)}
              placesCount={savedPlaces.length + nearby.filter((n) => n.place_name || n.profile_place_name).length + family.length}
              savedPlaces={savedPlaces}
              explorePercent={explore.percent}
              exploreLocal={explore.explored_local}
              exploreTotal={explore.total_local}
              exploreAll={explore.explored_all}
              playing={musicPlaying}
              onTogglePlay={() => {
                if (musicPlaying) pauseBumpMusic();
                else if (musicCurrentId) void playBumpTrack(musicCurrentId);
                else if (musicTracks[0]) void playBumpTrack(musicTracks[0].id);
                else {
                  setTab("music");
                  toast("Add tracks in Music", "info");
                }
              }}
              onOpenPerson={(id) => openPerson(id)}
              onOpenProfilePage={openProfilePage}
              onSearch={() => setTab("friends")}
              onFriends={() => setTab("friends")}
              onScratch={() => setTab("messages")}
              onGoLive={() => void goLive()}
              onSavePlace={(p) => handleSavePlace(p)}
              onMessagePerson={(id) => openMessages(id)}
              onFocusChange={setFocusFriend}
              onUpgradePlus={() => setTab("plus")}
              onPlaces={() => {
                setPlacesPanel((v) => !v);
                if (!live) void goLive();
              }}
            />
            <WumpExplorePanel
              stats={explore}
              username={myUsername}
              onOpenProfile={myUsername ? () => openProfilePage(myUsername) : undefined}
            />
            {live && (myPlaceName || nearby.some((n) => n.place_name || n.profile_place_name || n.username)) && (
              <div className="flex gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {myPlaceName && (
                  <button
                    type="button"
                    onClick={() => (myUsername ? openProfilePage(myUsername) : setTab("profile"))}
                    className="shrink-0 rounded-full bg-sky-500/12 px-3 py-1.5 text-xs font-semibold text-sky-200 ring-1 ring-sky-500/25 transition hover:bg-sky-500/20"
                  >
                    <span className="text-sky-300">{wumpUsernameHandle(myUsername) || "You"}</span>
                    <span className="text-sky-200/70"> · {myPlaceName}</span>
                  </button>
                )}
                {nearby
                  .filter((n) => n.place_name || n.place_locality || n.profile_place_name || n.username)
                  .slice(0, 12)
                  .map((n) => {
                    const username = n.username || profiles[n.user_id]?.username || null;
                    const name = n.display_name || profiles[n.user_id]?.display_name || username || "Friend";
                    const place = n.place_name || n.place_locality || n.profile_place_name;
                    return (
                      <button
                        key={n.user_id}
                        type="button"
                        onClick={() => openPerson(n.user_id)}
                        className="shrink-0 rounded-full bg-white/5 px-3 py-1.5 text-xs font-semibold text-txt ring-1 ring-white/10 transition hover:bg-white/10"
                      >
                        <span className="text-sky-200/90">{wumpUsernameHandle(username) || name}</span>
                        {place ? <span className="text-sub"> · {place}</span> : null}
                      </button>
                    );
                  })}
              </div>
            )}
            <WumpSavedPlacesPanel
              places={savedPlaces}
              open={placesPanel}
              onToggle={() => setPlacesPanel((v) => !v)}
              onDelete={(id) => {
                void wumpDeleteSavedPlace(id).then((ok) => {
                  if (ok) setSavedPlaces((prev) => prev.filter((x) => x.id !== id));
                });
              }}
            />
            {!bumpOnly && (
              <a
                href={bumpIpaReleasesUrl()}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-3 rounded-2xl bg-[#0b3d24] px-4 py-3 ring-1 ring-[#22c55a]/30 transition hover:bg-[#14532d]"
              >
                <span className="grid size-10 place-items-center rounded-xl bg-black/25 text-lg">📍</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-white">Get the standalone {WUMP} app</div>
                  <div className="truncate text-[11px] text-white/70">Separate IPA · same Nexus login · OSM map + background Live</div>
                </div>
                <Download className="size-4 shrink-0 text-[#86efac]" />
              </a>
            )}

            <section className="overflow-hidden rounded-2xl bg-side ring-1 ring-white/5">
              <div className="border-b border-white/5 px-4 py-3">
                <div className="flex items-center gap-2 text-sm font-bold">
                  <Radio className="size-4 text-accent" /> Share location
                </div>
                <p className="mt-1 text-xs leading-relaxed text-sub">
                  Realtime OpenStreetMap pins that move as you do. Location republishes at least every 5 minutes while Live. Precision &amp; audience come from Privacy.
                  {isNativeApp() ? " Background Live needs Location → Always." : ""}
                </p>
              </div>
              <div className="space-y-3 p-4">
                <div className="flex flex-wrap gap-1.5">
                  {(
                    [
                      ["friends", "Friends only"],
                      ["family", "Family"],
                      ["everyone", "Everyone nearby"],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        setVisible(id);
                        if (id !== "everyone") setFlashUntil(null);
                      }}
                      className={cn(
                        "rounded-full px-3 py-1.5 text-xs font-semibold transition",
                        visible === id ? "bg-accent text-white" : "bg-white/5 text-sub hover:bg-white/10",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <label className="block text-[11px] font-semibold text-sub">
                  Live status label
                  <input
                    value={liveLabel}
                    onChange={(e) => setLiveLabel(e.target.value.slice(0, 40))}
                    placeholder="Coffee @ park · optional"
                    className="mt-1.5 w-full rounded-xl bg-black/30 px-3 py-2 text-sm font-medium text-txt outline-none ring-1 ring-transparent focus:ring-accent"
                  />
                </label>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void goLive()}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-white shadow-sm shadow-accent/20 disabled:opacity-50 min-[420px]:flex-none"
                  >
                    <Navigation className="size-4" /> {live ? "Refresh pin" : "Wump now"}
                  </button>
                  <button
                    type="button"
                    disabled={busy || shareBusy}
                    onClick={() => setShareFriendOpen(true)}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold hover:bg-white/15"
                    title="Share live pin with a Nexus friend"
                  >
                    <Share2 className="size-4" /> Share with friend
                  </button>
                  {live && (
                    <button type="button" disabled={busy} onClick={() => void stop()} className="rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold hover:bg-white/15">
                      Stop
                    </button>
                  )}
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setBgShare((v) => !v)}
                    className={cn(
                      "flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs font-semibold ring-1",
                      bgShare ? "bg-ok/15 text-ok ring-ok/30" : "bg-white/5 text-sub ring-white/10",
                    )}
                  >
                    <Radio className="size-3.5 shrink-0" />
                    Background Live {bgShare ? "on" : "off"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAlerts((v) => !v)}
                    className={cn(
                      "flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs font-semibold ring-1",
                      alerts ? "bg-accent/15 text-accent ring-accent/30" : "bg-white/5 text-sub ring-white/10",
                    )}
                  >
                    {alerts ? <Bell className="size-3.5 shrink-0" /> : <BellOff className="size-3.5 shrink-0" />}
                    Nearby alerts {alerts ? "on" : "off"}
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <span className="mr-1 inline-flex items-center gap-1 text-[11px] font-semibold text-sub">
                    <Timer className="size-3.5" /> Flash everyone
                  </span>
                  {[5, 15, 30].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => startEveryoneFlash(m)}
                      className="rounded-full bg-white/5 px-2.5 py-1 text-[11px] font-bold text-sub hover:bg-white/10 hover:text-txt"
                    >
                      {m}m
                    </button>
                  ))}
                </div>

                <label className="block text-[11px] font-semibold text-sub">
                  Auto-stop after
                  <select
                    value={autoStopMin}
                    onChange={(e) => setAutoStopMin(Number(e.target.value))}
                    className="mt-1.5 w-full rounded-xl bg-black/30 px-3 py-2 text-sm font-medium text-txt outline-none"
                  >
                    <option value={0}>Until I stop</option>
                    <option value={20}>20 minutes</option>
                    <option value={60}>1 hour</option>
                    <option value={180}>3 hours</option>
                  </select>
                </label>

                <label className="block text-[11px] font-semibold text-sub">
                  Search radius · {radius >= 1000 ? `${(radius / 1000).toFixed(1)} km` : `${radius} m`}
                  <input type="range" min={100} max={2000} step={50} value={radius} onChange={(e) => setRadius(Number(e.target.value))} className="mt-2 w-full accent-[var(--accent)]" />
                </label>
              </div>
            </section>

            <PersonList
              title="Nearby"
              empty="No one in range yet. Go live, or invite friends with a link."
              ids={nearby.map((n) => n.user_id)}
              meta={(id) => {
                const n = nearbyById.get(id);
                if (!n) return "";
                const walkMin = Math.max(1, Math.round(n.meters / 84)); // ~1.4 m/s walking
                const eta = walkMin < 60 ? `~${walkMin} min walk` : `~${(walkMin / 60).toFixed(1)} h walk`;
                return `${formatMeters(n.meters)} · ${eta} · ${n.visible}${n.label ? ` · ${n.label}` : ""}`;
              }}
              onOpen={openPerson}
              onMessage={openMessages}
              onWave={(id) => {
                void bumpWave(id).then((row) => {
                  if (row) {
                    toast("Wave sent", "success");
                    openMessages(id);
                  }
                });
              }}
              onRefresh={() => void refresh()}
            />

            <section className="rounded-2xl bg-side p-4 ring-1 ring-white/5">
              <div className="mb-2 flex items-center gap-2 text-sm font-bold">
                <Users className="size-4 text-accent" /> Family &amp; invite links
              </div>
              <p className="mb-3 text-xs text-sub">
                Create a link friends can open in Nexus or the standalone {WUMP} app. Family joins your circle; Friend sends a Nexus friend request; Nearby soft-follows on Wump.
              </p>
              {!family.length ? (
                <p className="mb-3 text-xs text-sub">No family members yet — share a Family invite.</p>
              ) : (
                <ul className="mb-3 space-y-1">
                  {family.map((id) => (
                    <li key={id} className="flex items-center gap-2 rounded-xl px-1 py-1.5 hover:bg-hover">
                      <button type="button" onClick={() => openPerson(id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                        <Avatar userId={id} size={32} />
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                          <NameTag userId={id} />
                        </span>
                      </button>
                      <button type="button" aria-label="Remove" onClick={() => void bumpRemoveFamily(id).then(() => refresh())} className="grid size-7 place-items-center rounded-full text-sub hover:bg-white/5 hover:text-dnd">
                        <X className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void makeInvite("family")} className="inline-flex items-center gap-1.5 rounded-full bg-accent/20 px-3 py-1.5 text-xs font-bold text-accent">
                  <Share2 className="size-3.5" /> Family invite link
                </button>
                <button type="button" onClick={() => void makeInvite("friend")} className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold">
                  <Link2 className="size-3.5" /> Friend invite link
                </button>
                <button type="button" onClick={() => void makeInvite("nearby")} className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold">
                  Nearby invite link
                </button>
              </div>
              {invite && (
                <div className="mt-3 space-y-2">
                  <div className="flex items-center gap-2 rounded-xl bg-black/25 px-3 py-2">
                    <code className="min-w-0 flex-1 truncate text-[11px]">{bumpInviteLink(invite)}</code>
                    <button
                      type="button"
                      className="grid size-8 place-items-center rounded-full hover:bg-white/10"
                      onClick={() => {
                        void navigator.clipboard.writeText(bumpInviteLink(invite));
                        toast("Copied", "success");
                      }}
                      aria-label="Copy invite"
                    >
                      <Copy className="size-4" />
                    </button>
                    {typeof navigator !== "undefined" && "share" in navigator && (
                      <button
                        type="button"
                        className="rounded-full bg-accent px-3 py-1.5 text-xs font-bold text-white"
                        onClick={() => {
                          void navigator.share({
                            title: `Join me on ${WUMP}`,
                            text: `Add me on ${WUMP} / Nexus`,
                            url: bumpInviteLink(invite),
                          }).catch(() => {});
                        }}
                      >
                        Share
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-sub">Link works in Nexus and the standalone {WUMP} app · expires in 7 days</p>
                </div>
              )}
              <div className="mt-3 flex gap-2">
                <input
                  value={redeem}
                  onChange={(e) => setRedeem(e.target.value)}
                  placeholder="Paste invite link or code"
                  className="min-w-0 flex-1 rounded-xl bg-black/30 px-3 py-2 text-sm outline-none ring-1 ring-transparent focus:ring-accent"
                />
                <button
                  type="button"
                  disabled={!redeem.trim()}
                  onClick={() => {
                    const code = redeem.trim().split("/").pop() || redeem.trim();
                    void bumpRedeemInvite(code).then(() => refresh());
                  }}
                  className="rounded-xl bg-accent px-4 text-sm font-bold text-white disabled:opacity-40"
                >
                  Join
                </button>
              </div>
            </section>
          </div>
        )}

        {tab === "settings" && me && <WumpSettings userId={me} />}
        {tab === "plus" && me && <WumpPlusPanel />}

        {tab === "groups" && <WumpGroups friendIds={friendIds} />}

        {tab === "music" && (
          <div className="mx-auto h-full max-w-xl">
            <BumpMusicPanel />
          </div>
        )}

        {tab === "friends" && (
          <WumpFriendsPanel
            friendIds={friendIds}
            nearbyById={nearbyById}
            onOpen={openPerson}
            onMessage={openMessages}
            onWave={(id) => {
              void bumpWave(id).then((row) => {
                if (row) {
                  toast("Wave sent", "success");
                  openMessages(id);
                }
              });
            }}
            onSharePin={(id) => {
              setShareBusy(true);
              void bumpShareLocationWithFriend(id, liveLabel.trim() || undefined).finally(() => setShareBusy(false));
            }}
            onFindOnMap={() => setTab("nearby")}
            onRefresh={() => void refresh()}
          />
        )}

        {tab === "profile" && me && <BumpProfileEditor userId={me} />}

        {tab === "social" && (
          <BumpSocialPane me={me} focusUser={viewUser} onFocusUser={setViewUser} onMessage={openMessages} onUpgrade={() => setTab("plus")} />
        )}

        {tab === "messages" && me && (
          <BumpMessagesPane
            me={me}
            focusUser={threadUser}
            onFocusUser={setThreadUser}
            onOpenProfile={openPerson}
            friendIds={friendIds}
            onSharePin={(id) => {
              setShareBusy(true);
              void bumpShareLocationWithFriend(id, liveLabel.trim() || undefined).finally(() => setShareBusy(false));
            }}
            onWave={(id) => {
              void bumpWave(id).then((row) => {
                if (row) toast("Wave sent", "success");
              });
            }}
          />
        )}
      </div>
      {!hideChromeTabs && <BumpMiniPlayer onOpen={() => setTab("music")} />}
    </div>
    </>
  );
}

function PersonList({
  title,
  empty,
  ids,
  meta,
  badge,
  onOpen,
  onMessage,
  onWave,
  onRefresh,
}: {
  title: string;
  empty: string;
  ids: string[];
  meta: (id: string) => string;
  badge?: (id: string) => string | null;
  onOpen: (id: string) => void;
  onMessage: (id: string) => void;
  onWave?: (id: string) => void;
  onRefresh?: () => void;
}) {
  return (
    <section className="overflow-hidden rounded-2xl bg-side ring-1 ring-white/5">
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-bold">
          <Users className="size-4 text-accent" /> {title}
          <span className="rounded-full bg-white/10 px-1.5 text-[10px] font-bold text-sub tabular-nums">{ids.length}</span>
        </div>
        {onRefresh && (
          <button type="button" onClick={onRefresh} className="text-xs font-semibold text-accent hover:underline">
            Refresh
          </button>
        )}
      </div>
      {!ids.length ? (
        <p className="px-4 py-5 text-xs leading-relaxed text-sub">{empty}</p>
      ) : (
        <ul>
          {ids.map((id) => (
            <li key={id} className="border-b border-white/5 last:border-0">
              <div className="flex items-center gap-1.5 px-3 py-2.5">
                <button type="button" onClick={() => onOpen(id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <Avatar userId={id} size={42} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold">
                        <NameTag userId={id} />
                      </span>
                      {badge?.(id) && <span className="rounded-full bg-ok/20 px-1.5 text-[10px] font-bold text-ok">{badge(id)}</span>}
                    </div>
                    <div className="truncate text-[11px] text-sub">{meta(id)}</div>
                  </div>
                </button>
                {onWave && (
                  <button
                    type="button"
                    onClick={() => onWave(id)}
                    className="grid size-9 shrink-0 place-items-center rounded-full bg-white/5 text-ok hover:bg-ok/20"
                    aria-label="Wave"
                    title="Wave"
                  >
                    <Hand className="size-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onMessage(id)}
                  className="grid size-9 shrink-0 place-items-center rounded-full bg-white/5 text-accent hover:bg-accent/20"
                  aria-label="Message"
                >
                  <MessageCircle className="size-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function BumpProfileEditor({ userId }: { userId: string }) {
  const nexus = useApp((s) => s.profiles[userId]);
  const [prof, setProf] = useState<BumpProfile | null>(null);
  const [bio, setBio] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [spotify, setSpotify] = useState("");
  const [mapsUrl, setMapsUrl] = useState("");
  const [placeName, setPlaceName] = useState("");
  const [placeAddress, setPlaceAddress] = useState("");
  const [placeLat, setPlaceLat] = useState<number | null>(null);
  const [placeLng, setPlaceLng] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [scraping, setScraping] = useState(false);
  const avatarRef = useRef<HTMLInputElement>(null);
  const sp = useSpotifyUser();
  const liveNp = liveNow(nexus?.now_playing);

  useEffect(() => {
    startSpotifySync();
  }, []);

  useEffect(() => {
    void bumpGetProfile(userId).then((p) => {
      if (!p) return;
      setProf(p);
      setBio(p.bio ?? "");
      setSpotify(p.spotify_track ?? "");
      setMapsUrl(p.apple_maps_url ?? "");
      setPlaceName(p.place_name ?? "");
      setPlaceAddress(p.place_address ?? "");
      setPlaceLat(p.place_lat);
      setPlaceLng(p.place_lng);
    });
  }, [userId]);

  useEffect(() => {
    setDisplayName(nexus?.display_name || "");
    setUsername(nexus?.username || "");
  }, [nexus?.display_name, nexus?.username]);

  const embed = bumpSpotifyTrackEmbed(spotify);

  async function scrapeMaps() {
    setScraping(true);
    const got = await bumpAttachAppleMaps(mapsUrl.trim());
    setScraping(false);
    if (!got) return;
    setMapsUrl(got.apple_maps_url ?? mapsUrl);
    setPlaceName(got.place_name ?? "");
    setPlaceAddress(got.place_address ?? "");
    setPlaceLat(got.place_lat);
    setPlaceLng(got.place_lng);
    toast(got.place_name ? `Found “${got.place_name}”` : "Apple Maps place attached", "success");
  }

  async function save() {
    if (spotify.trim() && !bumpSpotifyTrackOk(spotify.trim())) {
      toast("Paste one Spotify track link", "error");
      return;
    }
    setBusy(true);
    if (displayName.trim() && displayName.trim() !== nexus?.display_name) {
      await updateMyProfile({ display_name: displayName.trim() }, true);
    }
    if (username.trim() && username.trim().toLowerCase() !== nexus?.username?.toLowerCase()) {
      await changeUsername(username.trim());
    }
    const saved = await bumpSaveProfile({
      bio: bio.trim() || null,
      spotify_track: spotify.trim() || null,
      apple_maps_url: mapsUrl.trim() || null,
      place_name: placeName.trim() || null,
      place_address: placeAddress.trim() || null,
      place_lat: placeLat,
      place_lng: placeLng,
    });
    setBusy(false);
    if (saved) setProf(saved);
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <section className="overflow-hidden rounded-2xl bg-side ring-1 ring-white/5">
        <div
          className="h-20"
          style={{
            background: "linear-gradient(135deg, color-mix(in oklab, #22c55a 55%, transparent), color-mix(in oklab, var(--color-accent) 40%, #0b3d24))",
          }}
        />
        <div className="-mt-10 flex items-end gap-3 px-4 pb-4">
          <button type="button" onClick={() => avatarRef.current?.click()} className="relative shrink-0" aria-label="Change profile picture">
            <Avatar userId={userId} size={72} className="ring-[4px] ring-side" />
            <span className="absolute inset-x-0 bottom-0 rounded-b-full bg-black/55 py-0.5 text-center text-[9px] font-bold text-white">Edit</span>
          </button>
          <input
            ref={avatarRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadAvatar(f);
              e.target.value = "";
            }}
          />
          <div className="min-w-0 flex-1 pb-1">
            <div className="truncate text-lg font-extrabold tracking-tight">{displayName || nexus?.display_name || "You"}</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              <div className="truncate text-sm text-sub">{wumpUsernameHandle(username || nexus?.username) || "@…"}</div>
              {(username || nexus?.username) && (
                <a
                  href={wumpProfileUrl(username || nexus?.username) || "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-sky-200 ring-1 ring-white/10 transition hover:bg-white/10"
                >
                  Open profile <ExternalLink className="size-2.5 opacity-70" />
                </a>
              )}
            </div>
            <div className="mt-1 text-[11px] text-sub">{prof ? `${prof.followers} followers · ${prof.following} following` : "Loading…"}</div>
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-2xl bg-side p-4 ring-1 ring-white/5">
        <label className="block text-xs font-bold tracking-wide text-sub uppercase">
          Display name
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value.slice(0, 40))}
            className="mt-1.5 w-full rounded-xl bg-black/30 px-3 py-2.5 text-sm normal-case tracking-normal outline-none ring-1 ring-transparent focus:ring-accent"
          />
        </label>
        <label className="block text-xs font-bold tracking-wide text-sub uppercase">
          Username
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 24))}
            className="mt-1.5 w-full rounded-xl bg-black/30 px-3 py-2.5 text-sm normal-case tracking-normal outline-none ring-1 ring-transparent focus:ring-accent"
          />
        </label>
        <label className="block text-xs font-bold tracking-wide text-sub uppercase">
          Bio
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value.slice(0, 280))}
            rows={3}
            placeholder="Where you hang, what you’re into…"
            className="mt-1.5 w-full resize-none rounded-xl bg-black/30 px-3 py-2.5 text-sm normal-case tracking-normal outline-none ring-1 ring-transparent focus:ring-accent"
          />
          <span className="mt-0.5 block text-right text-[10px] font-medium normal-case tracking-normal opacity-60">{bio.length}/280</span>
        </label>

        <div>
          <div className="mb-1.5 text-xs font-bold tracking-wide text-sub uppercase">Spotify</div>
          {sp.connected ? (
            liveNp ? <NowPlayingCard np={liveNp} /> : <p className="mb-2 text-[11px] text-sub">Connected — play a song to show Now Playing.</p>
          ) : (
            <button type="button" onClick={() => void connectSpotify()} className="mb-2 rounded-full bg-[#1DB954] px-3 py-1.5 text-xs font-bold text-black">
              Connect Spotify
            </button>
          )}
          <div className="mb-1 text-[11px] font-semibold text-sub">Profile song — search and tap Set, it plays on your profile</div>
          <WumpSongSearch current={spotify} compact onSet={(url) => setSpotify(url ?? "")} />
          <details className="mt-2">
            <summary className="cursor-pointer text-[11px] font-semibold text-sub">Or paste a track link</summary>
            <input
              value={spotify}
              onChange={(e) => setSpotify(e.target.value)}
              placeholder="https://open.spotify.com/track/…"
              className="mt-1 w-full rounded-xl bg-black/30 px-3 py-2.5 text-sm font-normal text-txt outline-none ring-1 ring-transparent focus:ring-accent"
            />
          </details>
        </div>
        {embed && <WumpTrackPlayer url={spotify} tall />}

        <div>
          <div className="mb-1 text-xs font-bold tracking-wide text-sub uppercase">Apple Maps hangout</div>
          <p className="mb-2 text-[11px] text-sub">Paste a maps.apple.com share link — we scrape name, address, and pin.</p>
          <div className="flex gap-2">
            <input
              value={mapsUrl}
              onChange={(e) => setMapsUrl(e.target.value)}
              placeholder="https://maps.apple.com/?…"
              className="min-w-0 flex-1 rounded-xl bg-black/30 px-3 py-2.5 text-sm outline-none ring-1 ring-transparent focus:ring-accent"
            />
            <button type="button" disabled={!mapsUrl.trim() || scraping} onClick={() => void scrapeMaps()} className="rounded-xl bg-white/10 px-3 text-xs font-bold disabled:opacity-40">
              {scraping ? "…" : "Scrape"}
            </button>
          </div>
          {(placeName || placeAddress) && (
            <div className="mt-2 rounded-xl bg-black/25 px-3 py-2 text-xs">
              <div className="font-semibold text-txt">{placeName || "Pinned place"}</div>
              {placeAddress && <div className="mt-0.5 text-sub">{placeAddress}</div>}
              {placeLat != null && placeLng != null && (
                <a href={appleMapsLink(placeLat, placeLng, placeName || undefined)} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 font-semibold text-accent">
                  Open in Apple Maps <ExternalLink className="size-3" />
                </a>
              )}
            </div>
          )}
        </div>

        <button type="button" disabled={busy} onClick={() => void save()} className="w-full rounded-xl bg-accent py-2.5 text-sm font-bold text-white shadow-sm shadow-accent/20 disabled:opacity-50">
          Save Wump profile
        </button>
      </section>
    </div>
  );
}

function BumpSocialPane({
  me,
  focusUser,
  onFocusUser,
  onMessage,
  onUpgrade,
}: {
  me: string | null | undefined;
  focusUser: string | null;
  onFocusUser: (id: string | null) => void;
  onMessage: (id: string) => void;
  onUpgrade?: () => void;
}) {
  const [prof, setProf] = useState<BumpProfile | null>(null);
  const [list, setList] = useState<{ user_id: string; created_at: string }[]>([]);
  const [which, setWhich] = useState<"followers" | "following">("followers");
  const [busyFollow, setBusyFollow] = useState(false);
  const target = focusUser || me || null;

  useEffect(() => {
    if (!target) return;
    void bumpGetProfile(target).then(setProf);
    void bumpFollowList(target, which).then(setList);
  }, [target, which]);

  if (!target) return <p className="text-sm text-sub">Sign in to browse Wump profiles.</p>;

  if (prof?.locked && prof.user_id === target) {
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <WumpLockedProfile
          key={prof.user_id}
          prof={prof}
          onUnlocked={(p) => {
            setProf(p);
            void bumpFollowList(p.user_id, which).then(setList);
          }}
        />
      </div>
    );
  }

  async function toggleFollow() {
    if (!prof || prof.is_me) return;
    setBusyFollow(true);
    const r = await bumpSetFollow(prof.user_id, !prof.is_following);
    setBusyFollow(false);
    if (r) setProf({ ...prof, is_following: r.is_following, followers: r.followers });
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      {prof ? (
        <section className="overflow-hidden rounded-2xl bg-side ring-1 ring-white/5">
          <div
            className="h-16"
            style={{
              background: `linear-gradient(120deg, color-mix(in oklab, ${prof.plus_style?.banner_color || (prof.is_plus ? "#facc15" : "#22c55a")} ${prof.plus_style?.banner_color ? 75 : 45}%, transparent), transparent 70%)`,
            }}
          />
          <div className="flex items-start gap-3 px-4 pb-4 -mt-8">
            <Avatar userId={prof.user_id} size={72} className="ring-[3px] ring-side" />
            <div className="min-w-0 flex-1 pt-8">
              <div className="flex items-center gap-1.5">
                <div className="truncate text-lg font-extrabold tracking-tight">{prof.display_name}</div>
                {prof.is_plus && <PlusBadge />}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-2">
                <div className="truncate text-sm text-sub">{wumpUsernameHandle(prof.username) || `@${prof.username}`}</div>
                {prof.username && (
                  <a
                    href={wumpProfileUrl(prof.username) || "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-sky-200 ring-1 ring-white/10 transition hover:bg-white/10"
                  >
                    Open profile <ExternalLink className="size-2.5 opacity-70" />
                  </a>
                )}
              </div>
              <div className="mt-1 text-[11px] text-sub">
                {prof.followers == null ? (
                  <span>Follows hidden</span>
                ) : (
                  <>
                <button type="button" className="font-semibold hover:underline" onClick={() => setWhich("followers")}>
                  {prof.followers} followers
                </button>
                {" · "}
                <button type="button" className="font-semibold hover:underline" onClick={() => setWhich("following")}>
                  {prof.following} following
                </button>
                  </>
                )}
                {prof.follows_you && <span className="ml-1 rounded-full bg-white/10 px-1.5 py-0.5 text-[10px]">Follows you</span>}
              </div>
              {prof.bio && <p className="mt-2 text-sm whitespace-pre-wrap text-txt/90">{prof.bio}</p>}
              {(prof.place_name || prof.place_address) && (
                <div className="mt-2 flex items-start gap-1.5 text-xs text-sub">
                  <MapPin className="mt-0.5 size-3.5 shrink-0 text-ok" />
                  <div>
                    <div className="font-semibold text-txt">{prof.place_name || "Pinned place"}</div>
                    {prof.place_address && <div>{prof.place_address}</div>}
                    {prof.apple_maps_url && (
                      <a href={prof.apple_maps_url} target="_blank" rel="noreferrer" className="mt-0.5 inline-flex items-center gap-1 font-semibold text-accent">
                        Apple Maps <ExternalLink className="size-3" />
                      </a>
                    )}
                  </div>
                </div>
              )}
              {!prof.is_me && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busyFollow}
                    onClick={() => void toggleFollow()}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold",
                      prof.is_following ? "bg-white/10 text-txt" : "bg-accent text-white",
                    )}
                  >
                    {prof.is_following ? <UserMinus className="size-3.5" /> : <UserPlus className="size-3.5" />}
                    {prof.is_following ? "Following" : "Follow"}
                  </button>
                  {prof.can_message !== false ? (
                    <button type="button" onClick={() => onMessage(prof.user_id)} className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold">
                      <MessageCircle className="size-3.5" /> Message
                    </button>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-white/5 px-3 py-1.5 text-[11px] text-sub">Messages off</span>
                  )}
                </div>
              )}
            </div>
          </div>
          {bumpSpotifyTrackEmbed(prof.spotify_track) && (
            <div className="border-t border-white/5 px-3 pb-3 pt-2">
              <div className="mb-1 text-[10px] font-bold tracking-wide text-sub uppercase">Profile song</div>
              <WumpTrackPlayer url={prof.spotify_track} />
            </div>
          )}
          {prof.is_me && (
            <div className="border-t border-white/5 px-3 pb-3 pt-2">
              <div className="mb-1 text-[10px] font-bold tracking-wide text-sub uppercase">{prof.spotify_track ? "Change song" : "Add a profile song"}</div>
              <WumpSongSearch current={prof.spotify_track} compact onSet={(_u, p) => p && setProf(p)} />
            </div>
          )}
          <WumpProfileViews prof={prof} onOpen={(id) => onFocusUser(id)} onUpgrade={onUpgrade} />
        </section>
      ) : (
        <p className="text-sm text-sub">Loading profile…</p>
      )}

      <section className="rounded-2xl bg-side p-4 ring-1 ring-white/5">
        <div className="mb-2 flex gap-1">
          {(["followers", "following"] as const).map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setWhich(w)}
              className={cn("rounded-full px-3 py-1 text-xs font-semibold capitalize", which === w ? "bg-accent text-white" : "bg-white/5 text-sub")}
            >
              {w}
            </button>
          ))}
        </div>
        {!list.length ? (
          <p className="text-xs text-sub">Nobody here yet.</p>
        ) : (
          <ul className="space-y-1">
            {list.map((r) => (
              <li key={r.user_id}>
                <button type="button" onClick={() => onFocusUser(r.user_id)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-hover">
                  <Avatar userId={r.user_id} size={36} />
                  <div className="min-w-0 flex-1 truncate text-sm font-semibold">
                    <NameTag userId={r.user_id} />
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function BumpMessagesPane({
  me,
  focusUser,
  onFocusUser,
  onOpenProfile,
  friendIds,
  onSharePin,
  onWave,
}: {
  me: string;
  focusUser: string | null;
  onFocusUser: (id: string | null) => void;
  onOpenProfile: (id: string) => void;
  friendIds: string[];
  onSharePin?: (id: string) => void;
  onWave?: (id: string) => void;
}) {
  const bubbles = useAppearance((s) => s.messageBubbles !== false);
  const [inbox, setInbox] = useState<BumpInboxRow[]>([]);
  const [msgs, setMsgs] = useState<BumpMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const quickReplies = ["👋 Hey!", "Where are you?", "Meet up?", "On my way", "Be right there"];

  const refreshInbox = useCallback(async () => {
    setInbox(await bumpInbox());
  }, []);

  useEffect(() => {
    void refreshInbox();
  }, [refreshInbox]);

  useEffect(() => {
    if (!focusUser) return;
    void bumpThread(focusUser).then((rows) => {
      setMsgs(rows);
      requestAnimationFrame(() => {
        if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
      });
    });
  }, [focusUser]);

  // Live DMs — insert arrives over supabase realtime (no IPA/APK)
  useEffect(() => {
    return subscribeBumpLive({
      onMessage: (row) => {
        void refreshInbox();
        if (!focusUser) return;
        if (row.sender_id !== focusUser && row.recipient_id !== focusUser) return;
        setMsgs((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
        requestAnimationFrame(() => {
          if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
        });
      },
    });
  }, [focusUser, refreshInbox]);

  async function send(text?: string) {
    const body = (text ?? draft).trim();
    if (!focusUser || !body) return;
    setSending(true);
    const row = await bumpSendMessage(focusUser, body);
    setSending(false);
    if (row) {
      setDraft("");
      setMsgs((m) => (m.some((x) => x.id === row.id) ? m : [...m, row]));
      void refreshInbox();
      requestAnimationFrame(() => {
        if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
      });
    }
  }

  if (focusUser) {
    return (
      <div className="mx-auto flex h-[min(78vh,720px)] max-w-lg flex-col overflow-hidden rounded-2xl bg-side ring-1 ring-white/5">
        <div className="flex items-center gap-2 border-b border-white/5 px-3 py-2.5">
          <button type="button" onClick={() => onFocusUser(null)} className="rounded-full px-2 py-1 text-xs font-semibold text-accent hover:bg-accent/10">
            ← Inbox
          </button>
          <button type="button" onClick={() => onOpenProfile(focusUser)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
            <Avatar userId={focusUser} size={34} />
            <span className="truncate text-sm font-bold">
              <NameTag userId={focusUser} />
            </span>
          </button>
          {onWave && (
            <button
              type="button"
              onClick={() => onWave(focusUser)}
              className="grid size-9 place-items-center rounded-full bg-white/5 text-ok hover:bg-ok/20"
              aria-label="Wave"
              title="Wave"
            >
              <Hand className="size-4" />
            </button>
          )}
          {onSharePin && (
            <button
              type="button"
              onClick={() => onSharePin(focusUser)}
              className="grid size-9 place-items-center rounded-full bg-white/5 text-accent hover:bg-accent/20"
              aria-label="Share pin"
              title="Share pin"
            >
              <Share2 className="size-4" />
            </button>
          )}
        </div>
        <div ref={scroller} className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 py-3">
          {!msgs.length && (
            <div className="py-8 text-center">
              <p className="text-sm font-semibold text-txt">Start the chat</p>
              <p className="mt-1 text-xs text-sub">Waves, meetups, and live pins — all in {WUMP}.</p>
            </div>
          )}
          {msgs.map((m, i) => {
            const mine = m.sender_id === me;
            const next = msgs[i + 1];
            const last = !next || next.sender_id !== m.sender_id;
            return (
              <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "msg-bubble msg-text relative max-w-[82%] px-3 py-1.5 leading-snug shadow-sm",
                    mine ? "bg-bubble-me text-white" : "bg-bubble text-txt",
                    bubbles ? "rounded-[18px]" : "rounded-lg",
                    bubbles && last && (mine ? "rounded-br-md bubble-tail-me" : "rounded-bl-md bubble-tail"),
                  )}
                >
                  <div className="whitespace-pre-wrap break-words">{m.body}</div>
                  <div className={cn("mt-0.5 text-right text-[10px] tabular-nums", mine ? "text-white/55" : "text-sub")}>
                    {fmtClock(new Date(m.created_at))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex gap-1.5 overflow-x-auto border-t border-white/5 px-3 pt-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {quickReplies.map((q) => (
            <button
              key={q}
              type="button"
              disabled={sending}
              onClick={() => void send(q)}
              className="shrink-0 rounded-full bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-sub hover:bg-white/10 hover:text-txt disabled:opacity-40"
            >
              {q}
            </button>
          ))}
        </div>
        <div className="flex gap-2 p-3">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, 1000))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder="Message…"
            className="min-w-0 flex-1 rounded-full bg-black/30 px-4 py-2.5 text-sm outline-none ring-1 ring-white/10 focus:ring-emerald-500"
          />
          <button
            type="button"
            disabled={sending || !draft.trim()}
            onClick={() => void send()}
            className="rounded-full bg-emerald-500 px-4 text-sm font-bold text-white disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </div>
    );
  }

  const unreadTotal = inbox.reduce((n, r) => n + (r.unread || 0), 0);

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <section className="overflow-hidden rounded-2xl bg-side ring-1 ring-white/5">
        <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-bold">
            <MessageCircle className="size-4 text-emerald-400" /> Chat
            {unreadTotal > 0 && (
              <span className="rounded-full bg-emerald-500 px-1.5 text-[10px] font-bold text-white">{unreadTotal}</span>
            )}
          </div>
          <button type="button" onClick={() => void refreshInbox()} className="text-xs font-semibold text-accent">
            Refresh
          </button>
        </div>
        {!inbox.length ? (
          <div className="px-4 py-6 text-center">
            <p className="text-sm font-semibold text-txt">No conversations yet</p>
            <p className="mt-1 text-xs text-sub">Pick a friend below or open Friends → Message.</p>
          </div>
        ) : (
          <ul>
            {inbox.map((row) => (
              <li key={row.other_id} className="border-b border-white/5 last:border-0">
                <button type="button" onClick={() => onFocusUser(row.other_id)} className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-hover">
                  <Avatar userId={row.other_id} size={44} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold">
                        <NameTag userId={row.other_id} />
                      </span>
                      {row.unread > 0 && <span className="rounded-full bg-emerald-500 px-1.5 text-[10px] font-bold text-white">{row.unread}</span>}
                    </div>
                    <div className="truncate text-[12px] text-sub">{row.last_body}</div>
                  </div>
                  <span className="shrink-0 text-[10px] text-sub">{new Date(row.last_at).toLocaleDateString([], { month: "short", day: "numeric" })}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {!!friendIds.length && (
        <section className="rounded-2xl bg-side p-4 ring-1 ring-white/5">
          <div className="mb-2 text-xs font-bold tracking-wide text-sub uppercase">Start a chat</div>
          <div className="flex flex-wrap gap-2">
            {friendIds.slice(0, 16).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => onFocusUser(id)}
                className="flex items-center gap-2 rounded-full bg-black/25 py-1 pr-3 pl-1 text-xs font-semibold hover:bg-white/10"
              >
                <Avatar userId={id} size={24} />
                <NameTag userId={id} badges={false} />
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export { openBump } from "@/lib/bump";
