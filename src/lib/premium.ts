"use client";

// Nexus Premium — plans, orders (PayPal handled personally by qyopy), and feature checks.

import { supabase, errorText } from "./supabase";
import { useApp, toast } from "@/store/app";
import { roleRank } from "./theme";
import type { PremiumTier, Profile } from "./types";

export type Plan = { id: PremiumTier; rank: number; name: string; short: string; price: number; color: string; emoji: string; perks: string[] };

export const PLANS: Plan[] = [
  {
    id: "lighting",
    rank: 1,
    name: "Nexus Lighting Sub",
    short: "Lighting",
    price: 3.99,
    color: "#ffd400",
    emoji: "⚡",
    perks: ["⚡ Lighting badge next to your name", "Animated profile backgrounds, borders & themes", "100 MB file uploads in chats (free: 25 MB)", "Support Nexus 💜"],
  },
  {
    id: "premium",
    rank: 2,
    name: "Nexus Lighting Premium",
    short: "Premium",
    price: 5.99,
    color: "#00e5ff",
    emoji: "💎",
    perks: ["Everything in Lighting", "Shield 360 content protection — up to 10 songs", "Spotify & Apple Music takedown notices", "Nexus Drive — unlimited private cloud & share links", "Priority support from qyopy"],
  },
  {
    id: "dist",
    rank: 3,
    name: "Nexus Lighting Premium + Music Distribution",
    short: "Distribution",
    price: 19.99,
    color: "#1DB954",
    emoji: "🎵",
    perks: ["Everything in Premium", "Send releases to Spotify, Apple Music, TikTok, Snapchat & 150+ stores", "Smart links & pre-save pages", "Audia ISRC codes (QT6HV)", "Shield 360 — up to 25 songs"],
  },
  {
    id: "dist_pro",
    rank: 4,
    name: "Nexus Lighting Premium + Music Distribution Pro",
    short: "Distribution Pro",
    price: 49.99,
    color: "#7c4dff",
    emoji: "🚀",
    perks: ["Everything in Distribution", "Unlimited Shield 360 songs + ACRCloud sync", "Priority release review", "Playlist pitch review by the label"],
  },
  {
    id: "dist_video",
    rank: 5,
    name: "Nexus Lighting Premium + Music Distribution Pro + Official Music Video Distribution",
    short: "Pro + Music Video",
    price: 59.99,
    color: "#ff2bd6",
    emoji: "🎬",
    perks: ["Everything in Distribution Pro", "Official music video distribution (YouTube & video stores)", "Music video requests handled by the label"],
  },
];

export const planOf = (id?: string | null) => PLANS.find((p) => p.id === id) ?? null;

/** effective plan rank (0 = free); admins/owner get everything */
export function tierOf(p?: Profile | null) {
  if (!p) return 0;
  if (roleRank(p.site_role) >= 3) return 5;
  if (!p.premium_tier || !p.premium_until || new Date(p.premium_until) <= new Date()) return 0;
  return planOf(p.premium_tier)?.rank ?? 0;
}
export function myTier() {
  const s = useApp.getState();
  return tierOf(s.userId ? s.profiles[s.userId] : null);
}
export function useMyTier() {
  return useApp((s) => tierOf(s.userId ? s.profiles[s.userId] : null));
}
/** active paid plan shown on profiles (admins don't get a fake badge) */
export function activePlan(p?: Profile | null) {
  if (!p?.premium_tier || !p.premium_until || new Date(p.premium_until) <= new Date()) return null;
  return planOf(p.premium_tier);
}

export const NEED = { flair: 1, uploads100: 1, shield: 2, takedown: 2, distribution: 3, isrc: 3, smartlinks: 3, acr: 4, musicVideo: 5 } as const;
export function needPlan(rank: number) {
  return PLANS.find((p) => p.rank >= rank)!;
}
/** show an upsell and open the Premium page when the feature is locked */
export function gate(rank: number, what: string) {
  if (myTier() >= rank) return true;
  toast(`${what} is part of ${needPlan(rank).name}`, "info");
  useApp.setState({ modal: "premium", modalArg: needPlan(rank).id });
  return false;
}

// ------------------------------------------------------------------ orders
export type Order = { id: number; user_id: string; tier: PremiumTier; months: number; amount_usd: number; status: "pending" | "awaiting_payment" | "paid" | "fulfilled" | "cancelled"; note: string | null; handled_by: string | null; created_at: string; updated_at: string };

export async function createOrder(tier: PremiumTier, months: number) {
  const { data, error } = await supabase.rpc("create_order", { p_tier: tier, p_months: months });
  if (error) throw new Error(errorText(error));
  return data as { order_id: number; amount: number; conversation_id: string; bot_conversation_id: string };
}
export async function myOrders() {
  const me = useApp.getState().userId;
  const { data } = await supabase.from("premium_orders").select("*").eq("user_id", me).order("created_at", { ascending: false }).limit(20);
  return (data ?? []) as Order[];
}
export async function allOrders() {
  const { data } = await supabase.from("premium_orders").select("*").order("created_at", { ascending: false }).limit(300);
  return (data ?? []) as Order[];
}
export async function cancelOrder(id: number) {
  const { error } = await supabase.rpc("cancel_my_order", { p_order: id });
  if (error) toast(errorText(error), "error");
  return !error;
}
export async function setOrderStatus(id: number, status: Order["status"], note?: string) {
  const { error } = await supabase.rpc("set_order_status", { p_order: id, p_status: status, p_note: note ?? null });
  if (error) toast(errorText(error), "error");
  return !error;
}
export async function grantPremium(userId: string, tier: PremiumTier | null, days: number) {
  const { error } = await supabase.rpc("grant_premium", { p_user: userId, p_tier: tier, p_days: days });
  if (error) toast(errorText(error), "error");
  return !error;
}

// ------------------------------------------------------------------ Nitro-style gift links
export type PremiumGift = {
  id: string;
  code: string;
  tier: PremiumTier;
  days: number;
  max_claims: number;
  claims: number;
  expires_at: string | null;
  created_by: string | null;
  note: string | null;
  created_at: string;
};
export type PremiumGiftPreview = {
  code: string;
  tier: PremiumTier;
  days: number;
  max_claims: number;
  claims: number;
  expires_at: string | null;
  remaining: number;
  expired: boolean;
  exhausted: boolean;
};

export function giftLink(code: string) {
  if (typeof window !== "undefined") return `${window.location.origin}/gift/${encodeURIComponent(code)}`;
  return `/gift/${encodeURIComponent(code)}`;
}

export async function createPremiumGift(opts: { tier: PremiumTier; days: number; maxClaims?: number; expiresDays?: number; note?: string }) {
  const { data, error } = await supabase.rpc("create_premium_gift", {
    p_tier: opts.tier,
    p_days: opts.days,
    p_max_claims: opts.maxClaims ?? 1,
    p_expires_days: opts.expiresDays ?? 30,
    p_note: opts.note ?? null,
  });
  if (error) {
    toast(errorText(error), "error");
    return null;
  }
  return data as { id: string; code: string; path: string };
}

export async function listPremiumGifts() {
  const { data, error } = await supabase.rpc("list_premium_gifts");
  if (error) {
    toast(errorText(error), "error");
    return [] as PremiumGift[];
  }
  return (data ?? []) as PremiumGift[];
}

export async function redeemPremiumGift(code: string) {
  const { data, error } = await supabase.rpc("redeem_premium_gift", { p_code: code });
  if (error) throw new Error(errorText(error));
  return data as { ok: boolean; tier: PremiumTier; days: number; until: string };
}

export async function previewPremiumGift(code: string): Promise<PremiumGiftPreview | null> {
  const { data, error } = await supabase.rpc("premium_gift_preview", { p_code: code });
  if (error || !data) return null;
  return data as PremiumGiftPreview;
}

// ------------------------------------------------------------------ reviewers
/** admins, moderators and members holding the Moderator badge can review releases */
export function canReview() {
  const s = useApp.getState();
  if (!s.userId) return false;
  if (roleRank(s.profiles[s.userId]?.site_role) >= 2) return true;
  return (s.userBadges[s.userId] ?? []).some((id) => s.badges[id]?.key === "moderator");
}
export function useCanReview() {
  return useApp((s) => {
    if (!s.userId) return false;
    if (roleRank(s.profiles[s.userId]?.site_role) >= 2) return true;
    return (s.userBadges[s.userId] ?? []).some((id) => s.badges[id]?.key === "moderator");
  });
}
