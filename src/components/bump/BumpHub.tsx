"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Copy,
  ExternalLink,
  Link2,
  MapPin,
  MessageCircle,
  Navigation,
  Radio,
  Share2,
  UserPlus,
  UserMinus,
  Users,
  X,
} from "lucide-react";
import { useApp, toast } from "@/store/app";
import { useAppearance } from "@/store/appearance";
import {
  bumpAttachAppleMaps,
  bumpClear,
  bumpCreateInvite,
  bumpFollowList,
  bumpGetProfile,
  bumpHeartbeat,
  bumpInbox,
  bumpInviteLink,
  bumpListFamily,
  bumpMyPresence,
  bumpNearby,
  bumpPublish,
  bumpRedeemInvite,
  bumpRemoveFamily,
  bumpSaveProfile,
  bumpSendMessage,
  bumpSetFollow,
  bumpSpotifyTrackEmbed,
  bumpSpotifyTrackOk,
  bumpThread,
  subscribeBumpLive,
  type BumpInboxRow,
  type BumpMessage,
  type BumpNearby,
  type BumpProfile,
  type BumpVisible,
} from "@/lib/bump";
import { appleMapsLink } from "@/lib/appleMaps";
import { formatMeters } from "@/lib/location";
import { fmtClock } from "@/lib/prefs";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import Avatar from "@/components/ui/Avatar";
import NameTag from "@/components/ui/NameTag";

type Tab = "nearby" | "friends" | "profile" | "social" | "messages";

export default function BumpHub({ mobile, onBack }: { mobile?: boolean; onBack?: () => void }) {
  const me = useApp((s) => s.userId);
  const friendships = useApp((s) => s.friendships);
  const [tab, setTab] = useState<Tab>("nearby");
  const [visible, setVisible] = useState<BumpVisible>("friends");
  const [live, setLive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [nearby, setNearby] = useState<BumpNearby[]>([]);
  const [family, setFamily] = useState<string[]>([]);
  const [invite, setInvite] = useState<string | null>(null);
  const [redeem, setRedeem] = useState("");
  const [radius, setRadius] = useState(500);
  const [viewUser, setViewUser] = useState<string | null>(null);
  const [threadUser, setThreadUser] = useState<string | null>(null);

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
    } else {
      setLive(false);
    }
  }, [me, radius]);

  // Restore Live + initial nearby, then keep a slow safety poll while live
  useEffect(() => {
    void refresh();
    const t = setInterval(() => {
      if (live) void refresh();
    }, 45_000);
    return () => clearInterval(t);
  }, [refresh, live]);

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

  // Heartbeat while live so the pin stays fresh without a native rebuild
  useEffect(() => {
    if (!live || !me) return;
    const beat = () => {
      void bumpHeartbeat(visible);
    };
    beat();
    const t = setInterval(beat, 50_000);
    return () => clearInterval(t);
  }, [live, me, visible]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search).get("bump");
    const path = window.location.pathname.match(/^\/bump\/([a-z0-9]+)/i)?.[1];
    const code = q || path;
    if (code) {
      setRedeem(code);
      void bumpRedeemInvite(code).then(() => {
        const u = new URL(window.location.href);
        u.searchParams.delete("bump");
        if (u.pathname.startsWith("/bump/")) u.pathname = "/";
        window.history.replaceState(null, "", u.pathname + u.search);
        void refresh();
      });
    }
  }, [refresh]);

  async function goLive() {
    setBusy(true);
    haptic.medium();
    const row = await bumpPublish(visible);
    setBusy(false);
    if (row) {
      setLive(true);
      await refresh();
    }
  }

  async function stop() {
    setBusy(true);
    await bumpClear();
    setBusy(false);
    setLive(false);
    setNearby([]);
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
      void navigator.share({ title: "Join my Nexus Bump circle", text: "Find me nearby on Nexus", url }).catch(() => {});
    }
  }

  function openPerson(userId: string) {
    setViewUser(userId);
    setTab("social");
  }

  function openMessages(userId: string) {
    setThreadUser(userId);
    setTab("messages");
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "nearby", label: "Nearby" },
    { id: "friends", label: "Friends" },
    { id: "profile", label: "Profile" },
    { id: "social", label: "People" },
    { id: "messages", label: "Messages" },
  ];

  return (
    <div className={cn("flex h-full flex-col bg-chat", mobile && "pb-safe-2")}>
      <header
        className={cn(
          "relative shrink-0 overflow-hidden border-b border-line",
          mobile || onBack ? "pt-safe-3" : "",
        )}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-90"
          style={{
            background:
              "radial-gradient(ellipse 80% 120% at 0% 0%, color-mix(in oklab, #22c55a 22%, transparent), transparent 55%), radial-gradient(ellipse 60% 80% at 100% 0%, color-mix(in oklab, var(--color-accent) 16%, transparent), transparent 50%)",
          }}
        />
        <div className={cn("relative flex items-center gap-2 px-3 pb-3", mobile || onBack ? "pt-1" : "pt-3")}>
          {(mobile || onBack) && (
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
            <div className="flex items-center gap-2">
              <h1 className="text-base font-extrabold tracking-tight sm:text-lg">Bump</h1>
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                  live ? "bg-ok/20 text-ok" : "bg-white/10 text-sub",
                )}
              >
                <span className={cn("size-1.5 animate-pulse rounded-full", live ? "bg-ok" : "bg-faint")} />
                {live ? "Live" : "Off"}
              </span>
              <span className="hidden text-[10px] font-semibold text-sub sm:inline">Realtime</span>
            </div>
            <p className="truncate text-[11px] text-sub">Nearby · friends · live DMs · updates without app store</p>
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

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
        {tab === "nearby" && (
          <div className="mx-auto max-w-xl space-y-4">
            <section className="overflow-hidden rounded-2xl bg-side ring-1 ring-white/5">
              <div className="border-b border-white/5 px-4 py-3">
                <div className="flex items-center gap-2 text-sm font-bold">
                  <Radio className="size-4 text-accent" /> Share location
                </div>
                <p className="mt-1 text-xs leading-relaxed text-sub">
                  Rounded to ~100 m, expires after 20 minutes. On iPhone: Settings → Nexus → Location.
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
                      onClick={() => setVisible(id)}
                      className={cn(
                        "rounded-full px-3 py-1.5 text-xs font-semibold transition",
                        visible === id ? "bg-accent text-white" : "bg-white/5 text-sub hover:bg-white/10",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void goLive()}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-white shadow-sm shadow-accent/20 disabled:opacity-50 min-[420px]:flex-none"
                  >
                    <Navigation className="size-4" /> {live ? "Refresh pin" : "Bump now"}
                  </button>
                  {live && (
                    <button type="button" disabled={busy} onClick={() => void stop()} className="rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold hover:bg-white/15">
                      Stop
                    </button>
                  )}
                </div>
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
                return n ? `${formatMeters(n.meters)} · ${n.visible}${n.label ? ` · ${n.label}` : ""}` : "";
              }}
              onOpen={openPerson}
              onMessage={openMessages}
              onRefresh={() => void refresh()}
            />

            <section className="rounded-2xl bg-side p-4 ring-1 ring-white/5">
              <div className="mb-2 flex items-center gap-2 text-sm font-bold">
                <Users className="size-4 text-accent" /> Family circle
              </div>
              {!family.length ? (
                <p className="mb-3 text-xs text-sub">Invite family so you can find each other when Bump is on.</p>
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
                  <Share2 className="size-3.5" /> Family invite
                </button>
                <button type="button" onClick={() => void makeInvite("friend")} className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold">
                  <Link2 className="size-3.5" /> Friend invite
                </button>
                <button type="button" onClick={() => void makeInvite("nearby")} className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold">
                  Nearby invite
                </button>
              </div>
              {invite && (
                <div className="mt-3 flex items-center gap-2 rounded-xl bg-black/25 px-3 py-2">
                  <code className="min-w-0 flex-1 truncate text-[11px]">{bumpInviteLink(invite)}</code>
                  <button
                    type="button"
                    className="grid size-8 place-items-center rounded-full hover:bg-white/10"
                    onClick={() => {
                      void navigator.clipboard.writeText(bumpInviteLink(invite));
                      toast("Copied", "success");
                    }}
                  >
                    <Copy className="size-4" />
                  </button>
                </div>
              )}
              <div className="mt-3 flex gap-2">
                <input
                  value={redeem}
                  onChange={(e) => setRedeem(e.target.value)}
                  placeholder="Redeem code or paste /bump/… link"
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

        {tab === "friends" && (
          <div className="mx-auto max-w-xl">
            <PersonList
              title="Friends"
              empty="No friends yet. Add people from Chats → Friends, then bump with them nearby."
              ids={friendIds}
              meta={(id) => {
                const n = nearbyById.get(id);
                return n ? `Nearby · ${formatMeters(n.meters)}` : "Not sharing location right now";
              }}
              badge={(id) => (nearbyById.has(id) ? "Near" : null)}
              onOpen={openPerson}
              onMessage={openMessages}
              onRefresh={() => void refresh()}
            />
          </div>
        )}

        {tab === "profile" && me && <BumpProfileEditor userId={me} />}

        {tab === "social" && (
          <BumpSocialPane me={me} focusUser={viewUser} onFocusUser={setViewUser} onMessage={openMessages} />
        )}

        {tab === "messages" && me && (
          <BumpMessagesPane me={me} focusUser={threadUser} onFocusUser={setThreadUser} onOpenProfile={openPerson} friendIds={friendIds} />
        )}
      </div>
    </div>
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
  onRefresh,
}: {
  title: string;
  empty: string;
  ids: string[];
  meta: (id: string) => string;
  badge?: (id: string) => string | null;
  onOpen: (id: string) => void;
  onMessage: (id: string) => void;
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
              <div className="flex items-center gap-2 px-3 py-2.5">
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
  const [spotify, setSpotify] = useState("");
  const [mapsUrl, setMapsUrl] = useState("");
  const [placeName, setPlaceName] = useState("");
  const [placeAddress, setPlaceAddress] = useState("");
  const [placeLat, setPlaceLat] = useState<number | null>(null);
  const [placeLng, setPlaceLng] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [scraping, setScraping] = useState(false);

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
          <Avatar userId={userId} size={72} className="ring-[4px] ring-side" />
          <div className="min-w-0 flex-1 pb-1">
            <div className="truncate text-lg font-extrabold">{nexus?.display_name || "You"}</div>
            <div className="truncate text-sm text-sub">@{nexus?.username || "…"}</div>
            <div className="mt-1 text-[11px] text-sub">{prof ? `${prof.followers} followers · ${prof.following} following` : "Loading…"}</div>
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-2xl bg-side p-4 ring-1 ring-white/5">
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

        <label className="block text-xs font-bold tracking-wide text-sub uppercase">
          Spotify track
          <input
            value={spotify}
            onChange={(e) => setSpotify(e.target.value)}
            placeholder="https://open.spotify.com/track/…"
            className="mt-1.5 w-full rounded-xl bg-black/30 px-3 py-2.5 text-sm normal-case tracking-normal outline-none ring-1 ring-transparent focus:ring-accent"
          />
        </label>
        {embed && <iframe src={embed} title="Bump Spotify track" loading="lazy" allow="encrypted-media; clipboard-write" className="h-[80px] w-full rounded-xl border-0" />}

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
          Save Bump profile
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
}: {
  me: string | null | undefined;
  focusUser: string | null;
  onFocusUser: (id: string | null) => void;
  onMessage: (id: string) => void;
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

  if (!target) return <p className="text-sm text-sub">Sign in to browse Bump profiles.</p>;

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
              background: "linear-gradient(120deg, color-mix(in oklab, #22c55a 45%, transparent), transparent 70%)",
            }}
          />
          <div className="flex items-start gap-3 px-4 pb-4 -mt-8">
            <Avatar userId={prof.user_id} size={72} className="ring-[3px] ring-side" />
            <div className="min-w-0 flex-1 pt-8">
              <div className="truncate text-lg font-extrabold">{prof.display_name}</div>
              <div className="truncate text-sm text-sub">@{prof.username}</div>
              <div className="mt-1 text-[11px] text-sub">
                <button type="button" className="font-semibold hover:underline" onClick={() => setWhich("followers")}>
                  {prof.followers} followers
                </button>
                {" · "}
                <button type="button" className="font-semibold hover:underline" onClick={() => setWhich("following")}>
                  {prof.following} following
                </button>
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
                  <button type="button" onClick={() => onMessage(prof.user_id)} className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold">
                    <MessageCircle className="size-3.5" /> Message
                  </button>
                </div>
              )}
            </div>
          </div>
          {bumpSpotifyTrackEmbed(prof.spotify_track) && (
            <div className="border-t border-white/5 px-3 pb-3 pt-2">
              <div className="mb-1 text-[10px] font-bold tracking-wide text-sub uppercase">Bio track</div>
              <iframe src={bumpSpotifyTrackEmbed(prof.spotify_track)!} title="Bump Spotify track" loading="lazy" allow="encrypted-media; clipboard-write" className="h-[80px] w-full rounded-xl border-0" />
            </div>
          )}
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
}: {
  me: string;
  focusUser: string | null;
  onFocusUser: (id: string | null) => void;
  onOpenProfile: (id: string) => void;
  friendIds: string[];
}) {
  const bubbles = useAppearance((s) => s.messageBubbles !== false);
  const [inbox, setInbox] = useState<BumpInboxRow[]>([]);
  const [msgs, setMsgs] = useState<BumpMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

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

  async function send() {
    if (!focusUser || !draft.trim()) return;
    setSending(true);
    const row = await bumpSendMessage(focusUser, draft.trim());
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
      <div className="mx-auto flex h-[min(70vh,640px)] max-w-lg flex-col overflow-hidden rounded-2xl bg-side ring-1 ring-white/5">
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
        </div>
        <div ref={scroller} className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 py-3">
          {!msgs.length && <p className="py-8 text-center text-xs text-sub">Say hi — first Bump message.</p>}
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
        <div className="flex gap-2 border-t border-white/5 p-3">
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
            className="min-w-0 flex-1 rounded-full bg-black/30 px-4 py-2.5 text-sm outline-none ring-1 ring-white/10 focus:ring-accent"
          />
          <button type="button" disabled={sending || !draft.trim()} onClick={() => void send()} className="rounded-full bg-accent px-4 text-sm font-bold text-white disabled:opacity-40">
            Send
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <section className="overflow-hidden rounded-2xl bg-side ring-1 ring-white/5">
        <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
          <div className="text-sm font-bold">Inbox</div>
          <button type="button" onClick={() => void refreshInbox()} className="text-xs font-semibold text-accent">
            Refresh
          </button>
        </div>
        {!inbox.length ? (
          <p className="px-4 py-5 text-xs text-sub">No Bump messages yet. Open a friend or nearby profile and tap Message.</p>
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
                      {row.unread > 0 && <span className="rounded-full bg-accent px-1.5 text-[10px] font-bold text-white">{row.unread}</span>}
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
          <div className="mb-2 text-xs font-bold tracking-wide text-sub uppercase">Message a friend</div>
          <div className="flex flex-wrap gap-2">
            {friendIds.slice(0, 12).map((id) => (
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
