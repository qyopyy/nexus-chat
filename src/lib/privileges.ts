"use client";

/**
 * Role capabilities for Nexus — VIP (1) · Moderator (2) · Admin (3) · Owner (4).
 * Central place for perk checks and the Staff Desk catalog.
 */

import { supabase, errorText } from "./supabase";
import { useApp, toast } from "@/store/app";
import { myRank } from "./admin";
import { ROLE_INFO, roleRank, type SiteRole } from "./theme";

export type RoleId = SiteRole;

export type Perk = {
  id: string;
  title: string;
  blurb: string;
  minRank: number;
};

/** Catalog shown in Staff Desk / VIP lounge — keep in sync with real gates below. */
export const ROLE_PERKS: Perk[] = [
  // VIP
  { id: "download", title: "Download any video", blurb: "Save Videos, Gram clips, and Shorts.", minRank: 1 },
  { id: "boost", title: "Boost your NexusGram posts", blurb: "Push your own posts higher in For you for 24 hours (3 active).", minRank: 1 },
  { id: "pulse_long", title: "Longer Pulse posts", blurb: "Up to 400 characters instead of 280.", minRank: 1 },
  { id: "genre_pins", title: "More genre pins", blurb: "Pin up to 12 music genres for For you ranking.", minRank: 1 },
  { id: "story_48", title: "48-hour stories anytime", blurb: "Always unlock the longer story window.", minRank: 1 },
  { id: "vip_flair", title: "VIP name flair", blurb: "Diamond role color next to your name everywhere.", minRank: 1 },
  // Moderator
  { id: "gram_admin", title: "NexusGram moderation", blurb: "Reports queue, remove posts, overview stats.", minRank: 2 },
  { id: "pulse_mod", title: "Moderate Pulse", blurb: "Delete any Pulse post and open Staff Desk tools.", minRank: 2 },
  { id: "mute_ban", title: "Mute & timeout users", blurb: "Block messaging and time out accounts below your rank.", minRank: 2 },
  { id: "remove_video", title: "Remove videos", blurb: "Take down Videos that break the rules.", minRank: 2 },
  { id: "chat_mod", title: "Chat moderation", blurb: "Delete messages from lower-ranked members.", minRank: 2 },
  { id: "audit", title: "Audit log", blurb: "See recent staff actions.", minRank: 2 },
  // Admin
  { id: "roles", title: "Assign VIP & Moderator", blurb: "Promote members up to one rank below you.", minRank: 3 },
  { id: "badges", title: "Grant badges", blurb: "Create and award custom badges.", minRank: 3 },
  { id: "usernames", title: "Rename accounts", blurb: "Force-change usernames on NexusGram.", minRank: 3 },
  { id: "premium_grant", title: "Grant Premium", blurb: "Gift Lighting / Dist plans from Admin Panel.", minRank: 3 },
  { id: "announce", title: "Site announcements", blurb: "Broadcast a banner to everyone on Nexus.", minRank: 3 },
  { id: "claims", title: "Artist claims & vault", blurb: "Review claims and unlock the file vault.", minRank: 3 },
  { id: "full_premium", title: "All Premium features", blurb: "Admins unlock every paid studio perk automatically.", minRank: 3 },
  // Owner
  { id: "admins", title: "Appoint admins", blurb: "Promote or demote site admins.", minRank: 4 },
  { id: "fcm", title: "Android push (FCM)", blurb: "Configure Firebase for the Android APK.", minRank: 4 },
  { id: "owner_lock", title: "Owner-only settings", blurb: "Danger-zone controls and global notice ownership.", minRank: 4 },
];

export function myRole(): RoleId {
  const s = useApp.getState();
  const r = (s.userId ? s.profiles[s.userId]?.site_role : null) ?? "member";
  return (ROLE_INFO[r as SiteRole] ? r : "member") as RoleId;
}

export function hasRank(min: number) {
  return myRank() >= min;
}

export const can = {
  downloadVideos: () => hasRank(1),
  boostGram: () => hasRank(1),
  longPulse: () => hasRank(1),
  extraGenrePins: () => hasRank(1),
  longStories: () => hasRank(1),
  gramAdmin: () => hasRank(2),
  pulseMod: () => hasRank(2),
  muteBan: () => hasRank(2),
  removeVideo: () => hasRank(2),
  chatMod: () => hasRank(2),
  audit: () => hasRank(2),
  staffDesk: () => hasRank(1), // VIP+ can open lounge; mods+ see tools
  setRoles: () => hasRank(3),
  badges: () => hasRank(3),
  usernames: () => hasRank(3),
  announce: () => hasRank(3),
  claimsVault: () => hasRank(3),
  appointAdmins: () => hasRank(4),
  ownerSettings: () => hasRank(4),
};

export function perksForRank(rank: number) {
  return ROLE_PERKS.filter((p) => p.minRank <= rank);
}

export function pulseMaxChars() {
  return can.longPulse() ? 400 : 280;
}

export function genrePinLimit() {
  return can.extraGenrePins() ? 12 : 6;
}

// ------------------------------------------------------------------ VIP boosts (client-side ranking signal)
const BOOST_KEY = "nexus:gram:boosts";

export type BoostMap = Record<string, number>; // postId → expiresAt ms

export function getBoosts(): BoostMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = JSON.parse(localStorage.getItem(BOOST_KEY) || "{}") as BoostMap;
    const now = Date.now();
    const next: BoostMap = {};
    for (const [id, exp] of Object.entries(raw)) if (exp > now) next[id] = exp;
    if (Object.keys(next).length !== Object.keys(raw).length) localStorage.setItem(BOOST_KEY, JSON.stringify(next));
    return next;
  } catch {
    return {};
  }
}

export function isBoosted(postId: string) {
  return (getBoosts()[postId] ?? 0) > Date.now();
}

export function activeBoostCount() {
  return Object.keys(getBoosts()).length;
}

/** VIP+ can boost own posts — max 3 concurrent, 24h each. */
export function boostGramPost(postId: string) {
  if (!can.boostGram()) {
    toast("Boosting posts is a VIP perk", "error");
    return false;
  }
  const map = getBoosts();
  if (map[postId] && map[postId] > Date.now()) {
    toast("Already boosted", "info");
    return true;
  }
  if (Object.keys(map).length >= 3) {
    toast("You already have 3 active boosts — wait for one to expire", "error");
    return false;
  }
  map[postId] = Date.now() + 24 * 3600_000;
  localStorage.setItem(BOOST_KEY, JSON.stringify(map));
  toast("Boosted for 24 hours — higher in For you", "success");
  return true;
}

export function clearBoost(postId: string) {
  const map = getBoosts();
  delete map[postId];
  localStorage.setItem(BOOST_KEY, JSON.stringify(map));
}

// ------------------------------------------------------------------ Site announcements (admin+)
export type SiteNotice = {
  id: string;
  body: string;
  active: boolean;
  author_id: string | null;
  updated_at: string;
};

export async function fetchSiteNotice(): Promise<SiteNotice | null> {
  const { data, error } = await supabase.from("site_notices").select("*").eq("id", "global").maybeSingle();
  if (error) {
    // table may not exist yet — soft fail
    if (!/schema|relation|does not exist|column/i.test(error.message)) {
      /* ignore noisy */
    }
    return null;
  }
  return (data as SiteNotice) ?? null;
}

export async function setSiteNotice(body: string, active: boolean) {
  if (!can.announce()) {
    toast("Only admins and the owner can post announcements", "error");
    return false;
  }
  const uid = useApp.getState().userId;
  const row = {
    id: "global",
    body: body.trim().slice(0, 280),
    active,
    author_id: uid,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("site_notices").upsert(row);
  if (error) {
    toast(errorText(error), "error");
    return false;
  }
  toast(active ? "Announcement live" : "Announcement cleared", "success");
  return true;
}

export function openStaffDesk() {
  if (!can.staffDesk()) {
    toast("Staff Desk unlocks at VIP", "info");
    return;
  }
  const mobile = typeof window !== "undefined" && window.innerWidth < 768;
  useApp.setState(mobile ? { mobileTab: "me", hub: "staff" } : { hub: "staff" });
}

export function rankLabel(rank: number) {
  const entry = Object.values(ROLE_INFO).find((r) => r.rank === rank);
  return entry?.label ?? "Member";
}

export function canModerateTarget(targetRole: string | null | undefined) {
  return myRank() >= 2 && roleRank(targetRole) < myRank();
}
