/** Nexus plan catalogue — plain data, safe to import from server components (SEO / JSON-LD). */
import type { PremiumTier } from "./types";

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
    perks: [
      "⚡ Lighting badge next to your name",
      "Animated profile backgrounds, borders & themes",
      "Files up to 5 GB in chats (free: 1 GB)",
      "Original-quality photos & videos — no compression",
      "HD voice messages (256 kbps) + Studio mode for music",
      "1080p / 60fps HD camera in calls",
      "Messages up to 8,000 characters (free: 4,000)",
      "Support Nexus 💜",
    ],
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

/** Wump Plus — sold & gifted like the Nexus plans but separate from the plan ladder (Nexus Premium and up include it). */
export type GiftTier = PremiumTier | "wump_plus";
export type SellPlan = Omit<Plan, "id"> & { id: GiftTier };
export const WUMP_PLUS_PLAN: SellPlan = {
  id: "wump_plus",
  rank: 0,
  name: "Wump Plus",
  short: "Wump Plus",
  price: 2.99,
  color: "#facc15",
  emoji: "📍",
  perks: [
    "✦ Plus badge on your Wump profile and a glowing map pin",
    "Custom map pin emoji & color",
    "Custom profile banner color",
    "See who viewed your profile",
    "Browse privately — stay off other people’s viewer lists",
    "Satellite, hybrid & outdoors HD map styles",
    "Included with Nexus Lighting Premium and up",
  ],
};
export const GIFT_PLANS: SellPlan[] = [...PLANS, WUMP_PLUS_PLAN];
export const anyPlan = (id?: string | null): SellPlan | null => GIFT_PLANS.find((p) => p.id === id) ?? null;
