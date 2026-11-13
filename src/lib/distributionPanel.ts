"use client";

import { useEffect, useState } from "react";
import { featureFlags, loadFeatureFlags } from "./featureFlags";
import { isNativeApp } from "./useMobile";

/** Live distribution dashboard. Override with NEXT_PUBLIC_DISTRIBUTION_PANEL_URL. */
export const DISTRIBUTION_PANEL_URL = panelOrigin();

/**
 * Paths confirmed to return HTTP 200 on the panel (November 2026).
 * Unknown routes 404, so this list stays limited to checked ones.
 */
export const DISTRIBUTION_PANEL_LINKS = [
  { id: "open", label: "Open the panel", path: "/" },
  { id: "login", label: "Sign in", path: "/login" },
  { id: "signup", label: "Create an account", path: "/signup" },
  { id: "releases", label: "Releases", path: "/artist/releases" },
  { id: "splits", label: "Splits", path: "/artist/royalty-splits" },
] as const;

export type DistributionPanelPath = (typeof DISTRIBUTION_PANEL_LINKS)[number]["path"];

function panelOrigin() {
  const fallback = "https://panel.nexusproject.cc";
  const raw = process.env.NEXT_PUBLIC_DISTRIBUTION_PANEL_URL?.trim();
  if (!raw) return fallback;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return fallback;
    return url.origin;
  } catch {
    return fallback;
  }
}

export function distributionPanelUrl(path: string = "/") {
  if (!path || path === "/") return DISTRIBUTION_PANEL_URL;
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${DISTRIBUTION_PANEL_URL}${suffix}`;
}

type BrowserPlugin = {
  open?: (options: { url: string; presentationStyle?: "fullscreen" | "popover" }) => Promise<void>;
};

function nativeBrowser(): BrowserPlugin | null {
  if (typeof window === "undefined" || !isNativeApp()) return null;
  const cap = (window as unknown as { Capacitor?: { Plugins?: { Browser?: BrowserPlugin } } }).Capacitor;
  return cap?.Plugins?.Browser ?? null;
}

/** iOS/Android: SFSafariViewController (or Chrome Custom Tabs). Web: a new tab. */
export function openDistributionPanel(path: string = "/") {
  const url = distributionPanelUrl(path);
  const browser = nativeBrowser();
  if (browser?.open) {
    void browser.open({ url, presentationStyle: "fullscreen" }).catch(() => {
      window.open(url, "_blank", "noopener,noreferrer");
    });
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

/** Admin kill switch. Missing column or a failed read stays on, matching the database default. */
export function useDistributionPanelEnabled() {
  const [enabled, setEnabled] = useState(() => featureFlags().distribution_panel !== false);
  useEffect(() => {
    let live = true;
    void loadFeatureFlags().then((flags) => {
      if (live) setEnabled(flags.distribution_panel !== false);
    });
    return () => {
      live = false;
    };
  }, []);
  return enabled;
}
