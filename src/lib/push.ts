"use client";

import { create } from "zustand";
import { supabase, errorText } from "./supabase";
import { useApp, toast } from "@/store/app";
import { openConversation } from "./data";
import { isNativeApp } from "./useMobile";

// Push notifications for new messages.
//  • Browsers + installed web app (Android Chrome, desktop, iPhone "Add to Home Screen" on iOS 16.4+) → Web Push
//  • Android app → Firebase Cloud Messaging when the app was built with Firebase (user agent contains "NexusFCM")
//  • Both native apps → local notifications while the app is open in the background

export const VAPID_PUBLIC_KEY = "BMXzC1bmqYuLLtuLmATTSHLgrkqEB4U_CWgB8CfcMgz6oQ69TwYqj8VH8sYL4Z2vAe_YMKPZvDWZGz0SjdjsSsw";

type Cap = {
  Capacitor?: {
    getPlatform?: () => string;
    Plugins?: {
      PushNotifications?: any;
      LocalNotifications?: any;
    };
  };
};
const cap = () => (typeof window === "undefined" ? undefined : (window as unknown as Cap).Capacitor);
const platform = () => cap()?.getPlatform?.() ?? "web";

export type PushState = "unsupported" | "ios-install" | "default" | "denied" | "on" | "native-local" | "native-push";
export const usePush = create<{ state: PushState; busy: boolean }>(() => ({ state: "default", busy: false }));

const isIOS = () => typeof navigator !== "undefined" && /iPhone|iPad|iPod/.test(navigator.userAgent) && !isNativeApp();
const standalone = () =>
  typeof window !== "undefined" && (window.matchMedia?.("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true);
const webPushSupported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const fcmBuild = () => typeof navigator !== "undefined" && /NexusFCM/.test(navigator.userAgent);

function b64ToBytes(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function save(kind: "web" | "fcm", endpoint: string, p256dh: string | null, auth: string | null) {
  const { error } = await supabase.rpc("register_push", { p_kind: kind, p_endpoint: endpoint, p_p256dh: p256dh, p_auth: auth, p_platform: platform() });
  if (error) throw new Error(errorText(error));
}

/** what we can offer on this device right now */
export async function detectPush(): Promise<PushState> {
  if (isNativeApp()) {
    const plugins = cap()?.Plugins;
    if (plugins?.PushNotifications && fcmBuild()) {
      const p = await plugins.PushNotifications.checkPermissions().catch(() => ({ receive: "prompt" }));
      return p.receive === "granted" ? "native-push" : p.receive === "denied" ? "denied" : "default";
    }
    if (plugins?.LocalNotifications) {
      const p = await plugins.LocalNotifications.checkPermissions().catch(() => ({ display: "prompt" }));
      return p.display === "granted" ? "native-local" : p.display === "denied" ? "denied" : "default";
    }
    return "unsupported";
  }
  if (isIOS() && !standalone()) return "ios-install";
  if (!webPushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission !== "granted") return "default";
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  return sub ? "on" : "default";
}

async function webSubscribe() {
  const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(VAPID_PUBLIC_KEY) });
  const j = sub.toJSON() as { endpoint: string; keys?: { p256dh: string; auth: string } };
  await save("web", j.endpoint, j.keys?.p256dh ?? null, j.keys?.auth ?? null);
}

let nativeListeners = false;
async function nativeRegister() {
  const plugins = cap()?.Plugins!;
  if (plugins.PushNotifications && fcmBuild()) {
    const P = plugins.PushNotifications;
    if (!nativeListeners) {
      nativeListeners = true;
      await P.addListener("registration", (t: { value: string }) => void save("fcm", t.value, null, null).catch(() => {}));
      await P.addListener("registrationError", (e: unknown) => console.warn("push registration failed", e));
      await P.addListener("pushNotificationActionPerformed", (a: { notification?: { data?: { conversation_id?: string } } }) => {
        const c = a.notification?.data?.conversation_id;
        if (c) openChat(c);
      });
    }
    await P.createChannel?.({ id: "messages", name: "Messages", importance: 5, visibility: 1, vibration: true }).catch(() => {});
    await P.createChannel?.({ id: "calls", name: "Calls", importance: 5, visibility: 1, vibration: true }).catch(() => {});
    await P.register();
    return "native-push" as const;
  }
  if (plugins.LocalNotifications) {
    if (!nativeListeners) {
      nativeListeners = true;
      await plugins.LocalNotifications.addListener("localNotificationActionPerformed", (a: { notification?: { extra?: { conversation_id?: string } } }) => {
        const c = a.notification?.extra?.conversation_id;
        if (c) openChat(c);
      });
    }
    await plugins.LocalNotifications.createChannel?.({ id: "messages", name: "Messages", importance: 5, vibration: true }).catch(() => {});
    return "native-local" as const;
  }
  return "unsupported" as const;
}

/** ask permission + subscribe this device */
export async function enablePush() {
  usePush.setState({ busy: true });
  try {
    if (isNativeApp()) {
      const plugins = cap()?.Plugins;
      const api = plugins?.PushNotifications && fcmBuild() ? plugins.PushNotifications : plugins?.LocalNotifications;
      if (!api) throw new Error("Notifications aren't available in this app build");
      const p = await api.requestPermissions();
      if ((p.receive ?? p.display) !== "granted") {
        usePush.setState({ state: "denied" });
        return;
      }
      usePush.setState({ state: await nativeRegister() });
    } else {
      if (isIOS() && !standalone()) {
        usePush.setState({ state: "ios-install" });
        return;
      }
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        usePush.setState({ state: perm === "denied" ? "denied" : "default" });
        return;
      }
      await webSubscribe();
      usePush.setState({ state: "on" });
      toast("Notifications are on for this device", "success");
    }
  } catch (e) {
    toast(`Couldn't turn on notifications: ${(e as Error).message}`, "error");
  } finally {
    usePush.setState({ busy: false });
  }
}

export async function disablePush() {
  try {
    if (webPushSupported()) {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        await sub.unsubscribe();
      }
    }
  } catch {
    /* ignore */
  }
  usePush.setState({ state: await detectPush() });
}

function openChat(convId: string) {
  const s = useApp.getState();
  const inChats = s.chatList.some((c) => c.id === convId);
  let spaceId: string | null = null;
  if (!inChats) for (const [sid, list] of Object.entries(s.channels)) if (list.some((c) => c.id === convId)) spaceId = sid;
  useApp.setState({ hub: null, mobileTab: spaceId ? "spaces" : "chats" });
  openConversation(convId, spaceId);
}

/** boot: refresh this device's subscription, open the chat a notification pointed at */
export async function startPush() {
  if (typeof window === "undefined") return;
  // opened from a notification (/?c=<conversation>)
  const c = new URLSearchParams(window.location.search).get("c");
  if (c) {
    openChat(c);
    window.history.replaceState(null, "", "/");
  }
  navigator.serviceWorker?.addEventListener("message", (e: MessageEvent) => {
    if (e.data?.type === "nexus:open" && e.data.conversation_id) openChat(e.data.conversation_id);
  });

  const state = await detectPush();
  usePush.setState({ state });
  try {
    if (state === "on") await webSubscribe(); // keeps keys + last_seen fresh
    else if (state === "native-push" || state === "native-local") await nativeRegister();
  } catch {
    /* offline */
  }
}

/** native apps: banner for messages that arrive while the app is in the background */
export async function nativeLocalNotify(title: string, body: string, conversationId: string) {
  if (!isNativeApp()) return false;
  const st = usePush.getState().state;
  if (st === "native-push") return true; // FCM delivers it
  const LN = cap()?.Plugins?.LocalNotifications;
  if (!LN || st !== "native-local") return false;
  try {
    await LN.schedule({
      notifications: [
        {
          id: Math.floor(Math.random() * 2_000_000_000),
          title,
          body,
          channelId: "messages",
          threadIdentifier: conversationId,
          group: conversationId,
          extra: { conversation_id: conversationId },
        },
      ],
    });
    return true;
  } catch {
    return false;
  }
}

/** keep server-side mutes in sync so muted chats don't buzz your phone */
export async function syncMute(convId: string, muted: boolean) {
  await supabase.rpc("set_conversation_muted", { p_conv: convId, p_muted: muted });
}
