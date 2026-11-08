"use client";

import { supabase, errorText } from "./supabase";
import { useApp, toast } from "@/store/app";
import { loadProfiles } from "./data";
import { getDeviceLocation, requestLocationPermission } from "./location";
import { appleMapsLink, isAppleMapsUrl, scrapeAppleMaps, type AppleMapsPlace } from "./appleMaps";
import { spotifyEmbed } from "./links";

export type BumpVisible = "friends" | "family" | "everyone";

export type BumpNearby = {
  user_id: string;
  lat: number;
  lng: number;
  accuracy_m: number | null;
  visible: BumpVisible;
  label: string | null;
  updated_at: string;
  meters: number;
  heading?: number | null;
  speed_mps?: number | null;
  expires_at?: string | null;
  age_seconds?: number | null;
  place_name?: string | null;
  place_locality?: string | null;
  profile_place_name?: string | null;
  profile_place_lat?: number | null;
  profile_place_lng?: number | null;
  username?: string | null;
  display_name?: string | null;
};

export type BumpProfile = {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  avatar_color: string;
  bio: string | null;
  spotify_track: string | null;
  apple_maps_url: string | null;
  place_name: string | null;
  place_address: string | null;
  place_lat: number | null;
  place_lng: number | null;
  followers: number;
  following: number;
  is_following: boolean;
  follows_you: boolean;
  is_me: boolean;
  updated_at: string | null;
  /** Set when the page can't be shown: why. */
  locked?: BumpLock | null;
  password_hint?: string | null;
  is_friend?: boolean;
  can_message?: boolean;
  /** Owner only. */
  views?: number | null;
  views_7d?: number | null;
  privacy?: BumpPrivacy | null;
  is_plus?: boolean;
  plus_style?: { pin_emoji: string | null; pin_color: string | null; banner_color: string | null } | null;
};

export type BumpLock = "private" | "friends" | "password" | "wrong_password" | "too_many";
export type BumpAudience = "everyone" | "friends" | "nobody";
export type BumpPrivacy = {
  visibility: "everyone" | "friends" | "private";
  show_place: BumpAudience;
  show_song: boolean;
  show_follows: boolean;
  dm_from: BumpAudience;
  searchable: boolean;
  has_password: boolean;
  password_hint: string | null;
  password_friends_bypass: boolean;
  hide_my_views: boolean;
};
export const BUMP_PRIVACY_DEF: BumpPrivacy = {
  visibility: "everyone",
  show_place: "friends",
  show_song: true,
  show_follows: true,
  dm_from: "everyone",
  searchable: true,
  has_password: false,
  password_hint: null,
  password_friends_bypass: true,
  hide_my_views: false,
};

export type BumpMessage = {
  id: number;
  sender_id: string;
  recipient_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
};

export type BumpInboxRow = {
  other_id: string;
  last_body: string;
  last_at: string;
  unread: number;
};

/**
 * Opens Wump as its own live hub (desktop rail + phone Apps tab).
 * Capacitor loads https://nexusproject.cc — web deploys update without a new IPA/APK.
 * Standalone Wump IPA already lives on /wump/app (legacy /bump/app still works).
 */
export function openBump() {
  if (typeof window !== "undefined" && /BumpApp|WumpApp/i.test(navigator.userAgent)) {
    const onShell = window.location.pathname.startsWith("/bump/app") || window.location.pathname.startsWith("/wump/app");
    if (!onShell) {
      window.location.href = "/wump/app";
      return;
    }
  }
  const mobile = typeof window !== "undefined" && window.innerWidth < 768;
  useApp.setState(
    mobile
      ? { mobileTab: "apps", hub: "bump", appsTool: null, mobileSidebar: true }
      : { hub: "bump", appsTool: null },
  );
}

/** Latest standalone Bump IPA releases (Sideloadly / AltStore). */
export function bumpIpaReleasesUrl() {
  return "https://github.com/qyopyy/nexus-chat/releases?q=Wump+iOS&expanded=true";
}

/** Friendly wave DM (no extra tables). */
export async function bumpWave(to: string) {
  return bumpSendMessage(to, "👋 Wave — spotted you on Wump");
}

export type BumpPresenceRow = {
  user_id: string;
  lat: number;
  lng: number;
  accuracy_m: number | null;
  visible: BumpVisible;
  label: string | null;
  updated_at: string;
  heading?: number | null;
  speed_mps?: number | null;
  battery_pct?: number | null;
  expires_at?: string | null;
  place_name?: string | null;
  place_locality?: string | null;
};

/** Restore Live state after refresh (own pin still on the server). */
export async function bumpMyPresence() {
  const { data, error } = await supabase.rpc("bump_my_presence");
  if (error || !data) return null;
  return data as BumpPresenceRow;
}

/**
 * Realtime: nearby pins, DMs, follows — no native rebuild required.
 * Call from BumpHub while mounted; returns an unsubscribe.
 */
export function subscribeBumpLive(handlers: {
  onPresence?: (row?: BumpPresenceRow | null) => void;
  onMessage?: (row: BumpMessage) => void;
  onFollow?: () => void;
  onFamily?: () => void;
}) {
  const me = useApp.getState().userId;
  const key = `bump-live:${me ?? "anon"}:${Math.random().toString(36).slice(2, 7)}`;
  let presenceTimer: ReturnType<typeof setTimeout> | null = null;
  const ch = supabase
    .channel(key)
    .on("postgres_changes", { event: "*", schema: "public", table: "bump_presence" }, (payload) => {
      // Debounce bursts (heartbeats) so the web client stays smooth — no IPA needed
      const row = (payload.new || null) as BumpPresenceRow | null;
      if (presenceTimer) clearTimeout(presenceTimer);
      presenceTimer = setTimeout(() => handlers.onPresence?.(row), 250);
    })
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "bump_messages" }, (payload) => {
      const row = payload.new as BumpMessage;
      if (!me || (row.sender_id !== me && row.recipient_id !== me)) return;
      void loadProfiles([row.sender_id, row.recipient_id]);
      handlers.onMessage?.(row);
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "bump_follows" }, () => {
      handlers.onFollow?.();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "bump_family" }, () => {
      handlers.onFamily?.();
    });
  void ch.subscribe();
  return () => {
    if (presenceTimer) clearTimeout(presenceTimer);
    void supabase.removeChannel(ch);
  };
}

export function bumpInviteLink(code: string) {
  const clean = code.trim();
  // Prefer /wump/… brand; /bump/… still works. Avoid /b/… (bot profiles).
  if (typeof window === "undefined") return `https://nexusproject.cc/wump/${encodeURIComponent(clean)}`;
  return `${window.location.origin}/wump/${encodeURIComponent(clean)}`;
}

export function bumpSpotifyTrackEmbed(url: string | null | undefined) {
  if (!url) return null;
  const emb = spotifyEmbed(url);
  if (!emb || !/\/embed\/track\//.test(emb)) return null;
  return emb;
}

export function bumpSpotifyTrackOk(url: string) {
  return !!bumpSpotifyTrackEmbed(url);
}

export async function bumpPublish(visible: BumpVisible = "friends", label?: string) {
  const perm = await requestLocationPermission();
  if (perm === "denied") {
    toast("Location is off — enable it in iPhone Settings → Nexus → Location", "error");
    return null;
  }
  try {
    const { loadWumpPrivacyLocal } = await import("./wumpPrivacy");
    const priv = loadWumpPrivacyLocal();
    if (!priv.wump_share_enabled) {
      toast("Location sharing is off in Wump privacy settings", "error");
      return null;
    }
    const loc = await getDeviceLocation({ highAccuracy: priv.wump_precision === "exact" });
    const place = await import("./wumpGeocode").then((m) => m.wumpGeocode(loc.lat, loc.lng)).catch(() => null);
    const { data, error } = await supabase.rpc("bump_publish", {
      p_lat: loc.lat,
      p_lng: loc.lng,
      p_accuracy: loc.accuracy,
      p_visible: visible,
      p_label: label ?? null,
      p_precision: priv.wump_precision,
      p_heading: loc.heading,
      p_speed: loc.speed,
      p_place_name: place?.name ?? place?.display ?? null,
      p_place_locality: place?.locality ?? place?.city ?? null,
    });
    if (error) {
      toast(errorText(error) || "Couldn't share location", "error");
      return null;
    }
    const where = place?.name || place?.city;
    toast(
      loc.source === "capacitor"
        ? where
          ? `Wump live near ${where}`
          : "Wump live — finding people nearby"
        : where
          ? `Wump live · ${where}`
          : "Wump live",
      "success",
    );
    return data as BumpPresenceRow;
  } catch (e) {
    toast(e instanceof Error ? e.message : "Location failed", "error");
    return null;
  }
}

export async function bumpClear() {
  const { error } = await supabase.rpc("bump_clear");
  if (error) toast(errorText(error) || "Couldn't clear", "error");
  else toast("Location sharing stopped", "info");
  return !error;
}

export async function bumpNearby(radiusM = 500) {
  const { data, error } = await supabase.rpc("bump_nearby", { p_radius_m: radiusM });
  if (error) {
    toast(errorText(error) || "Nearby lookup failed", "error");
    return [] as BumpNearby[];
  }
  const rows = (data ?? []) as BumpNearby[];
  if (rows.length) await loadProfiles(rows.map((r) => r.user_id));
  return rows;
}

export async function bumpListFamily() {
  const me = useApp.getState().userId;
  if (!me) return [];
  const { data, error } = await supabase.from("bump_family").select("member_id").eq("user_id", me);
  if (error || !data) return [];
  const ids = data.map((r) => r.member_id as string);
  if (ids.length) await loadProfiles(ids);
  return ids;
}

export async function bumpRemoveFamily(memberId: string) {
  const me = useApp.getState().userId;
  if (!me) return false;
  await supabase.from("bump_family").delete().eq("user_id", me).eq("member_id", memberId);
  await supabase.from("bump_family").delete().eq("user_id", memberId).eq("member_id", me);
  return true;
}

export async function bumpCreateInvite(kind: "family" | "friend" | "nearby" = "family") {
  const { data, error } = await supabase.rpc("bump_create_invite", { p_kind: kind });
  if (error || !data) {
    toast(errorText(error) || "Couldn't create invite", "error");
    return null;
  }
  return String(data);
}

export async function bumpRedeemInvite(code: string) {
  const { data, error } = await supabase.rpc("bump_redeem_invite", { p_code: code.trim() });
  if (error) {
    toast(errorText(error) || "Invite failed", "error");
    return null;
  }
  const out = data as { ok?: boolean; creator_id?: string; kind?: string };
  if (out.creator_id) await loadProfiles([out.creator_id]);
  const kindMsg =
    out.kind === "family"
      ? "Joined their family circle on Wump"
      : out.kind === "friend"
        ? "Friend request sent via Wump invite"
        : "Wump invite accepted — you're connected";
  toast(kindMsg, "success");
  return out;
}

// ------------------------------------------------------------------ profiles / follow / messages

export async function bumpGetProfile(userId: string, password?: string) {
  const { data, error } = await supabase.rpc("bump_get_profile", password ? { p_user: userId, p_password: password } : { p_user: userId });
  if (error) {
    toast(errorText(error) || "Couldn't load Bump profile", "error");
    return null;
  }
  const p = data as BumpProfile;
  await loadProfiles([p.user_id]);
  return p;
}

export async function bumpSaveProfile(input: {
  bio?: string | null;
  spotify_track?: string | null;
  apple_maps_url?: string | null;
  place_name?: string | null;
  place_address?: string | null;
  place_lat?: number | null;
  place_lng?: number | null;
}) {
  if (input.spotify_track && !bumpSpotifyTrackOk(input.spotify_track)) {
    toast("Paste one Spotify track link (open.spotify.com/track/…)", "error");
    return null;
  }
  const { data, error } = await supabase.rpc("bump_upsert_profile", {
    p_bio: input.bio ?? null,
    p_spotify_track: input.spotify_track ?? null,
    p_apple_maps_url: input.apple_maps_url ?? null,
    p_place_name: input.place_name ?? null,
    p_place_address: input.place_address ?? null,
    p_place_lat: input.place_lat ?? null,
    p_place_lng: input.place_lng ?? null,
  });
  if (error) {
    toast(errorText(error) || "Couldn't save profile", "error");
    return null;
  }
  toast("Bump profile saved", "success");
  return data as BumpProfile;
}

/** Privacy settings (incl. page password: pass "" to remove, a 4–64 char string to set). */
export async function bumpSetPrivacy(patch: Partial<Omit<BumpPrivacy, "has_password">> & { password?: string }) {
  const { data, error } = await supabase.rpc("bump_set_privacy", { p: patch });
  if (error) {
    toast(errorText(error) || "Couldn't save privacy", "error");
    return null;
  }
  return data as BumpProfile;
}

/** Set (or clear with null) the profile song — one Spotify track link. */
export async function bumpSetSong(trackUrl: string | null) {
  const { data, error } = await supabase.rpc("bump_set_song", { p_track: trackUrl });
  if (error) {
    toast(errorText(error) || "Couldn't set song", "error");
    return null;
  }
  toast(trackUrl ? "Profile song set" : "Profile song removed", "success");
  return data as BumpProfile;
}

export type BumpViewer = { viewer_id: string; viewed_at: string; is_friend: boolean };
export async function bumpViewers(limit = 50) {
  const { data, error } = await supabase.rpc("bump_profile_viewers", { p_limit: limit });
  if (error) return [] as BumpViewer[];
  const rows = (data ?? []) as BumpViewer[];
  if (rows.length) await loadProfiles(rows.map((r) => r.viewer_id));
  return rows;
}

export type BumpPerson = { user_id: string; username: string; display_name: string | null; avatar_url: string | null; avatar_color: string | null; is_friend: boolean };
export async function bumpSearchPeople(q: string) {
  if (q.trim().length < 2) return [] as BumpPerson[];
  const { data, error } = await supabase.rpc("bump_search_people", { p_q: q.trim() });
  if (error) return [] as BumpPerson[];
  return (data ?? []) as BumpPerson[];
}

export type BumpSong = { id: string; name: string; url: string; artists: string; image: string | null; preview_url: string | null; explicit: boolean };
/** Search Spotify tracks (server keys, via the spotify edge function). */
export async function bumpSearchSongs(q: string): Promise<BumpSong[]> {
  if (q.trim().length < 2) return [];
  const { data, error } = await supabase.functions.invoke("spotify", { body: { action: "search", type: "track", q: q.trim() } });
  if (error || !data) return [];
  const items = ((data as { items?: unknown[] }).items ?? []) as {
    id: string | null; name: string; url: string | null; explicit?: boolean; preview_url?: string | null;
    album?: { image?: string | null } | null; artists?: { name: string }[];
  }[];
  return items
    .filter((t) => t.id)
    .slice(0, 10)
    .map((t) => ({
      id: t.id as string,
      name: t.name,
      url: t.url || `https://open.spotify.com/track/${t.id}`,
      artists: (t.artists ?? []).map((a) => a.name).join(", "),
      image: t.album?.image ?? null,
      preview_url: t.preview_url ?? null,
      explicit: !!t.explicit,
    }));
}

/** Resolve an Apple Maps share link (or lat/lng) and save it onto the Bump profile. */
export async function bumpAttachAppleMaps(raw: string | { lat: number; lng: number; q?: string }) {
  try {
    let place: AppleMapsPlace;
    if (typeof raw === "string") {
      const url = raw.trim();
      if (!isAppleMapsUrl(url)) {
        toast("Paste a maps.apple.com link", "error");
        return null;
      }
      place = await scrapeAppleMaps({ url });
    } else {
      place = await scrapeAppleMaps({ lat: raw.lat, lng: raw.lng, q: raw.q });
    }
    const mapsUrl = place.finalUrl || place.url || (place.lat != null && place.lng != null ? appleMapsLink(place.lat, place.lng, place.name || undefined) : null);
    return {
      apple_maps_url: mapsUrl,
      place_name: place.name,
      place_address: place.address,
      place_lat: place.lat,
      place_lng: place.lng,
      place,
    };
  } catch (e) {
    toast(e instanceof Error ? e.message : "Apple Maps lookup failed", "error");
    return null;
  }
}

export async function bumpSetFollow(userId: string, on: boolean) {
  const { data, error } = await supabase.rpc("bump_set_follow", { p_user: userId, p_on: on });
  if (error) {
    toast(errorText(error) || "Follow failed", "error");
    return null;
  }
  return data as { ok: boolean; is_following: boolean; followers: number };
}

export async function bumpFollowList(userId: string, which: "followers" | "following") {
  const { data, error } = await supabase.rpc("bump_follow_list", { p_user: userId, p_which: which });
  if (error) {
    toast(errorText(error) || "Couldn't load list", "error");
    return [] as { user_id: string; created_at: string }[];
  }
  const rows = (data ?? []) as { user_id: string; created_at: string }[];
  if (rows.length) await loadProfiles(rows.map((r) => r.user_id));
  return rows;
}

export async function bumpSendMessage(to: string, body: string) {
  const { data, error } = await supabase.rpc("bump_send_message", { p_to: to, p_body: body });
  if (error) {
    toast(errorText(error) || "Couldn't send", "error");
    return null;
  }
  return data as BumpMessage;
}

export async function bumpThread(withUser: string) {
  const { data, error } = await supabase.rpc("bump_thread", { p_with: withUser, p_limit: 100 });
  if (error) {
    toast(errorText(error) || "Couldn't load messages", "error");
    return [] as BumpMessage[];
  }
  const rows = (data ?? []) as BumpMessage[];
  if (rows.length) await loadProfiles([...new Set(rows.flatMap((m) => [m.sender_id, m.recipient_id]))]);
  return rows;
}

export async function bumpInbox() {
  const { data, error } = await supabase.rpc("bump_inbox", { p_limit: 40 });
  if (error) {
    toast(errorText(error) || "Inbox failed", "error");
    return [] as BumpInboxRow[];
  }
  const rows = (data ?? []) as BumpInboxRow[];
  if (rows.length) await loadProfiles(rows.map((r) => r.other_id));
  return rows;
}

/** Share live Bump coordinates into a Nexus DM with a friend. */
export async function bumpShareLocationWithFriend(friendId: string, note?: string) {
  const me = useApp.getState().userId;
  if (!me) return null;
  if (friendId === me) {
    toast("Pick a friend to share with", "info");
    return null;
  }
  const perm = await requestLocationPermission();
  if (perm === "denied") {
    toast("Location is off — enable it in Settings → Nexus → Location", "error");
    return null;
  }
  try {
    const loc = await getDeviceLocation({ highAccuracy: true });
    // Keep them visible on Bump for friends while sharing into chat
    await supabase.rpc("bump_publish", {
      p_lat: loc.lat,
      p_lng: loc.lng,
      p_accuracy: loc.accuracy,
      p_visible: "friends",
      p_label: note?.trim() || null,
    });
    const { data: conv, error: dmErr } = await supabase.rpc("get_or_create_dm", { p_user: friendId });
    if (dmErr || !conv) {
      toast(errorText(dmErr) || "Couldn't open chat with that friend", "error");
      return null;
    }
    const maps = `https://maps.apple.com/?ll=${loc.lat},${loc.lng}&q=Wump`;
    const body = [
      "📍 Shared my Wump location with you",
      note?.trim() ? note.trim() : null,
      maps,
      `[bump-pin:${loc.lat.toFixed(5)},${loc.lng.toFixed(5)}]`,
    ]
      .filter(Boolean)
      .join("\n");
    const { sendMessage } = await import("./data");
    await sendMessage(conv as string, body);
    const { openConversation } = await import("./data");
    openConversation(conv as string, null);
    toast("Wump location sent in chat", "success");
    return conv as string;
  } catch (e) {
    toast(e instanceof Error ? e.message : "Couldn't share location", "error");
    return null;
  }
}

/** Quiet Live heartbeat via dedicated RPC (no toast). Falls back to bump_publish. */
export async function bumpHeartbeat(visible: BumpVisible = "friends", label?: string | null) {
  try {
    const { loadWumpPrivacyLocal } = await import("./wumpPrivacy");
    const priv = loadWumpPrivacyLocal();
    if (!priv.wump_share_enabled) return false;
    const loc = await getDeviceLocation({ highAccuracy: false });
    const place = await import("./wumpGeocode").then((m) => m.wumpGeocode(loc.lat, loc.lng)).catch(() => null);
    const placeArgs = {
      p_place_name: place?.name ?? place?.display ?? null,
      p_place_locality: place?.locality ?? place?.city ?? null,
    };
    const { error } = await supabase.rpc("bump_heartbeat", {
      p_lat: loc.lat,
      p_lng: loc.lng,
      p_accuracy: loc.accuracy,
      p_heading: loc.heading,
      p_speed: loc.speed,
      ...placeArgs,
    });
    if (!error) return true;
    // Older DBs without bump_heartbeat — full publish
    const { error: e2 } = await supabase.rpc("bump_publish", {
      p_lat: loc.lat,
      p_lng: loc.lng,
      p_accuracy: loc.accuracy,
      p_visible: visible,
      p_label: label?.trim() || null,
      p_precision: priv.wump_precision,
      p_heading: loc.heading,
      p_speed: loc.speed,
      ...placeArgs,
    });
    return !e2;
  } catch {
    return false;
  }
}

/** Publish a known GPS sample (from watchPosition) without toast. */
export async function bumpPublishSample(
  loc: { lat: number; lng: number; accuracy: number | null; heading?: number | null; speed?: number | null },
  visible: BumpVisible,
  label?: string | null,
  opts?: { geocode?: boolean },
) {
  const { loadWumpPrivacyLocal } = await import("./wumpPrivacy");
  const priv = loadWumpPrivacyLocal();
  if (!priv.wump_share_enabled) return false;
  let placeArgs: { p_place_name: string | null; p_place_locality: string | null } | Record<string, never> = {};
  if (opts?.geocode !== false) {
    const place = await import("./wumpGeocode").then((m) => m.wumpGeocode(loc.lat, loc.lng)).catch(() => null);
    if (place) {
      placeArgs = {
        p_place_name: place.name ?? place.display ?? null,
        p_place_locality: place.locality ?? place.city ?? null,
      };
      // Fire-and-forget place patch so realtime friends see names even if heartbeat args lag
      void supabase.rpc("bump_set_place", {
        p_place_name: placeArgs.p_place_name,
        p_place_locality: placeArgs.p_place_locality,
      });
    }
  }
  const { error } = await supabase.rpc("bump_heartbeat", {
    p_lat: loc.lat,
    p_lng: loc.lng,
    p_accuracy: loc.accuracy,
    p_heading: loc.heading ?? null,
    p_speed: loc.speed ?? null,
    ...placeArgs,
  });
  if (!error) return true;
  const { error: e2 } = await supabase.rpc("bump_publish", {
    p_lat: loc.lat,
    p_lng: loc.lng,
    p_accuracy: loc.accuracy,
    p_visible: visible,
    p_label: label?.trim() || null,
    p_precision: priv.wump_precision,
    p_heading: loc.heading ?? null,
    p_speed: loc.speed ?? null,
    ...placeArgs,
  });
  return !e2;
}

/** Patch Live place name after async geocode (triggers realtime for friends). */
export async function bumpSetPlace(placeName: string | null, locality?: string | null) {
  const { data, error } = await supabase.rpc("bump_set_place", {
    p_place_name: placeName,
    p_place_locality: locality ?? null,
  });
  if (error) return null;
  return data as BumpPresenceRow;
}

/** Remove expired presence rows (best-effort). */
export async function bumpExpireStale() {
  try {
    await supabase.rpc("bump_expire_stale");
  } catch {
    /* ignore */
  }
}

// ------------------------------------------------------------------ Wump groups

export type WumpGroup = {
  id: string;
  name: string;
  owner_id: string;
  invite_code: string;
  created_at: string;
  member_count: number;
  my_role: string;
};

export function bumpGroupInviteLink(code: string) {
  const clean = code.trim();
  if (typeof window === "undefined") return `https://nexusproject.cc/wump/g/${encodeURIComponent(clean)}`;
  return `${window.location.origin}/wump/g/${encodeURIComponent(clean)}`;
}

export async function bumpCreateGroup(name: string, members: string[] = []) {
  const { data, error } = await supabase.rpc("bump_create_group", { p_name: name.trim(), p_members: members });
  if (error || !data) {
    toast(errorText(error) || "Couldn't create group", "error");
    return null;
  }
  toast("Group created", "success");
  return data as { id: string; invite_code: string; name: string };
}

export async function bumpJoinGroup(code: string) {
  const { data, error } = await supabase.rpc("bump_join_group", { p_code: code.trim() });
  if (error || !data) {
    toast(errorText(error) || "Couldn't join group", "error");
    return null;
  }
  toast(`Joined ${(data as { name?: string }).name || "group"}`, "success");
  return data as { id: string; name: string; invite_code: string };
}

export async function bumpListGroups() {
  const { data, error } = await supabase.rpc("bump_list_groups");
  if (error) return [] as WumpGroup[];
  return (data ?? []) as WumpGroup[];
}

export async function bumpGroupMembers(groupId: string) {
  const { data, error } = await supabase.rpc("bump_group_members_list", { p_group: groupId });
  if (error || !data) return [] as { user_id: string; role: string; joined_at: string }[];
  const rows = data as { user_id: string; role: string; joined_at: string }[];
  if (rows.length) await loadProfiles(rows.map((r) => r.user_id));
  return rows;
}

export async function bumpLeaveGroup(groupId: string) {
  const { error } = await supabase.rpc("bump_leave_group", { p_group: groupId });
  if (error) {
    toast(errorText(error) || "Couldn't leave group", "error");
    return false;
  }
  toast("Left group", "info");
  return true;
}

