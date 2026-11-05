"use client";

import { useCallback, useEffect, useState } from "react";
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
import {
  bumpAttachAppleMaps,
  bumpClear,
  bumpCreateInvite,
  bumpFollowList,
  bumpGetProfile,
  bumpInbox,
  bumpInviteLink,
  bumpListFamily,
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
  type BumpInboxRow,
  type BumpMessage,
  type BumpNearby,
  type BumpProfile,
  type BumpVisible,
} from "@/lib/bump";
import { appleMapsLink } from "@/lib/appleMaps";
import { formatMeters } from "@/lib/location";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import Avatar from "@/components/ui/Avatar";
import NameTag from "@/components/ui/NameTag";

type Tab = "nearby" | "profile" | "social" | "messages";

export default function BumpHub({ mobile }: { mobile?: boolean }) {
  const me = useApp((s) => s.userId);
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

  const refresh = useCallback(async () => {
    if (!me) return;
    const [n, f] = await Promise.all([bumpNearby(radius), bumpListFamily()]);
    setNearby(n);
    setFamily(f);
  }, [me, radius]);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => {
      if (live) void refresh();
    }, 12_000);
    return () => clearInterval(t);
  }, [refresh, live]);

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

  return (
    <div className={cn("flex h-full flex-col bg-chat", mobile && "pb-safe-2")}>
      <header className={cn("flex shrink-0 items-center gap-2 border-b border-line px-3", mobile ? "pt-safe-3 pb-2" : "h-12")}>
        {mobile && (
          <button type="button" onClick={() => useApp.setState({ hub: null })} className="grid size-9 place-items-center rounded-full hover:bg-hover" aria-label="Back">
            <ArrowLeft className="size-5" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold">Bump</div>
          <div className="truncate text-[11px] text-sub">Nearby · profiles · follows · messages</div>
        </div>
        <MapPin className={cn("size-5", live ? "text-ok" : "text-sub")} />
      </header>

      <nav className="flex shrink-0 gap-1 border-b border-line px-3 py-2">
        {(
          [
            ["nearby", "Nearby"],
            ["profile", "My profile"],
            ["social", "People"],
            ["messages", "Messages"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn("rounded-full px-3 py-1.5 text-xs font-semibold", tab === id ? "bg-accent text-white" : "bg-white/5 text-sub")}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
        {tab === "nearby" && (
          <div className="space-y-4">
            <section className="rounded-2xl bg-side p-4 ring-1 ring-white/5">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Radio className="size-4 text-accent" /> Share my bump
              </div>
              <p className="mb-3 text-xs text-sub">
                Location is rounded (~100 m) and auto-expires after 20 minutes. On iPhone, allow <b>Location</b> for Nexus in Settings → Privacy.
              </p>
              <div className="mb-3 flex flex-wrap gap-1.5">
                {(
                  [
                    ["friends", "Friends"],
                    ["family", "Family"],
                    ["everyone", "Everyone nearby"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setVisible(id)}
                    className={cn("rounded-full px-3 py-1.5 text-xs font-semibold", visible === id ? "bg-accent text-white" : "bg-white/5 text-sub")}
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
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50 min-[400px]:flex-none"
                >
                  <Navigation className="size-4" /> {live ? "Refresh location" : "Bump now"}
                </button>
                {live && (
                  <button type="button" disabled={busy} onClick={() => void stop()} className="rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold">
                    Stop sharing
                  </button>
                )}
              </div>
              <label className="mt-3 block text-[11px] font-semibold text-sub">
                Search radius · {radius} m
                <input type="range" min={100} max={2000} step={50} value={radius} onChange={(e) => setRadius(Number(e.target.value))} className="mt-1 w-full accent-[var(--accent)]" />
              </label>
            </section>

            <section className="rounded-2xl bg-side p-4 ring-1 ring-white/5">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Users className="size-4 text-accent" /> Nearby
                </div>
                <button type="button" onClick={() => void refresh()} className="text-xs font-semibold text-accent">
                  Refresh
                </button>
              </div>
              {!nearby.length ? (
                <p className="text-xs text-sub">No one in range yet. Bump with friends nearby, or share an invite link.</p>
              ) : (
                <ul className="space-y-1.5">
                  {nearby.map((n) => (
                    <li key={n.user_id}>
                      <button
                        type="button"
                        onClick={() => openPerson(n.user_id)}
                        className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-hover"
                      >
                        <Avatar userId={n.user_id} size={40} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold">
                            <NameTag userId={n.user_id} />
                          </div>
                          <div className="text-[11px] text-sub">
                            {formatMeters(n.meters)} · {n.visible}
                            {n.label ? ` · ${n.label}` : ""}
                          </div>
                        </div>
                        <MapPin className="size-4 text-ok" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-2xl bg-side p-4 ring-1 ring-white/5">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <Users className="size-4 text-accent" /> Family circle
              </div>
              {!family.length ? (
                <p className="mb-2 text-xs text-sub">Invite family with a link so you can find each other when Bump is on.</p>
              ) : (
                <ul className="mb-2 space-y-1">
                  {family.map((id) => (
                    <li key={id} className="flex items-center gap-2 rounded-xl px-2 py-1.5">
                      <button type="button" onClick={() => openPerson(id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                        <Avatar userId={id} size={32} />
                        <div className="min-w-0 flex-1 truncate text-sm font-semibold">
                          <NameTag userId={id} />
                        </div>
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
            </section>

            <section className="rounded-2xl bg-side p-4 ring-1 ring-white/5">
              <div className="mb-2 text-sm font-semibold">Redeem invite</div>
              <div className="flex gap-2">
                <input
                  value={redeem}
                  onChange={(e) => setRedeem(e.target.value)}
                  placeholder="Code or paste link"
                  className="min-w-0 flex-1 rounded-xl bg-black/30 px-3 py-2 text-sm outline-none ring-accent focus:ring-1"
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

        {tab === "profile" && me && <BumpProfileEditor userId={me} />}

        {tab === "social" && (
          <BumpSocialPane
            me={me}
            focusUser={viewUser}
            onFocusUser={setViewUser}
            onMessage={(id) => openMessages(id)}
          />
        )}

        {tab === "messages" && me && (
          <BumpMessagesPane me={me} focusUser={threadUser} onFocusUser={setThreadUser} onOpenProfile={openPerson} />
        )}
      </div>
    </div>
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
        <div className="flex items-center gap-3 p-4">
          <Avatar userId={userId} size={64} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-lg font-extrabold">{nexus?.display_name || "You"}</div>
            <div className="truncate text-sm text-sub">@{nexus?.username || "…"}</div>
            <div className="mt-1 text-[11px] text-sub">
              {prof ? `${prof.followers} followers · ${prof.following} following` : "Loading…"}
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-3 rounded-2xl bg-side p-4 ring-1 ring-white/5">
        <label className="block text-xs font-semibold text-sub">
          Bio
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value.slice(0, 280))}
            rows={3}
            placeholder="Say hi — where you hang, what you’re into"
            className="mt-1 w-full resize-none rounded-xl bg-black/30 px-3 py-2 text-sm outline-none ring-accent focus:ring-1"
          />
          <span className="mt-0.5 block text-right text-[10px] opacity-60">{bio.length}/280</span>
        </label>

        <label className="block text-xs font-semibold text-sub">
          Spotify track on your Bump bio
          <input
            value={spotify}
            onChange={(e) => setSpotify(e.target.value)}
            placeholder="https://open.spotify.com/track/…"
            className="mt-1 w-full rounded-xl bg-black/30 px-3 py-2 text-sm outline-none ring-accent focus:ring-1"
          />
        </label>
        {embed && <iframe src={embed} title="Bump Spotify track" loading="lazy" allow="encrypted-media; clipboard-write" className="h-[80px] w-full rounded-xl border-0" />}

        <div>
          <div className="mb-1 text-xs font-semibold text-sub">Apple Maps hangout</div>
          <p className="mb-2 text-[11px] text-sub">Paste a maps.apple.com share link — we scrape the place name, address, and pin.</p>
          <div className="flex gap-2">
            <input
              value={mapsUrl}
              onChange={(e) => setMapsUrl(e.target.value)}
              placeholder="https://maps.apple.com/?…"
              className="min-w-0 flex-1 rounded-xl bg-black/30 px-3 py-2 text-sm outline-none ring-accent focus:ring-1"
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
                <a
                  href={appleMapsLink(placeLat, placeLng, placeName || undefined)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex items-center gap-1 font-semibold text-accent"
                >
                  Open in Apple Maps <ExternalLink className="size-3" />
                </a>
              )}
            </div>
          )}
        </div>

        <button type="button" disabled={busy} onClick={() => void save()} className="w-full rounded-xl bg-accent py-2.5 text-sm font-bold text-white disabled:opacity-50">
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
          <div className="flex items-start gap-3 p-4">
            <Avatar userId={prof.user_id} size={72} />
            <div className="min-w-0 flex-1">
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
                  <button
                    type="button"
                    onClick={() => onMessage(prof.user_id)}
                    className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold"
                  >
                    <MessageCircle className="size-3.5" /> Message
                  </button>
                </div>
              )}
            </div>
          </div>
          {bumpSpotifyTrackEmbed(prof.spotify_track) && (
            <div className="border-t border-white/5 px-3 pb-3 pt-2">
              <div className="mb-1 text-[10px] font-bold tracking-wide text-sub uppercase">Bio track</div>
              <iframe
                src={bumpSpotifyTrackEmbed(prof.spotify_track)!}
                title="Bump Spotify track"
                loading="lazy"
                allow="encrypted-media; clipboard-write"
                className="h-[80px] w-full rounded-xl border-0"
              />
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
}: {
  me: string;
  focusUser: string | null;
  onFocusUser: (id: string | null) => void;
  onOpenProfile: (id: string) => void;
}) {
  const [inbox, setInbox] = useState<BumpInboxRow[]>([]);
  const [msgs, setMsgs] = useState<BumpMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const refreshInbox = useCallback(async () => {
    setInbox(await bumpInbox());
  }, []);

  useEffect(() => {
    void refreshInbox();
  }, [refreshInbox]);

  useEffect(() => {
    if (!focusUser) return;
    void bumpThread(focusUser).then(setMsgs);
  }, [focusUser]);

  async function send() {
    if (!focusUser || !draft.trim()) return;
    setSending(true);
    const row = await bumpSendMessage(focusUser, draft.trim());
    setSending(false);
    if (row) {
      setDraft("");
      setMsgs((m) => [...m, row]);
      void refreshInbox();
    }
  }

  if (focusUser) {
    return (
      <div className="mx-auto flex h-full max-w-lg flex-col gap-3">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => onFocusUser(null)} className="rounded-full px-2 py-1 text-xs font-semibold text-accent">
            ← Inbox
          </button>
          <button type="button" onClick={() => onOpenProfile(focusUser)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
            <Avatar userId={focusUser} size={32} />
            <span className="truncate text-sm font-bold">
              <NameTag userId={focusUser} />
            </span>
          </button>
        </div>
        <div className="min-h-[240px] flex-1 space-y-2 overflow-y-auto rounded-2xl bg-side p-3 ring-1 ring-white/5">
          {!msgs.length && <p className="text-center text-xs text-sub">Say hi — first Bump message.</p>}
          {msgs.map((m) => {
            const mine = m.sender_id === me;
            return (
              <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                <div className={cn("max-w-[80%] rounded-2xl px-3 py-2 text-sm", mine ? "bg-accent text-white" : "bg-white/10")}>
                  <div className="whitespace-pre-wrap break-words">{m.body}</div>
                  <div className={cn("mt-1 text-[10px]", mine ? "text-white/60" : "text-sub")}>
                    {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex gap-2">
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
            className="min-w-0 flex-1 rounded-xl bg-side px-3 py-2.5 text-sm outline-none ring-1 ring-white/10 focus:ring-accent"
          />
          <button type="button" disabled={sending || !draft.trim()} onClick={() => void send()} className="rounded-xl bg-accent px-4 text-sm font-bold text-white disabled:opacity-40">
            Send
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">Inbox</div>
        <button type="button" onClick={() => void refreshInbox()} className="text-xs font-semibold text-accent">
          Refresh
        </button>
      </div>
      {!inbox.length ? (
        <p className="rounded-2xl bg-side p-4 text-xs text-sub ring-1 ring-white/5">No Bump messages yet. Open someone’s profile from Nearby and tap Message.</p>
      ) : (
        <ul className="overflow-hidden rounded-2xl bg-side ring-1 ring-white/5">
          {inbox.map((row) => (
            <li key={row.other_id} className="border-b border-white/5 last:border-0">
              <button type="button" onClick={() => onFocusUser(row.other_id)} className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-hover">
                <Avatar userId={row.other_id} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold">
                      <NameTag userId={row.other_id} />
                    </span>
                    {row.unread > 0 && <span className="rounded-full bg-accent px-1.5 text-[10px] font-bold text-white">{row.unread}</span>}
                  </div>
                  <div className="truncate text-[11px] text-sub">{row.last_body}</div>
                </div>
                <span className="shrink-0 text-[10px] text-sub">{new Date(row.last_at).toLocaleDateString([], { month: "short", day: "numeric" })}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export { openBump } from "@/lib/bump";
