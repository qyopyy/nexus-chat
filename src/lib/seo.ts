/** Shared SEO helpers for Nexus public pages */

export const SITE = {
  name: "Nexus",
  gram: "NexusGram",
  url: process.env.NEXT_PUBLIC_SITE_URL || "https://nexusproject.cc",
  tagline: "Chat, voice, video, NexusGram, Live, Radio — one place for your friends.",
  gramTagline: "Photos, Shorts, and Stories on NexusGram.",
  twitter: "@nexusproject",
  /** Default Open Graph / Twitter share image (1200×630) */
  ogImage: "/og-image.jpg",
  /** Full-size app icon */
  icon1024: "/icon-1024.png",
  icon512: "/icon-512.png",
  credit: "Made with ❤️ by Nexus Project / qyopy",
  makers: { org: "Nexus Project", handle: "qyopy" },
} as const;

export const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function absoluteUrl(path: string, origin?: string) {
  const base = (origin || SITE.url).replace(/\/$/, "");
  if (/^https?:\/\//i.test(path)) return path;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Canonical invite / share link for the Nexus app itself */
export function shareAppUrl(origin?: string) {
  if (origin) return absoluteUrl("/", origin);
  if (typeof window !== "undefined" && window.location?.origin) return window.location.origin;
  return SITE.url;
}

export function shareAppText() {
  return `Join me on Nexus — chat, voice, video, NexusGram & more.\n${shareAppUrl()}`;
}

export function truncate(s: string, n = 160) {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  return `${t.slice(0, n - 1).trimEnd()}…`;
}

export function jsonLd(data: Record<string, unknown> | Record<string, unknown>[]) {
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;
}

type MetaOpts = {
  title: string;
  description: string;
  url: string;
  image?: string | null;
  type?: "website" | "article" | "profile";
  siteName?: string;
  keywords?: string[];
  canonical?: string;
  noindex?: boolean;
  publishedTime?: string;
  authorName?: string;
  twitterCard?: "summary" | "summary_large_image";
};

/** Common <head> meta block for public HTML routes */
export function seoHead(opts: MetaOpts) {
  const {
    title,
    description,
    url,
    image,
    type = "website",
    siteName = SITE.gram,
    keywords = [],
    canonical,
    noindex,
    publishedTime,
    authorName,
    twitterCard = image ? "summary_large_image" : "summary",
  } = opts;
  const desc = truncate(description);
  const can = canonical || url;
  const kw = keywords.filter(Boolean).join(", ");
  return `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
${kw ? `<meta name="keywords" content="${esc(kw)}">` : ""}
<meta name="robots" content="${noindex ? "noindex,nofollow" : "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1"}">
<link rel="canonical" href="${esc(can)}">
<meta property="og:locale" content="en_US">
<meta property="og:site_name" content="${esc(siteName)}">
<meta property="og:type" content="${esc(type)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url)}">
${image ? `<meta property="og:image" content="${esc(image)}"><meta property="og:image:alt" content="${esc(title)}">${image.includes("og-image") ? `<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">` : ""}` : ""}
${publishedTime ? `<meta property="article:published_time" content="${esc(publishedTime)}">` : ""}
${authorName ? `<meta property="article:author" content="${esc(authorName)}">` : ""}
<meta name="twitter:card" content="${twitterCard}">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
${image ? `<meta name="twitter:image" content="${esc(image)}">` : ""}
<meta name="theme-color" content="#0b0b0f">
<link rel="icon" href="/icon.png"><link rel="apple-touch-icon" href="/apple-touch-icon.png">`;
}

/** Absolute URL for the default site share / OG image */
export function defaultOgImageUrl(origin?: string) {
  return absoluteUrl(SITE.ogImage, origin);
}

export function socialPostingLd(opts: {
  url: string;
  headline: string;
  description: string;
  image?: string | null;
  datePublished: string;
  authorName: string;
  authorUrl: string;
  interactionStats?: { likes?: number; comments?: number; views?: number };
}) {
  const stats: Record<string, unknown>[] = [];
  if (opts.interactionStats?.likes != null) {
    stats.push({ "@type": "InteractionCounter", interactionType: "https://schema.org/LikeAction", userInteractionCount: opts.interactionStats.likes });
  }
  if (opts.interactionStats?.comments != null) {
    stats.push({ "@type": "InteractionCounter", interactionType: "https://schema.org/CommentAction", userInteractionCount: opts.interactionStats.comments });
  }
  if (opts.interactionStats?.views != null) {
    stats.push({ "@type": "InteractionCounter", interactionType: "https://schema.org/WatchAction", userInteractionCount: opts.interactionStats.views });
  }
  return {
    "@context": "https://schema.org",
    "@type": "SocialMediaPosting",
    headline: opts.headline,
    description: truncate(opts.description, 300),
    url: opts.url,
    mainEntityOfPage: opts.url,
    datePublished: opts.datePublished,
    author: { "@type": "Person", name: opts.authorName, url: opts.authorUrl },
    publisher: { "@type": "Organization", name: SITE.gram, url: SITE.url },
    ...(opts.image ? { image: [opts.image] } : {}),
    ...(stats.length ? { interactionStatistic: stats } : {}),
  };
}

export function personLd(opts: {
  name: string;
  username: string;
  url: string;
  image?: string | null;
  description?: string | null;
  followers?: number;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: opts.name,
    alternateName: `@${opts.username}`,
    url: opts.url,
    ...(opts.image ? { image: opts.image } : {}),
    ...(opts.description ? { description: truncate(opts.description, 300) } : {}),
    ...(opts.followers != null
      ? {
          interactionStatistic: {
            "@type": "InteractionCounter",
            interactionType: "https://schema.org/FollowAction",
            userInteractionCount: opts.followers,
          },
        }
      : {}),
  };
}
