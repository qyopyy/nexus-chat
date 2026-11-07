/** what Nexus does — shown on the homepage and /features */
export type Feature = { emoji: string; title: string; blurb: string; points: string[]; color: string };

export const FEATURES: Feature[] = [
  {
    emoji: "💬",
    title: "Chat that feels alive",
    blurb: "DMs, groups and servers with everything you'd expect — and a lot you wouldn't.",
    points: ["Voice messages, polls, stickers & GIFs", "Message effects, reactions and replies", "Scheduled messages and disappearing timers", "Muted words, blocking and reports"],
    color: "#5865f2",
  },
  {
    emoji: "📞",
    title: "HD calls & screen share",
    blurb: "Crystal voice up to 510 kbps, video calls and screen share up to 4K.",
    points: ["Watch YouTube, Instagram & NexusGram together", "Play multiplayer games right from a call", "Per-person volume up to 400%", "Soundboard, reactions and noise suppression"],
    color: "#36d39a",
  },
  {
    emoji: "📸",
    title: "NexusGram",
    blurb: "Posts, Shorts and stories from your friends — built right into your chats.",
    points: ["Photo & video posts", "Vertical Shorts feed", "Share to any chat in one tap", "Public profiles with link-in-bio"],
    color: "#ff2bd6",
  },
  {
    emoji: "🎵",
    title: "Music & creator tools",
    blurb: "Release, protect and promote your music without leaving Nexus.",
    points: ["Distribution with ISRC & UPC", "Smart links and release countdowns", "Takedown Shield monitoring", "Artist profiles with Spotify & more"],
    color: "#ff9f1c",
  },
  {
    emoji: "🎮",
    title: "Games",
    blurb: "Jump into a match with friends — no downloads.",
    points: ["Global Strike & Classic Strike shooters", "Neon Streets open-city driving", "GeoGuess, Flappy Race, Four in a Row", "Beat Battle rhythm game"],
    color: "#00c2ff",
  },
  {
    emoji: "🛡️",
    title: "Servers & safety",
    blurb: "Run a community with the tools big platforms use.",
    points: ["AutoMod, slowmode and roles", "Onboarding, auto-roles and level rewards", "Reports reviewed by the Nexus team", "Two-factor sign-in and passkeys"],
    color: "#eb459e",
  },
  {
    emoji: "📍",
    title: "Wump live map",
    blurb: "See where friends are — only when they choose to share.",
    points: ["Friends, family or everyone nearby", "Exact, approximate or city precision", "Nearby alerts", "Standalone iPhone app"],
    color: "#8b5cff",
  },
  {
    emoji: "⚡",
    title: "Nexus Lighting",
    blurb: "Premium plans that make everything sharper.",
    points: ["Original-quality photos & videos", "HD & Studio voice messages", "1080p60 camera, 8,000-character messages", "Animated profiles and 5 GB uploads"],
    color: "#ffd400",
  },
];

export const NAV = [
  { href: "/", label: "Home" },
  { href: "/features", label: "Features" },
  { href: "/download", label: "Download" },
  { href: "/about", label: "About us" },
  { href: "/contact", label: "Contact" },
];

/** artists on the Nexus / Audia roster — shown on About us and the homepage */
export const ARTISTS: { name: string; colors: [string, string] }[] = [
  { name: "qyopy", colors: ["#5865f2", "#8b5cff"] },
  { name: "MA Beats", colors: ["#ff2bd6", "#ff7a59"] },
  { name: "ciaffa", colors: ["#00c2ff", "#36d39a"] },
  { name: "void", colors: ["#2b2d31", "#8b5cff"] },
  { name: "kicsiden", colors: ["#ffd400", "#ff9f1c"] },
  { name: "twxn", colors: ["#eb459e", "#5865f2"] },
];
