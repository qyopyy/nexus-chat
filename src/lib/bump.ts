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
 * Opens Bump as its own live hub (desktop rail + phone Apps tab).
 * Capacitor loads https://nexusproject.cc — web deploys update without a new IPA/APK.
 */
export function openBump() {
  const mobile = typeof window !== "undefined" && window.innerWidth < 768;
  useApp.setState(
    mobile
      ? { mobileTab: "apps", hub: "bump", appsTool: null, mobileSidebar: true }
      : { hub: "bump", appsTool: null },
  );
}

export type BumpPresenceRow = {
  user_id: string;
  lat: number;
  lng: number;
  accuracy_m: number | null;
  visible: BumpVisible;
  label: string | null;
  updated_at: string;
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
  onPresence?: () => void;
  onMessage?: (row: BumpMessage) => void;
  onFollow?: () => void;
  onFamily?: () => void;
}) {
  const me = useApp.getState().userId;
  const key = `bump-live:${me ?? "anon"}:${Math.random().toString(36).slice(2, 7)}`;
  const ch = supabase
    .channel(key)
    .on("postgres_changes", { event: "*", schema: "public", table: "bump_presence" }, () => {
      handlers.onPresence?.();
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
    void supabase.removeChannel(ch);
  };
}

export function bumpInviteLink(code: string) {
  const clean = code.trim();
  // /bump/… — not /b/… (that path is reserved for bot profiles)
  if (typeof window === "undefined") return `https://nexusproject.cc/bump/${encodeURIComponent(clean)}`;
  return `${window.location.origin}/bump/${encodeURIComponent(clean)}`;
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
    const loc = await getDeviceLocation({ highAccuracy: true });
    const { data, error } = await supabase.rpc("bump_publish", {
      p_lat: loc.lat,
      p_lng: loc.lng,
      p_accuracy: loc.accuracy,
      p_visible: visible,
      p_label: label ?? null,
    });
    if (error) {
      toast(errorText(error) || "Couldn't share location", "error");
      return null;
    }
    toast(loc.source === "capacitor" ? "Bump live — finding people nearby" : "Bump live", "success");
    return data as { user_id: string; lat: number; lng: number; updated_at: string };
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
  toast(out.kind === "family" ? "Added to family circle" : "Invite accepted", "success");
  return out;
}

// ------------------------------------------------------------------ profiles / follow / messages

export async function bumpGetProfile(userId: string) {
  const { data, error } = await supabase.rpc("bump_get_profile", { p_user: userId });
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

/** Quiet republish for live heartbeat (no toast). */
export async function bumpHeartbeat(visible: BumpVisible = "friends") {
  try {
    const loc = await getDeviceLocation({ highAccuracy: false });
    const { error } = await supabase.rpc("bump_publish", {
      p_lat: loc.lat,
      p_lng: loc.lng,
      p_accuracy: loc.accuracy,
      p_visible: visible,
      p_label: null,
    });
    return !error;
  } catch {
    return false;
  }
}
