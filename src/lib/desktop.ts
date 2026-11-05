"use client";

/** Running inside the Windows .exe / macOS .dmg Electron shell? */
export function isNexusDesktop() {
  if (typeof window === "undefined") return false;
  if (document.documentElement.dataset.nexusDesktop === "1") return true;
  if (/NexusDesktop/i.test(navigator.userAgent)) return true;
  const bridge = (window as unknown as { nexusDesktop?: { ping?: () => boolean } }).nexusDesktop;
  return !!bridge?.ping?.();
}

export function triggerDiscordoEgg() {
  try {
    (window as unknown as { nexusDesktop?: { discordo?: () => void } }).nexusDesktop?.discordo?.();
  } catch {
    /* ignore */
  }
  try {
    document.title = "Discordo";
  } catch {
    /* ignore */
  }
}
