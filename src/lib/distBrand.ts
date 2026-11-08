"use client";

import { create } from "zustand";
import { supabase, errorText } from "./supabase";
import { useApp, toast } from "@/store/app";

export type DistBrand = {
  name: string | null;
  logo_url: string | null;
  accent: string | null;
  tagline: string | null;
  support_email: string | null;
  hide_nexus?: boolean;
  /** 'classic' near-black or '999' red/black; null on a workspace = follow the platform */
  theme?: DxTheme | null;
};
export type DxTheme = "classic" | "999" | "purple999" | "midnight" | "emerald" | "sunset";
/** dark red primary buttons in the 999 theme */
export const THEME_999_ACCENT = "#8b0000";
/** workspace themes — each sets its own surfaces (CSS: .dx[data-dx-theme]) and a default button colour */
export const DX_THEMES: { id: DxTheme; name: string; desc: string; accent: string; swatch: string; mark?: string }[] = [
  { id: "classic", name: "Classic", desc: "White buttons", accent: "#ededed", swatch: "linear-gradient(135deg,#1e1e1e,#0e0e0e)" },
  { id: "999", name: "999", desc: "Dark-red buttons", accent: THEME_999_ACCENT, swatch: "radial-gradient(120% 120% at 50% 0%,#6b0000,#120303 60%,#050101)", mark: "#e10600" },
  { id: "purple999", name: "Purple 999", desc: "Purple buttons", accent: "#7e22ce", swatch: "radial-gradient(120% 120% at 50% 0%,#4c1d95,#12051f 60%,#050108)", mark: "#c084fc" },
  { id: "midnight", name: "Midnight", desc: "Blue buttons", accent: "#2563eb", swatch: "radial-gradient(120% 120% at 50% 0%,#1e3a8a,#070b1a 60%,#03050c)" },
  { id: "emerald", name: "Emerald", desc: "Emerald buttons", accent: "#059669", swatch: "radial-gradient(120% 120% at 50% 0%,#065f46,#03110c 60%,#020806)" },
  { id: "sunset", name: "Sunset", desc: "Amber buttons", accent: "#d97706", swatch: "radial-gradient(120% 120% at 50% 0%,#9a3412,#160a05 60%,#080402)" },
];
export const themeAccent = (t: DxTheme) => DX_THEMES.find((x) => x.id === t)?.accent ?? "#ededed";

/** Nexus default — near-black workspace with white primary actions */
export const DEFAULT_BRAND: Required<Omit<DistBrand, "logo_url" | "support_email" | "tagline" | "theme">> & Pick<DistBrand, "logo_url" | "support_email" | "tagline"> = {
  name: "Nexus Distro",
  logo_url: null,
  accent: "#ededed",
  tagline: "Release everywhere from one workspace.",
  support_email: null,
  hide_nexus: false,
};

type S = { mine: DistBrand | null; global: DistBrand | null; loaded: boolean };
export const useBrandStore = create<S>(() => ({ mine: null, global: null, loaded: false }));

export async function loadBrands() {
  const me = useApp.getState().userId;
  const [g, m] = await Promise.all([
    supabase.from("dist_brand_global").select("*").eq("id", 1).maybeSingle(),
    me ? supabase.from("dist_brands").select("*").eq("owner_id", me).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  useBrandStore.setState({ global: (g.data as DistBrand | null) ?? null, mine: (m.data as DistBrand | null) ?? null, loaded: true });
}

/** effective brand: your own white-label → platform default → Nexus */
export function resolveBrand(mine: DistBrand | null, global: DistBrand | null) {
  const pick = <K extends keyof DistBrand>(k: K) => (mine?.[k] || global?.[k] || DEFAULT_BRAND[k as keyof typeof DEFAULT_BRAND]) as DistBrand[K];
  const theme: DxTheme = mine?.theme || global?.theme || "classic";
  return {
    theme,
    name: pick("name") as string,
    logo_url: pick("logo_url") as string | null,
    accent: (mine?.accent || (mine?.theme ? themeAccent(theme) : global?.accent) || themeAccent(theme)) as string,
    tagline: pick("tagline") as string | null,
    support_email: pick("support_email") as string | null,
    hide_nexus: !!mine?.hide_nexus,
    custom: !!(mine?.name || mine?.logo_url || mine?.accent),
  };
}
export function useBrand() {
  const mine = useBrandStore((s) => s.mine);
  const global = useBrandStore((s) => s.global);
  return resolveBrand(mine, global);
}

/** readable text colour on top of an accent */
export function onColor(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#0a0a0a";
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return L > 0.4 ? "#0a0a0a" : "#ffffff";
}
/** CSS variables applied on the .dx root */
export function brandVars(accent: string): React.CSSProperties {
  return { ["--dx-accent" as string]: accent, ["--dx-on-accent" as string]: onColor(accent) } as React.CSSProperties;
}

export async function saveBrand(patch: Partial<DistBrand>, scope: "mine" | "global" = "mine") {
  const { data, error } = await supabase.rpc(scope === "global" ? "admin_set_dist_brand_global" : "set_dist_brand", { p: patch });
  if (error) {
    toast(errorText(error), "error");
    return null;
  }
  useBrandStore.setState(scope === "global" ? { global: data as DistBrand } : { mine: data as DistBrand });
  toast(scope === "global" ? "Platform brand saved" : "Branding saved", "success");
  return data as DistBrand;
}

export async function uploadBrandLogo(file: File) {
  const me = useApp.getState().userId;
  if (!me) return null;
  if (!/^image\/(png|jpeg|webp|svg\+xml|gif)$/.test(file.type)) {
    toast("Use a PNG, JPG, WEBP, SVG or GIF", "error");
    return null;
  }
  if (file.size > 5 * 1024 * 1024) {
    toast("Logos must be under 5 MB", "error");
    return null;
  }
  const ext = file.type === "image/svg+xml" ? "svg" : file.type.split("/")[1].replace("jpeg", "jpg");
  const path = `${me}/logo-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("brand-assets").upload(path, file, { contentType: file.type, cacheControl: "31536000", upsert: false });
  if (error) {
    toast(errorText(error), "error");
    return null;
  }
  return supabase.storage.from("brand-assets").getPublicUrl(path).data.publicUrl;
}
