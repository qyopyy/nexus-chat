"use client";

// Native haptics in the iOS app (Capacitor Haptics plugin), vibration fallback on Android, no-op elsewhere.

type HapticsPlugin = {
  impact?: (o: { style: "LIGHT" | "MEDIUM" | "HEAVY" }) => Promise<void>;
  notification?: (o: { type: "SUCCESS" | "WARNING" | "ERROR" }) => Promise<void>;
  selectionChanged?: () => Promise<void>;
  selectionStart?: () => Promise<void>;
};

function plugin(): HapticsPlugin | null {
  if (typeof window === "undefined") return null;
  const cap = (window as unknown as { Capacitor?: { Plugins?: { Haptics?: HapticsPlugin } } }).Capacitor;
  return cap?.Plugins?.Haptics ?? null;
}

function vibrate(ms: number | number[]) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* unsupported */
  }
}

export const haptic = {
  light() {
    const p = plugin();
    if (p?.impact) void p.impact({ style: "LIGHT" }).catch(() => {});
    else vibrate(8);
  },
  medium() {
    const p = plugin();
    if (p?.impact) void p.impact({ style: "MEDIUM" }).catch(() => {});
    else vibrate(15);
  },
  heavy() {
    const p = plugin();
    if (p?.impact) void p.impact({ style: "HEAVY" }).catch(() => {});
    else vibrate(25);
  },
  success() {
    const p = plugin();
    if (p?.notification) void p.notification({ type: "SUCCESS" }).catch(() => {});
    else vibrate([10, 40, 10]);
  },
  select() {
    const p = plugin();
    if (p?.selectionChanged) {
      void p.selectionStart?.().catch(() => {});
      void p.selectionChanged().catch(() => {});
    } else vibrate(5);
  },
};
