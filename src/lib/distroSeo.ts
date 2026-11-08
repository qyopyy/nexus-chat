/** SEO copy + structured data for the public distribution pages (/distro and /distro/[store]). Server-safe (no "use client"). */
import { SITE } from "./seo";
import { PLANS } from "./plans";

export const DISTRO = {
  name: "Nexus Distro",
  path: "/distro",
  title: "Music Distribution — Release on Spotify, Apple Music, TikTok & 150+ Stores",
  description:
    "Distribute your music to Spotify, Apple Music, TikTok, YouTube Music, Amazon, Deezer and 150+ stores. Keep 100% of your rights, get free ISRC & UPC codes, smart links, splits, analytics and royalty reports — from one workspace.",
  keywords: [
    "music distribution",
    "distribute music",
    "release music on Spotify",
    "upload music to Apple Music",
    "put music on TikTok",
    "independent artist distribution",
    "music distributor",
    "free ISRC codes",
    "UPC codes for music",
    "royalty splits",
    "smart links",
    "pre-save links",
    "white label music distribution",
    "label distribution",
    "Nexus Distro",
  ],
};

export const DISTRO_FAQ: [string, string][] = [
  ["Do I keep my rights?", "Yes. You own your masters. We only get the permission needed to deliver and collect for you, and you can take a release down whenever you like."],
  ["How long until my release is live?", "Most releases are reviewed within a couple of days and reach the big stores within 1–5 days of approval. Give yourself two to three weeks before the release date so pre-saves and editorial pitching have time to work."],
  ["Which stores do you send to?", "Spotify, Apple Music, TikTok, YouTube Music, Amazon Music, Deezer, Tidal, Instagram & Facebook, Snapchat, SoundCloud and more than 150 other stores and platforms."],
  ["Do I get ISRC and UPC codes?", "Yes — every release gets its UPC and every track its ISRC for free. Already have your own codes? Add them on the release and we use those."],
  ["Can collaborators get paid automatically?", "Yes. Add split sheets per track with each collaborator's share; earnings reports show what everyone is owed."],
  ["Can I use my own label name and logo?", "Yes. Labels can white-label the workspace with their own name, logo, colours and support email, so artists see your brand instead of ours."],
  ["What file formats do I need?", "WAV or FLAC audio (16-bit/44.1 kHz or higher) and a square JPG or PNG cover between 3000×3000 and 5000×5000 pixels."],
];

export type StoreSeo = {
  slug: string;
  name: string;
  color: string;
  headline: string;
  description: string;
  time: string;
  perks: string[];
  tips: string[];
  faq: [string, string][];
};

export const STORE_PAGES: StoreSeo[] = [
  {
    slug: "spotify",
    name: "Spotify",
    color: "#1DB954",
    headline: "Release your music on Spotify",
    description: "Get your songs on Spotify with Nexus Distro — free ISRC & UPC codes, Spotify for Artists access, pre-save links and editorial pitching tips.",
    time: "Usually live on Spotify 1–5 days after approval.",
    perks: ["Your profile verified with Spotify for Artists once the first release is live", "Pre-save links so fans follow before release day", "Lyrics, credits and Canvas-ready releases", "Streams and listener stats in your analytics"],
    tips: ["Deliver at least 3–4 weeks early so you can pitch to Spotify editorial playlists", "Add the artist's Spotify link on the release so it lands on the right profile", "Don't put “feat.” in the title — use the featured artists field"],
    faq: [
      ["How do I get verified on Spotify?", "Once your first release is live, claim your profile in Spotify for Artists. Verification and the blue check follow from there."],
      ["Can I pitch my song to Spotify playlists?", "Yes. When the release is delivered early enough, pitch one unreleased song per release from Spotify for Artists."],
    ],
  },
  {
    slug: "apple-music",
    name: "Apple Music",
    color: "#FA243C",
    headline: "Get your music on Apple Music & iTunes",
    description: "Distribute to Apple Music and iTunes with Nexus Distro — pre-orders, time-synced lyrics, Apple Music for Artists and Shazam included.",
    time: "Usually live on Apple Music within 1–3 days of approval.",
    perks: ["Apple Music and the iTunes Store in every country", "Pre-orders for albums and EPs", "Shazam recognition for every track", "Apple Music for Artists stats"],
    tips: ["Use clean, accurate metadata — Apple style guides are strict about titles and capitalisation", "Album pre-orders work best 2–4 weeks before release"],
    faq: [
      ["Will my song be on Shazam?", "Yes — tracks delivered to Apple Music are recognisable on Shazam."],
      ["Can I set up a pre-order?", "Yes, for EPs and albums with a future release date."],
    ],
  },
  {
    slug: "tiktok",
    name: "TikTok",
    color: "#25F4EE",
    headline: "Put your music on TikTok",
    description: "Get your songs into TikTok's sound library with Nexus Distro, choose the clip start time and get paid when people use your sound.",
    time: "Sounds usually appear in TikTok 2–7 days after approval.",
    perks: ["Your track available as an official sound", "Pick the preview start time (TikTok clip)", "Also delivered to CapCut and other ByteDance apps", "Earnings when videos use your music"],
    tips: ["Choose a TikTok start time on the catchiest 15–60 seconds", "Make sure you own or cleared every sample — TikTok's content ID is strict"],
    faq: [
      ["Do I get paid for TikTok uses?", "Yes. TikTok reports usage and royalties to the distributor and they show up in your earnings."],
      ["Can I choose which part of the song is used?", "Yes — set the TikTok start time on the track."],
    ],
  },
  {
    slug: "youtube-music",
    name: "YouTube Music",
    color: "#FF0000",
    headline: "Release on YouTube Music & YouTube",
    description: "Distribute to YouTube Music with Nexus Distro — auto-generated Art Tracks, an Official Artist Channel path and Content ID monetisation.",
    time: "Usually live on YouTube Music within 2–5 days of approval.",
    perks: ["Art Tracks on YouTube and YouTube Music", "Path to an Official Artist Channel", "Content ID so uploads using your song are monetised", "Shorts audio library access"],
    tips: ["Only opt into Content ID for music you fully own — no non-exclusive beats or samples", "Link your existing channel so we can request the Official Artist Channel merge"],
    faq: [
      ["What is Content ID?", "YouTube's system that finds videos using your recordings so you can earn from them."],
      ["Can I get an Official Artist Channel?", "Yes. After you have releases on YouTube Music, your channels can be merged into one OAC."],
    ],
  },
  {
    slug: "amazon-music",
    name: "Amazon Music",
    color: "#25D1DA",
    headline: "Distribute your music to Amazon Music",
    description: "Get on Amazon Music, Amazon Music Unlimited and Alexa with Nexus Distro — lossless HD and Amazon Music for Artists stats.",
    time: "Usually live on Amazon Music within 1–5 days of approval.",
    perks: ["Amazon Music Unlimited and Prime Music", "Playable on Alexa and Echo devices", "HD and Ultra HD lossless", "Amazon Music for Artists stats"],
    tips: ["Upload 24-bit masters to reach the Ultra HD catalogue"],
    faq: [["Will my music work on Alexa?", "Yes — releases on Amazon Music can be requested by voice on Alexa devices."]],
  },
  {
    slug: "deezer",
    name: "Deezer",
    color: "#A238FF",
    headline: "Release your music on Deezer",
    description: "Distribute to Deezer worldwide with Nexus Distro — lyrics, Flow recommendations and Deezer for Creators.",
    time: "Usually live on Deezer within 1–5 days of approval.",
    perks: ["Deezer in 180+ countries", "Eligible for Flow personalised mixes", "Deezer for Creators profile and stats"],
    tips: ["Claim Deezer for Creators after the first release to update your image and bio"],
    faq: [["How do I claim my Deezer profile?", "Once you're live, request access through Deezer for Creators."]],
  },
  {
    slug: "tidal",
    name: "TIDAL",
    color: "#ffffff",
    headline: "Get your music on TIDAL",
    description: "Distribute to TIDAL with Nexus Distro — lossless and Hi-Res FLAC, Dolby Atmos support and artist credits.",
    time: "Usually live on TIDAL within 2–5 days of approval.",
    perks: ["Lossless and Hi-Res FLAC streaming", "Full songwriter and producer credits", "Dolby Atmos where supplied"],
    tips: ["Fill in every credit — TIDAL displays them prominently"],
    faq: [["Do I need a Hi-Res master?", "No, but 24-bit masters are shown in Hi-Res on TIDAL."]],
  },
  {
    slug: "instagram",
    name: "Instagram & Facebook",
    color: "#E1306C",
    headline: "Put your music on Instagram & Facebook",
    description: "Make your songs usable in Instagram Reels, Stories and Facebook videos with Nexus Distro — and get paid for every use.",
    time: "Usually available in Instagram's music library 2–7 days after approval.",
    perks: ["Your songs in Reels, Stories and Facebook videos", "Lyrics stickers when lyrics are supplied", "Monetised usage via Meta's rights manager"],
    tips: ["Add lyrics so the song can be used with the lyrics sticker"],
    faq: [["Why can't I find my song on Instagram yet?", "The Instagram library updates in batches; give it up to a week after the release is live elsewhere."]],
  },
];
export const storePage = (slug: string) => STORE_PAGES.find((s) => s.slug === slug) ?? null;

const abs = (p: string) => `${SITE.url}${p}`;

/** JSON-LD for /distro — organisation, product with plan offers, FAQ */
export function distroJsonLd() {
  const plans = PLANS.filter((p) => p.rank >= 3);
  return [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: SITE.name,
      url: SITE.url,
      logo: abs(SITE.icon512),
      sameAs: [SITE.instagram.url],
    },
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: DISTRO.name,
      applicationCategory: "MultimediaApplication",
      operatingSystem: "Web, iOS, Android",
      url: abs(DISTRO.path),
      description: DISTRO.description,
      offers: plans.map((p) => ({ "@type": "Offer", name: p.short, price: p.price.toFixed(2), priceCurrency: "USD", url: abs(`${DISTRO.path}#pricing`), category: "subscription" })),
      featureList: ["Distribution to 150+ stores", "Free ISRC and UPC codes", "Royalty splits", "Smart links and pre-saves", "Streaming analytics", "White-label workspaces", "Content ID and leak protection"],
    },
    faqJsonLd(DISTRO_FAQ),
  ];
}

export function faqJsonLd(faq: [string, string][]) {
  return { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) };
}

export function storeJsonLd(s: StoreSeo) {
  return [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: SITE.name, item: SITE.url },
        { "@type": "ListItem", position: 2, name: "Distribution", item: abs(DISTRO.path) },
        { "@type": "ListItem", position: 3, name: s.name, item: abs(`${DISTRO.path}/${s.slug}`) },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "Service",
      name: `Music distribution to ${s.name}`,
      serviceType: "Music distribution",
      provider: { "@type": "Organization", name: SITE.name, url: SITE.url },
      areaServed: "Worldwide",
      url: abs(`${DISTRO.path}/${s.slug}`),
      description: s.description,
    },
    faqJsonLd(s.faq),
  ];
}

/** safe inline <script type="application/ld+json"> payload */
export const ldJson = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c");
