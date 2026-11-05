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

/** Standalone Bump IPA/APK (`hu.qyopy.bump`, UA includes BumpApp). */
export function isBumpApp() {
  if (typeof window === "undefined") return false;
  if (/BumpApp/i.test(navigator.userAgent)) return true;
  try {
    return window.location.pathname.startsWith("/bump/app");
  } catch {
    return false;
  }
}
