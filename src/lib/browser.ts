"use client";

import { useApp } from "@/store/app";
export type { BrowserSearchHit } from "./browserTypes";

/** Open Nexus Browser inside Apps (or standalone Cap shell). */
export function openBrowser() {
  if (typeof window !== "undefined" && /BrowserApp|NexusBrowser/i.test(navigator.userAgent)) {
    if (!window.location.pathname.startsWith("/browser/app")) {
      window.location.href = "/browser/app";
      return;
    }
  }
  const mobile = typeof window !== "undefined" && window.innerWidth < 768;
  useApp.setState(
    mobile
      ? { mobileTab: "apps", hub: "apps", appsTool: "browser", mobileSidebar: true }
      : { hub: "apps", appsTool: "browser" },
  );
}

export function browserIpaReleasesUrl() {
  return "https://github.com/qyopyy/nexus-chat/releases?q=Browser+iOS&expanded=true";
}
