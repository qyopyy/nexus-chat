"use client";

import { openBump } from "./bump";

export type WumpOpenPin = { lat: number; lng: number; name: string | null };

const KEY = "wump-open-pin";

export function publishWumpPin(pin: WumpOpenPin) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(pin));
  } catch {
    /* private mode */
  }
  window.dispatchEvent(new CustomEvent("wump-open-pin", { detail: pin }));
}

/** Read a pin from ?pin=lat,lng or the one-shot session handoff, then clear it. */
export function consumeWumpPin(): WumpOpenPin | null {
  try {
    const u = new URL(window.location.href);
    const raw = u.searchParams.get("pin");
    if (raw) {
      const [lat, lng] = raw.split(",").map(Number);
      if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
        const name = u.searchParams.get("name");
        u.searchParams.delete("pin");
        u.searchParams.delete("name");
        window.history.replaceState(null, "", u.pathname + u.search);
        return { lat, lng, name };
      }
    }
  } catch {
    /* ignore */
  }
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    const j = JSON.parse(raw) as WumpOpenPin;
    if (!Number.isFinite(j.lat) || !Number.isFinite(j.lng)) return null;
    return { lat: j.lat, lng: j.lng, name: j.name ?? null };
  } catch {
    return null;
  }
}

/** Open Wump focused on a place. Safe for a chat card: it does not publish anyone's live pin. */
export function openWumpPin(pin: WumpOpenPin) {
  publishWumpPin(pin);
  const shell = /BumpApp|WumpApp/i.test(navigator.userAgent);
  const path = window.location.pathname;
  if (shell && !path.startsWith("/wump") && !path.startsWith("/bump")) {
    window.location.href = `/wump/app?pin=${pin.lat},${pin.lng}&name=${encodeURIComponent(pin.name || "")}`;
    return;
  }
  openBump();
}
