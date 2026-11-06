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

export type LinkBioLink = { type?: string; url: string; label?: string };

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
  view_count: number;
  created_at?: string;
  updated_at?: string;
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
  view_count: number;
  owner_username: string;
  updated_at: string;
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

export function openLinkBio() {
  useApp.setState(
    typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches
      ? { mobileTab: "apps", hub: "apps", appsTool: "linkbio", mobileSidebar: true }
      : { hub: "apps", appsTool: "linkbio" },
  );
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
  const { data, error } = await supabase.rpc("linkbio_save", { p: patch });
  if (error) {
    toast(errorText(error));
    return null;
  }
  toast("Saved");
  return data as LinkBioPage;
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
