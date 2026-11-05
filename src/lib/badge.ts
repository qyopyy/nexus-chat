"use client";

import { useApp } from "@/store/app";
import { isNativeApp } from "./useMobile";

type Cap = {
  Capacitor?: {
    Plugins?: {
      Badge?: {
        isSupported?: () => Promise<{ isSupported: boolean }>;
        checkPermissions?: () => Promise<{ display: string }>;
        requestPermissions?: () => Promise<{ display: string }>;
        get?: () => Promise<{ count: number }>;
        set?: (o: { count: number }) => Promise<void>;
        clear?: () => Promise<void>;
      };
      LocalNotifications?: {
        schedule?: (o: { notifications: Record<string, unknown>[] }) => Promise<unknown>;
        cancel?: (o: { notifications: { id: number }[] }) => Promise<unknown>;
      };
    };
  };
};

const BADGE_NOTIFY_ID = 900_001;
const cap = () => (typeof window === "undefined" ? undefined : (window as unknown as Cap).Capacitor);

/** Sum of unread messages across every conversation (Telegram-style total). */
export function totalUnread(unread?: Record<string, number>) {
  const map = unread ?? useApp.getState().unread;
  let n = 0;
  for (const v of Object.values(map)) if (typeof v === "number" && v > 0) n += v;
  return n;
}

/** Keep the home-screen app icon badge in sync with unread message totals. */
export async function syncAppBadge(count = totalUnread()) {
  if (typeof window === "undefined" || !isNativeApp()) return;
  const plugins = cap()?.Plugins;
  const Badge = plugins?.Badge;
  try {
    if (Badge?.set) {
      const supported = (await Badge.isSupported?.())?.isSupported !== false;
      if (supported) {
        const perm = await Badge.checkPermissions?.().catch(() => ({ display: "granted" }));
        if (perm && perm.display !== "granted") {
          const req = await Badge.requestPermissions?.().catch(() => perm);
          if (req && req.display !== "granted") return;
        }
        if (count <= 0) await Badge.clear?.();
        else await Badge.set({ count });
        return;
      }
    }
  } catch {
    /* fall through to LocalNotifications */
  }

  // Fallback: iOS LocalNotifications can set the icon badge when delivered
  const LN = plugins?.LocalNotifications;
  if (!LN?.schedule) return;
  try {
    await LN.cancel?.({ notifications: [{ id: BADGE_NOTIFY_ID }] });
    if (count <= 0) return;
    await LN.schedule({
      notifications: [
        {
          id: BADGE_NOTIFY_ID,
          title: "Nexus",
          body: count === 1 ? "1 unread message" : `${count} unread messages`,
          badge: count,
          silent: true,
          schedule: { at: new Date(Date.now() + 250) },
          extra: { kind: "badge-sync" },
        },
      ],
    });
  } catch {
    /* ignore */
  }
}
