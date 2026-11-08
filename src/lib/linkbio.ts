"use client";

import { supabase, errorText } from "./supabase";
import { useApp, toast } from "@/store/app";

export type LinkBioTheme =
  | "midnight"
  | "juice999"
  | "purple999"
  | "neon"
  | "aurora"
  | "void"
  | "gold"
  | "smoke"
  | "candy"
  | "ocean";

export type LinkBioBackground = "none" | "particles" | "rain" | "smoke" | "stars" | "grid" | "waves" | "999";
export type LinkBioFont = "glow" | "marker" | "display" | "space" | "mono" | "juice";
export type LinkBioButtonStyle = "pill" | "square" | "outline" | "glass";
export type LinkBioLayout = "classic" | "cards" | "minimal";

export type LinkBioLink = {
  type?: string;
  url: string;
  label?: string;
  featured?: boolean;
  /** scheduled links: only shown between these ISO times (either side optional) */
  start?: string | null;
  end?: string | null;
};

/** Spotify "Listening to" snapshot (written by the nowplaying function) */
export type LinkBioNowPlaying = {
  title: string;
  artist: string;
  album?: string | null;
  url?: string | null;
  album_url?: string | null;
  image?: string | null;
  explicit?: boolean;
  progress_ms?: number;
  duration_ms?: number;
  at?: string;
  artists?: { name: string; url: string | null }[];
};

export type LinkBioStatsSeriesDay = { day: string; views: number; clicks: number };

export type LinkBioStats = {
  views: number;
  views_all: number;
  views_period: number;
  clicks: number;
  days: number;
  top: { url: string; hits: number }[];
  series: LinkBioStatsSeriesDay[];
};

export type LinkBioPage = {
  id: string;
  owner_id?: string;
  username: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
  links: LinkBioLink[];
  theme: LinkBioTheme;
  background: LinkBioBackground;
  animated_bg: boolean;
  font: LinkBioFont;
  glow: boolean;
  accent: string | null;
  premium: boolean;
  premium_until?: string | null;
  published?: boolean;
  suspended?: boolean;
  suspend_reason?: string | null;
  view_count: number;
  password_enabled?: boolean;
  password_protected?: boolean;
  button_style?: LinkBioButtonStyle;
  layout?: LinkBioLayout;
  show_views?: boolean;
  show_branding?: boolean;
  show_presence?: boolean;
  nsfw?: boolean;
  seo_title?: string | null;
  seo_description?: string | null;
  banner_url?: string | null;
  music_url?: string | null;
  custom_status?: string | null;
  presence?: { status?: string; online_at?: string | null; hidden?: boolean } | null;
  show_now_playing?: boolean;
  now_playing?: LinkBioNowPlaying | null;
  countdown_at?: string | null;
  countdown_label?: string | null;
  countdown_url?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type LinkBioBadge = {
  key: string;
  name: string;
  icon: string;
  color: string;
  description?: string | null;
  priority?: number;
};

export type LinkBioAdminRow = {
  id: string;
  owner_id: string;
  username: string;
  display_name: string;
  theme: string;
  premium: boolean;
  premium_until: string | null;
  published: boolean;
  suspended?: boolean;
  suspend_reason?: string | null;
  nsfw?: boolean;
  links_count?: number;
  view_count: number;
  owner_username: string;
  owner_role?: string | null;
  verified?: boolean;
  badges?: LinkBioBadge[];
  updated_at: string;
};

export type LinkBioNetwork = {
  pages_live: number;
  pages_suspended: number;
  views_total: number;
  clicks_24h: number;
  events: { id: number; kind: string; username: string | null; detail: string | null; created_at: string }[];
  blocked_hosts: { host: string; reason: string | null; created_at: string }[];
  top_pages: { username: string; view_count: number; published: boolean; suspended: boolean }[];
  protect?: { malware?: boolean; ddos_rate_limit?: boolean; security_headers?: boolean; link_scan?: boolean };
};

/** Quick-grant badges shown in Nexus Link admin (verified is separate). */
export const LINKBIO_ADMIN_BADGE_KEYS = [
  "founder",
  "vip",
  "premium",
  "certified",
  "creator",
  "legend",
  "partner",
  "artist",
  "producer",
  "streaming",
  "label",
  "influencer",
  "nexus_link",
  "staff",
  "community",
  "news",
  "supporter",
  "beta",
  "og",
  "early",
  "developer",
  "moderator",
  "admin",
  "friend",
  "high_profile",
  "booster",
  "bughunter",
] as const;

export type LinkBioInvite = {
  id: string;
  code: string;
  note: string | null;
  max_uses: number;
  uses: number;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

export const LINKBIO_THEMES: { id: LinkBioTheme; name: string; tag: string; premium?: boolean }[] = [
  { id: "juice999", name: "Juice 999", tag: "purple glow · forever", premium: true },
  { id: "purple999", name: "999 Night", tag: "black / violet", premium: true },
  { id: "midnight", name: "Midnight", tag: "clean dark" },
  { id: "neon", name: "Neon", tag: "cyan pulse" },
  { id: "aurora", name: "Aurora", tag: "soft gradients" },
  { id: "void", name: "Void", tag: "AMOLED black" },
  { id: "gold", name: "Gold", tag: "warm shine", premium: true },
  { id: "smoke", name: "Smoke", tag: "grey haze" },
  { id: "candy", name: "Candy", tag: "pink pop" },
  { id: "ocean", name: "Ocean", tag: "deep blue" },
];

export const LINKBIO_BACKGROUNDS: { id: LinkBioBackground; name: string; premium?: boolean }[] = [
  { id: "particles", name: "Particles" },
  { id: "stars", name: "Stars" },
  { id: "rain", name: "Rain" },
  { id: "smoke", name: "Smoke" },
  { id: "grid", name: "Grid" },
  { id: "waves", name: "Waves", premium: true },
  { id: "999", name: "999 Field", premium: true },
  { id: "none", name: "None" },
];

export const LINKBIO_FONTS: { id: LinkBioFont; name: string; premium?: boolean }[] = [
  { id: "glow", name: "Glow" },
  { id: "juice", name: "999 Juice", premium: true },
  { id: "marker", name: "Marker" },
  { id: "display", name: "Display" },
  { id: "space", name: "Space" },
  { id: "mono", name: "Mono" },
];

export const LINKBIO_BUTTONS: { id: LinkBioButtonStyle; name: string }[] = [
  { id: "pill", name: "Pill" },
  { id: "square", name: "Square" },
  { id: "outline", name: "Outline" },
  { id: "glass", name: "Glass" },
];

export const LINKBIO_LAYOUTS: { id: LinkBioLayout; name: string }[] = [
  { id: "classic", name: "Classic" },
  { id: "cards", name: "Cards" },
  { id: "minimal", name: "Minimal" },
];

export function openLinkBio() {
  if (typeof window !== "undefined" && /LinkBioApp|NexusLink/i.test(navigator.userAgent)) {
    if (!window.location.pathname.startsWith("/bio/app") && !window.location.pathname.startsWith("/bio/admin")) {
      window.location.href = "/bio/app";
      return;
    }
  }
  useApp.setState(
    typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches
      ? { mobileTab: "apps", hub: "apps", appsTool: "linkbio", mobileSidebar: true }
      : { hub: "apps", appsTool: "linkbio" },
  );
}

/** Sideloadly / AltStore releases for the standalone Nexus Link IPA. */
export function linkBioIpaReleasesUrl() {
  return "https://github.com/qyopyy/nexus-chat/releases?q=Nexus+Link+iOS&expanded=true";
}

export function publicLinkBioUrl(username: string) {
  if (typeof window !== "undefined") return `${window.location.origin}/bio/${encodeURIComponent(username)}`;
  return `/bio/${encodeURIComponent(username)}`;
}

export async function linkbioMine(): Promise<LinkBioPage | null> {
  const { data, error } = await supabase.rpc("linkbio_mine");
  if (error) {
    toast(errorText(error));
    return null;
  }
  return data as LinkBioPage;
}

export async function linkbioSave(patch: Record<string, unknown>): Promise<LinkBioPage | null> {
  if (Array.isArray(patch.links)) {
    const { scanLinkList } = await import("./linkProtect");
    const scan = scanLinkList(patch.links as { url?: string }[]);
    if (!scan.ok) {
      toast(scan.reason, "error");
      return null;
    }
  }
  for (const key of ["avatar_url", "banner_url", "music_url"] as const) {
    const v = patch[key];
    if (typeof v === "string" && v.trim()) {
      const { scanLinkUrl } = await import("./linkProtect");
      const scan = scanLinkUrl(v);
      if (!scan.ok) {
        toast(scan.reason, "error");
        return null;
      }
    }
  }
  const { data, error } = await supabase.rpc("linkbio_save", { p: patch });
  if (error) {
    toast(errorText(error));
    return null;
  }
  toast("Saved");
  return data as LinkBioPage;
}

/** Spotify card + release countdown (separate RPC so the main save stays unchanged) */
export async function linkbioSaveExtras(patch: { show_now_playing?: boolean; countdown_at?: string | null; countdown_label?: string | null; countdown_url?: string | null }) {
  const { data, error } = await supabase.rpc("linkbio_save_extras", { p: patch });
  if (error) {
    toast(errorText(error), "error");
    return null;
  }
  toast("Saved");
  return data as LinkBioPage;
}

/** is a scheduled link live right now? */
export function linkIsLive(l: Pick<LinkBioLink, "start" | "end">, now = Date.now()) {
  const s = l.start ? Date.parse(l.start) : NaN;
  const e = l.end ? Date.parse(l.end) : NaN;
  return !(Number.isFinite(s) && now < s) && !(Number.isFinite(e) && now >= e);
}

export async function linkbioStats(days = 7): Promise<LinkBioStats | null> {
  const { data, error } = await supabase.rpc("linkbio_stats", { p_days: days });
  if (error) {
    toast(errorText(error));
    return null;
  }
  const raw = data as {
    views?: number;
    views_all?: number;
    views_period?: number;
    clicks?: number;
    days?: number;
    top?: { url: string; hits: number }[];
    series?: LinkBioStatsSeriesDay[];
  };
  const viewsAll = Number(raw?.views_all ?? raw?.views ?? 0);
  return {
    views: viewsAll,
    views_all: viewsAll,
    views_period: Number(raw?.views_period ?? 0),
    clicks: Number(raw?.clicks ?? 0),
    days: Number(raw?.days ?? days),
    top: Array.isArray(raw?.top) ? raw.top : [],
    series: Array.isArray(raw?.series)
      ? raw.series.map((d) => ({
          day: String(d.day),
          views: Number(d.views ?? 0),
          clicks: Number(d.clicks ?? 0),
        }))
      : [],
  };
}

export async function linkbioAdminList(): Promise<LinkBioAdminRow[]> {
  const { data, error } = await supabase.rpc("linkbio_admin_list");
  if (error) {
    toast(errorText(error));
    return [];
  }
  return (data as LinkBioAdminRow[]) ?? [];
}

export async function linkbioAdminSetUsername(id: string, username: string) {
  const { data, error } = await supabase.rpc("linkbio_admin_set_username", { p_id: id, p_username: username });
  if (error) {
    toast(errorText(error));
    return null;
  }
  toast("Username updated");
  return data as LinkBioAdminRow[];
}

export async function linkbioAdminSetPremium(id: string, on: boolean, until?: string | null) {
  const { data, error } = await supabase.rpc("linkbio_admin_set_premium", {
    p_id: id,
    p_on: on,
    p_until: until ?? (on ? "2099-12-31T23:59:59Z" : null),
  });
  if (error) {
    toast(errorText(error));
    return null;
  }
  toast(on ? "Premium granted" : "Premium removed");
  return data as LinkBioAdminRow[];
}

export async function linkbioAdminSetBadge(ownerId: string, badgeKey: string, on: boolean) {
  const { data, error } = await supabase.rpc("linkbio_admin_set_badge", {
    p_owner: ownerId,
    p_badge_key: badgeKey,
    p_on: on,
  });
  if (error) {
    toast(errorText(error));
    return null;
  }
  toast(on ? `${badgeKey} granted` : `${badgeKey} removed`);
  return data as LinkBioAdminRow[];
}

export async function linkbioInviteCheck(code: string) {
  const { data, error } = await supabase.rpc("linkbio_invite_check", { p_code: code.trim().toUpperCase() });
  if (error) return { ok: false as const, error: errorText(error) };
  return data as { ok: boolean; error?: string; code?: string; remaining?: number };
}

export async function linkbioInviteRedeem(code: string) {
  const { data, error } = await supabase.rpc("linkbio_invite_redeem", { p_code: code.trim().toUpperCase() });
  if (error) {
    toast(errorText(error));
    return null;
  }
  return data as { ok: boolean; already?: boolean };
}

export async function linkbioInviteList(): Promise<LinkBioInvite[]> {
  const { data, error } = await supabase.rpc("linkbio_invite_list");
  if (error) {
    toast(errorText(error));
    return [];
  }
  return (data as LinkBioInvite[]) ?? [];
}

export async function linkbioInviteCreate(maxUses = 1, note?: string, days = 30) {
  const { data, error } = await supabase.rpc("linkbio_invite_create", {
    p_max_uses: maxUses,
    p_note: note ?? null,
    p_days: days,
  });
  if (error) {
    toast(errorText(error));
    return null;
  }
  toast("Invite created");
  return data as { id: string; code: string; max_uses: number; uses: number; expires_at: string | null; note: string | null };
}

export async function linkbioAdminSuspend(id: string, on: boolean, reason?: string) {
  const { data, error } = await supabase.rpc("linkbio_admin_suspend", {
    p_id: id,
    p_on: on,
    p_reason: reason ?? null,
  });
  if (error) {
    toast(errorText(error));
    return null;
  }
  toast(on ? "Page suspended" : "Page unsuspended", "success");
  return data as LinkBioAdminRow[];
}

export async function linkbioAdminSetPublished(id: string, on: boolean) {
  const { data, error } = await supabase.rpc("linkbio_admin_set_published", { p_id: id, p_on: on });
  if (error) {
    toast(errorText(error));
    return null;
  }
  return data as LinkBioAdminRow[];
}

export async function linkbioAdminClearLinks(id: string) {
  const { data, error } = await supabase.rpc("linkbio_admin_clear_links", { p_id: id });
  if (error) {
    toast(errorText(error));
    return null;
  }
  toast("Links cleared", "success");
  return data as LinkBioAdminRow[];
}

export async function linkbioAdminNetwork(): Promise<LinkBioNetwork | null> {
  const { data, error } = await supabase.rpc("linkbio_admin_network");
  if (error) {
    toast(errorText(error));
    return null;
  }
  return data as LinkBioNetwork;
}

export async function linkbioAdminBlockHost(host: string, reason?: string) {
  const { data, error } = await supabase.rpc("linkbio_admin_block_host", {
    p_host: host,
    p_reason: reason ?? null,
  });
  if (error) {
    toast(errorText(error));
    return null;
  }
  toast(`Blocked ${host}`, "success");
  return data as LinkBioNetwork;
}

export async function linkbioAdminUnblockHost(host: string) {
  const { data, error } = await supabase.rpc("linkbio_admin_unblock_host", { p_host: host });
  if (error) {
    toast(errorText(error));
    return null;
  }
  toast(`Unblocked ${host}`, "success");
  return data as LinkBioNetwork;
}

export async function linkbioInviteRevoke(id: string) {
  const { data, error } = await supabase.rpc("linkbio_invite_revoke", { p_id: id });
  if (error) {
    toast(errorText(error));
    return null;
  }
  toast("Invite revoked");
  return data as LinkBioInvite[];
}

const MUSIC_MAX = 1024 * 1024 * 1024;

function linkbioAudioType(file: File) {
  const t = (file.type || "").toLowerCase();
  if (t.startsWith("audio/")) return t === "audio/mp3" ? "audio/mpeg" : t;
  const n = file.name.toLowerCase();
  if (n.endsWith(".mp3")) return "audio/mpeg";
  if (n.endsWith(".wav")) return "audio/wav";
  if (n.endsWith(".m4a") || n.endsWith(".mp4")) return "audio/mp4";
  if (n.endsWith(".aac")) return "audio/aac";
  if (n.endsWith(".ogg")) return "audio/ogg";
  if (n.endsWith(".flac")) return "audio/flac";
  if (n.endsWith(".webm")) return "audio/webm";
  return "";
}

/** Upload an audio file for the Link page and return a public HTTPS URL. */
export async function linkbioUploadMusic(file: File): Promise<string | null> {
  const me = useApp.getState().userId;
  if (!me) {
    toast("Sign in to upload music", "error");
    return null;
  }
  const contentType = linkbioAudioType(file);
  if (!contentType && !/\.(mp3|wav|m4a|aac|ogg|flac|webm)$/i.test(file.name)) {
    toast("Pick an audio file (mp3, wav, m4a…)", "error");
    return null;
  }
  if (file.size <= 0) {
    toast("That file is empty", "error");
    return null;
  }
  if (file.size > MUSIC_MAX) {
    toast("Music uploads can be up to 1 GB", "error");
    return null;
  }
  try {
    const { malwareGate } = await import("./malwareGuard");
    if (await malwareGate(file, { fileName: file.name, context: "audio" })) return null;
  } catch {
    /* optional */
  }
  const mime = contentType || "audio/mpeg";
  const safe = (file.name || "track.mp3").replace(/[^\w.\-]+/g, "_").slice(-80) || "track.mp3";
  const path = `${me}/${crypto.randomUUID()}-${safe}`;
  const body = (() => {
    try {
      return new File([file], safe, { type: mime, lastModified: file.lastModified || Date.now() });
    } catch {
      return file;
    }
  })();
  const { error } = await supabase.storage.from("linkbio-music").upload(path, body, {
    contentType: mime,
    upsert: false,
    cacheControl: "3600",
  });
  if (error) {
    toast(errorText(error) || "Music upload failed", "error");
    return null;
  }
  const { data } = supabase.storage.from("linkbio-music").getPublicUrl(path);
  const url = data?.publicUrl ?? null;
  if (!url) {
    toast("Couldn't get public URL for upload", "error");
    return null;
  }
  toast("Music uploaded", "success");
  return url;
}
