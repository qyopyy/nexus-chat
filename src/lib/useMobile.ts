"use client";

import { useEffect, useState } from "react";

const QUERY = "(max-width: 767px)";

/** True on phones / narrow windows. Desktop layout stays untouched above 768px. */
export function useIsMobile() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const update = () => setMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return mobile;
}

/** Running inside a Nexus Capacitor shell (Nexus IPA/APK or standalone Bump IPA)? */
export function isNativeApp() {
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return !!cap?.isNativePlatform?.();
}

/** Standalone Wump IPA/APK (`hu.qyopy.bump`, UA includes BumpApp / WumpApp). */
export function isBumpApp() {
  if (typeof window === "undefined") return false;
  if (/BumpApp|WumpApp/i.test(navigator.userAgent)) return true;
  try {
    const p = window.location.pathname;
    return p.startsWith("/bump/app") || p.startsWith("/wump/app");
  } catch {
    return false;
  }
}

/** Standalone Nexus Browser IPA (`hu.qyopy.browser`). */
export function isBrowserApp() {
  if (typeof window === "undefined") return false;
  if (/BrowserApp|NexusBrowser/i.test(navigator.userAgent)) return true;
  try {
    return window.location.pathname.startsWith("/browser/app");
  } catch {
    return false;
  }
}

/** Standalone Untitled / Cutroom IPA (`hu.qyopy.untitled`). */
export function isUntitledApp() {
  if (typeof window === "undefined") return false;
  if (/UntitledApp/i.test(navigator.userAgent)) return true;
  try {
    return window.location.pathname.startsWith("/untitled/app");
  } catch {
    return false;
  }
}

/** Standalone Distro IPA (`hu.qyopy.distro`, UA includes DistroApp). */
export function isDistroApp() {
  if (typeof window === "undefined") return false;
  if (/DistroApp/i.test(navigator.userAgent)) return true;
  try {
    return window.location.pathname.startsWith("/distro/app");
  } catch {
    return false;
  }
}

/** Standalone Nexus Link IPA (`hu.qyopy.link`, UA includes LinkBioApp / NexusLink). */
export function isLinkBioApp() {
  if (typeof window === "undefined") return false;
  if (/LinkBioApp|NexusLink/i.test(navigator.userAgent)) return true;
  try {
    return window.location.pathname.startsWith("/bio/app") || window.location.pathname.startsWith("/bio/admin");
  } catch {
    return false;
  }
}
