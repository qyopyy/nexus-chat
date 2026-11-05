/** DSP destinations for Nexus live distribution (via Tunearo). */

export type DistStore = {
  id: string;
  name: string;
  color: string;
  /** typical time after Tunearo approval until the release can appear */
  eta: string;
  blurb: string;
  featured?: boolean;
};

export const DIST_STORES: DistStore[] = [
  { id: "spotify", name: "Spotify", color: "#1DB954", eta: "1–3 days", blurb: "Editorial + algorithmic playlists", featured: true },
  { id: "apple", name: "Apple Music", color: "#FA243C", eta: "1–3 days", blurb: "Apple Music + iTunes", featured: true },
  { id: "youtube_music", name: "YouTube Music", color: "#FF0000", eta: "2–5 days", blurb: "YouTube Music + Content ID optional", featured: true },
  { id: "amazon", name: "Amazon Music", color: "#25D1DA", eta: "2–5 days", blurb: "Amazon Music Unlimited + Prime", featured: true },
  { id: "deezer", name: "Deezer", color: "#A238FF", eta: "1–4 days", blurb: "Deezer Flow & charts", featured: true },
  { id: "tidal", name: "TIDAL", color: "#111111", eta: "2–5 days", blurb: "HiFi + Masters where available" },
  { id: "tiktok", name: "TikTok", color: "#FE2C55", eta: "1–3 days", blurb: "Sounds for short-form video", featured: true },
  { id: "instagram", name: "Instagram / FB", color: "#E1306C", eta: "1–3 days", blurb: "Reels & Stories music library" },
  { id: "soundcloud", name: "SoundCloud", color: "#FF5500", eta: "1–4 days", blurb: "Fan reposts & discovery" },
  { id: "audiomack", name: "Audiomack", color: "#FFA200", eta: "2–5 days", blurb: "Strong in US / Africa / Caribbean" },
  { id: "pandora", name: "Pandora", color: "#224099", eta: "3–7 days", blurb: "US radio-style discovery" },
  { id: "boomplay", name: "Boomplay", color: "#E21B5A", eta: "3–7 days", blurb: "Africa-focused streaming" },
  { id: "anghami", name: "Anghami", color: "#7B2D8E", eta: "3–7 days", blurb: "MENA streaming" },
  { id: "kkbox", name: "KKBOX", color: "#29C2B2", eta: "3–7 days", blurb: "Asia streaming" },
  { id: "beatport", name: "Beatport", color: "#01FF95", eta: "3–7 days", blurb: "Dance / electronic DJ store" },
  { id: "traxsource", name: "Traxsource", color: "#FF6A00", eta: "3–7 days", blurb: "House & soulful DJ store" },
  { id: "bandcamp", name: "Bandcamp", color: "#1DA0C3", eta: "1–3 days", blurb: "Direct-to-fan sales" },
  { id: "shazam", name: "Shazam", color: "#0088FF", eta: "with Apple", blurb: "ID catalog via Apple Music" },
];

export const FEATURED_STORES = DIST_STORES.filter((s) => s.featured);

/** Rough pipeline stages shown on the live service board */
export const DELIVERY_STAGES = [
  { id: "submit", label: "Submit", hint: "You send the release for Nexus review" },
  { id: "review", label: "Label review", hint: "Admin checks audio, art, metadata & rights" },
  { id: "deliver", label: "Deliver", hint: "Files go to Tunearo → DSPs" },
  { id: "live", label: "Live", hint: "Streaming on 150+ stores worldwide" },
] as const;

export function stageForStatus(status: string): (typeof DELIVERY_STAGES)[number]["id"] {
  if (status === "live") return "live";
  if (["sending", "pending", "approved"].includes(status)) return "deliver";
  if (["in_review"].includes(status)) return "review";
  return "submit";
}
