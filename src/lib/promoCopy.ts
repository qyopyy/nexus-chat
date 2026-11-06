/** Rotating Instagram / TikTok promo templates for Nexus. */

export type PromoKind = "story" | "reel" | "tiktok";

export type PromoPiece = {
  id: string;
  kind: PromoKind;
  title: string;
  caption: string;
  hook: string;
  hashtags: string[];
  cta: string;
};

const BASE_TAGS = ["#Nexus", "#NexusApp", "#MusicApp", "#Creators", "#IndieArtist"];

const POOL: Omit<PromoPiece, "id">[] = [
  {
    kind: "story",
    title: "Drop your link-in-bio",
    hook: "One link. All your music.",
    caption: "Nexus Link is the glow-up your bio needed — themes, music embeds, live status.",
    hashtags: ["#LinkInBio", "#MusicPromo"],
    cta: "Try Nexus → nexusproject.cc",
  },
  {
    kind: "reel",
    title: "Chat that feels alive",
    hook: "Calls so clean they feel studio.",
    caption: "Crystal voice, soundboard, reactions — Nexus chat isn’t just texting.",
    hashtags: ["#VoiceChat", "#StudioQuality"],
    cta: "Download Nexus · nexusproject.cc",
  },
  {
    kind: "tiktok",
    title: "Producer workflow",
    hook: "POV: you ship a release without leaving Nexus.",
    caption: "ISRC · UPC · Drive · Distro tools in one place. Built for artists who move fast.",
    hashtags: ["#ProducerLife", "#MusicDistribution", "#FLStudio"],
    cta: "Join Nexus free → nexusproject.cc",
  },
  {
    kind: "story",
    title: "Wump Live",
    hook: "See who’s nearby — privately.",
    caption: "Wump on Nexus: real map pins, invite links, privacy radius. Friends IRL, safely.",
    hashtags: ["#Wump", "#Friends"],
    cta: "Open Wump in Nexus",
  },
  {
    kind: "reel",
    title: "NexusGram Shorts",
    hook: "Post the clip. Tag the vibe.",
    caption: "Shorts, stories, moods, genres — NexusGram is where the culture lands.",
    hashtags: ["#NexusGram", "#Shorts"],
    cta: "Post on NexusGram today",
  },
  {
    kind: "tiktok",
    title: "Gift Lighting",
    hook: "Gift premium like Nitro.",
    caption: "Admins & mods can drop a Lighting gift link — friends claim in one tap.",
    hashtags: ["#Premium", "#Gift"],
    cta: "Claim gifts inside Nexus",
  },
  {
    kind: "story",
    title: "Drive forever",
    hook: "Unlimited private Drive.",
    caption: "Masters, stems, zips — Nexus Drive with share links. No “storage almost full.”",
    hashtags: ["#CloudStorage", "#Producers"],
    cta: "Upload to Nexus Drive",
  },
  {
    kind: "reel",
    title: "Go Live",
    hook: "Host. Chat. Share the watch link.",
    caption: "Nexus Live — HD streams with chat baked in. Share and they’re watching.",
    hashtags: ["#LiveStream", "#GoLive"],
    cta: "Start a stream in Nexus",
  },
  {
    kind: "tiktok",
    title: "Browser + Shields",
    hook: "Search without the trackers.",
    caption: "Nexus Browser with Brave-style shields and private DNS. Built into the app.",
    hashtags: ["#Privacy", "#Browser"],
    cta: "Open Nexus Browser",
  },
  {
    kind: "story",
    title: "Daily creator tip",
    hook: "Ship something today.",
    caption: "Open Apps → tools for UPC, pitch sheets, metronome, image studio. Create in Nexus.",
    hashtags: ["#CreateDaily", "#Indie"],
    cta: "Open Nexus Apps",
  },
  {
    kind: "reel",
    title: "Soundboard flex",
    hook: "Drop the meme in voice.",
    caption: "Pin 3 soundboard pads on the call bar. Chaos, but controlled.",
    hashtags: ["#Soundboard", "#VC"],
    cta: "Join a Nexus call",
  },
  {
    kind: "tiktok",
    title: "Why Nexus",
    hook: "Discord energy × Spotify tools × Drive.",
    caption: "Chat, calls, music ID, Distro, Gram, Live — one login. That’s Nexus.",
    hashtags: ["#AllInOne", "#CreatorTools"],
    cta: "nexusproject.cc",
  },
];

/** Deterministic “today’s” three pieces (story / reel / tiktok) from the calendar day. */
export function todaysPromos(date = new Date()): PromoPiece[] {
  const day = Math.floor(date.getTime() / 86_400_000);
  const byKind: PromoKind[] = ["story", "reel", "tiktok"];
  return byKind.map((kind, i) => {
    const pool = POOL.filter((p) => p.kind === kind);
    const pick = pool[(day + i) % pool.length]!;
    return {
      ...pick,
      id: `${kind}-${day}`,
      hashtags: [...BASE_TAGS, ...pick.hashtags],
    };
  });
}

export function allPromoPool(): PromoPiece[] {
  return POOL.map((p, i) => ({ ...p, id: `pool-${i}`, hashtags: [...BASE_TAGS, ...p.hashtags] }));
}

export function formatPromo(p: PromoPiece) {
  return `${p.hook}\n\n${p.caption}\n\n${p.cta}\n\n${p.hashtags.join(" ")}`;
}

/** Gift link share text for DMs / stories. */
export function giftShareText(url: string, days: number, planLabel = "Nexus Lighting") {
  return `🎁 You've been gifted ${days} day${days === 1 ? "" : "s"} of ${planLabel} on Nexus!\n\nClaim here (sign in first):\n${url}\n\n#Nexus #Gift`;
}
