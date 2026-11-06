/** Nexus Link as an eligible website for TikTok / Snapchat / Facebook verification. */

export type SocialVerifyPlatform = "tiktok" | "snapchat" | "facebook";

export type SocialVerifyGuide = {
  id: SocialVerifyPlatform;
  name: string;
  short: string;
  color: string;
  emoji: string;
  badge: string;
  applyUrl: string;
  applyLabel: string;
  /** Why Nexus Link counts as a website on their form */
  eligible: string;
  reqs: string[];
  steps: string[];
  tips: string[];
};

export const SOCIAL_VERIFY: Record<SocialVerifyPlatform, SocialVerifyGuide> = {
  tiktok: {
    id: "tiktok",
    name: "TikTok verification",
    short: "TikTok",
    color: "#FE2C55",
    emoji: "♪",
    badge: "Blue check",
    applyUrl: "https://www.tiktok.com/setting/verification",
    applyLabel: "Open TikTok Verification",
    eligible:
      "TikTok asks for a public website or press links that match your name. Your Nexus Link page (/bio/you) is a real HTTPS profile page with your name, photo, bio, and socials — paste it as Website.",
    reqs: [
      "Public TikTok account with name, photo, bio, and at least one post",
      "Active in the last 6 months + 2-step verification on",
      "Authentic identity (real person, brand, or institution)",
      "Notable coverage in multiple news sources (not paid press)",
      "A matching public website — Nexus Link qualifies",
    ],
    steps: [
      "Publish your Nexus Link with the same display name as TikTok",
      "Add your TikTok URL as a link on the page (and other socials)",
      "Copy your /bio/… URL into TikTok → Settings → Verification → Website",
      "Attach news articles that mention you under the same name",
      "Submit and wait for TikTok’s in-app decision (usually within 30 days)",
    ],
    tips: [
      "Username and display name should closely match your Nexus Link title",
      "Don’t password-protect the page while your application is open",
      "Keep the page published for the whole review window",
    ],
  },
  snapchat: {
    id: "snapchat",
    name: "Snapchat Public Profile",
    short: "Snapchat",
    color: "#FFFC00",
    emoji: "👻",
    badge: "Yellow star",
    applyUrl: "https://businesshelp.snapchat.com/s/article/public-profile-verify",
    applyLabel: "Snapchat verification guide",
    eligible:
      "Snap Public Profiles and business applications look for a real brand presence online. Nexus Link is a public brand page you control — use it as Website / official link next to your Snap profile.",
    reqs: [
      "Public Profile set up as a General Business (or eligible creator) profile",
      "Profile photo + display name identical to your brand in market",
      "Verified email on the Snap account",
      "Authentic registered business or notable public figure",
      "Public website or link hub — Nexus Link is eligible",
    ],
    steps: [
      "Sync Nexus Link display name to match your Snap Public Profile exactly",
      "Add Snapchat (snapchat.com/add/…) as a link on your Nexus page",
      "Publish the page and copy the /bio URL into Snap’s website / contact fields",
      "Work with Snap Ads / account team when required for business star verification",
      "Keep branded content active on Snap while the review runs",
    ],
    tips: [
      "Snap Stars (creators) and Business yellow-star paths differ — use the matching guide",
      "Yellow star often needs an active Snap ads relationship for businesses",
      "Leave Nexus Link public (no page password) during review",
    ],
  },
  facebook: {
    id: "facebook",
    name: "Facebook / Meta verification",
    short: "Facebook",
    color: "#1877F2",
    emoji: "f",
    badge: "Blue badge",
    applyUrl: "https://www.facebook.com/settings?tab=account_verification",
    applyLabel: "Facebook verification settings",
    eligible:
      "Meta’s notable blue badge and Page verification ask for a complete public presence. Your Nexus Link page works as the Website on the Page and on the verification form (alongside news links).",
    reqs: [
      "Public Page or profile with About, photo, bio, and posts",
      "Authentic, unique presence for a real person, brand, or entity",
      "Well-known / highly searched (notable badge) or Meta Verified path",
      "Website field filled with a matching public URL — Nexus Link qualifies",
      "Follow Meta Terms and Community Standards",
    ],
    steps: [
      "Put the same legal / brand name on Nexus Link and your Facebook Page",
      "Add Facebook (and Instagram if you have it) as links on Nexus Link",
      "Set Page → About → Website to your /bio/… URL",
      "Apply via Meta Verified, notable badge, or Page verification with press links",
      "Keep the Nexus page published and unlocked while Meta reviews",
    ],
    tips: [
      "Meta Verified (paid) and notable blue badge are different products — pick the right one",
      "sameAs social links on your Nexus page help reviewers match identities",
      "Avoid NSFW / password gates on the page during the application",
    ],
  },
};

export const SOCIAL_VERIFY_LIST = Object.values(SOCIAL_VERIFY);

/** Checklist that a Nexus Link page is ready to paste into platform verification forms. */
export function linkVerifyReadiness(page: {
  published?: boolean;
  password_enabled?: boolean;
  display_name?: string | null;
  bio?: string | null;
  avatar_url?: string | null;
  links?: { type?: string; url?: string }[] | null;
  nsfw?: boolean;
}) {
  const links = page.links ?? [];
  const hasSocial = (id: string) => links.some((l) => (l.type || "").toLowerCase() === id || (l.url || "").toLowerCase().includes(id));
  return [
    { ok: page.published !== false, label: "Page published", tip: "Turn Published on so reviewers can open the URL." },
    { ok: !page.password_enabled, label: "Not password-protected", tip: "Unlock the page while your verification request is open." },
    { ok: Boolean(page.display_name?.trim()), label: "Display name set", tip: "Must match the name on TikTok / Snap / Facebook." },
    { ok: Boolean(page.avatar_url), label: "Avatar / photo", tip: "Use the same face or logo as the social profile." },
    { ok: Boolean(page.bio?.trim()), label: "Bio filled", tip: "A short About text makes the page look complete." },
    { ok: links.length >= 1, label: "At least one link", tip: "Add the platform you’re verifying plus other socials." },
    { ok: hasSocial("tiktok") || hasSocial("snapchat") || hasSocial("facebook") || hasSocial("instagram"), label: "Social profile linked", tip: "Add TikTok, Snapchat, Facebook, or Instagram on the page." },
    { ok: !page.nsfw, label: "Not marked 18+", tip: "NSFW pages can get flagged during review — unmark if possible." },
  ];
}
