"use client";

import { create } from "zustand";
import { supabase, errorText } from "./supabase";
import { useApp, toast } from "@/store/app";
import { openConversation } from "./data";
import { isBumpApp, isNativeApp } from "./useMobile";

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
      Badge?: any;
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
const isIosNative = () => isNativeApp() && platform() === "ios";
/** real closed-app push: FCM on Android builds, APNs on iOS builds (needs Push Notifications capability in the IPA) */
const nativePushCapable = () => !!cap()?.Plugins?.PushNotifications && (fcmBuild() || isIosNative());
/** App Store bundle ids — APNs topic must match the app that registered */
const appBundle = () => (isBumpApp() ? "hu.qyopy.bump.B44X8B76QR" : "hu.qyopy.nexus.B44X8B76QR");
let apnsRegistered = false;

function b64ToBytes(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function save(kind: "web" | "fcm" | "apns", endpoint: string, p256dh: string | null, auth: string | null) {
  const args: Record<string, unknown> = { p_kind: kind, p_endpoint: endpoint, p_p256dh: p256dh, p_auth: auth, p_platform: platform() };
  if (kind === "apns") args.p_app = appBundle();
  const { error } = await supabase.rpc("register_push", args);
  if (error) throw new Error(errorText(error));
}

/** what we can offer on this device right now */
export async function detectPush(): Promise<PushState> {
  if (isNativeApp()) {
    const plugins = cap()?.Plugins;
    if (plugins?.PushNotifications && nativePushCapable()) {
      const p = await plugins.PushNotifications.checkPermissions().catch(() => ({ receive: "prompt" }));
      if (p.receive === "granted") return "native-push";
      // older iPhone builds: local banners already allowed → keep them working until push is turned on
      if (plugins.LocalNotifications) {
        const l = await plugins.LocalNotifications.checkPermissions().catch(() => ({ display: "prompt" }));
        if (l.display === "granted") return "native-local";
      }
      return p.receive === "denied" ? "denied" : "default";
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
async function wireLocalListeners(LN: any) {
  if (nativeListeners) return;
  nativeListeners = true;
  await LN.addListener("localNotificationActionPerformed", (a: { notification?: { extra?: { conversation_id?: string; kind?: string } } }) => {
    if (a.notification?.extra?.kind === "badge-sync") return;
    const c = a.notification?.extra?.conversation_id;
    if (c) openChat(c);
  });
}

async function nativeRegister() {
  const plugins = cap()?.Plugins!;
  if (plugins.PushNotifications && nativePushCapable()) {
    const P = plugins.PushNotifications;
    const kind = isIosNative() ? "apns" : "fcm";
    if (!nativeListeners) {
      nativeListeners = true;
      await P.addListener("registration", (t: { value: string }) => {
        if (kind === "apns") apnsRegistered = true;
        void save(kind, t.value, null, null).catch(() => {});
      });
      await P.addListener("registrationError", (e: unknown) => console.warn("push registration failed", e));
      await P.addListener("pushNotificationActionPerformed", (a: { notification?: { data?: { conversation_id?: string; url?: string } } }) => {
        const d = a.notification?.data;
        if (d?.conversation_id) openChat(d.conversation_id);
        else if (d?.url && /^\/(wump|bump)\//.test(d.url)) window.location.href = d.url;
      });
    }
    await P.createChannel?.({ id: "messages", name: "Messages", importance: 5, visibility: 1, vibration: true }).catch(() => {});
    await P.createChannel?.({ id: "calls", name: "Calls", importance: 5, visibility: 1, vibration: true }).catch(() => {});
    await P.register();
    // also wire local notifications so iOS can show banners while the WebView is alive
    if (plugins.LocalNotifications) {
      await wireLocalListeners(plugins.LocalNotifications);
      await plugins.LocalNotifications.createChannel?.({ id: "messages", name: "Messages", importance: 5, vibration: true, sound: "default" }).catch(() => {});
    }
    return "native-push" as const;
  }
  if (plugins.LocalNotifications) {
    await wireLocalListeners(plugins.LocalNotifications);
    await plugins.LocalNotifications.createChannel?.({ id: "messages", name: "Messages", importance: 5, vibration: true, sound: "default" }).catch(() => {});
    // iOS IPA: request Badge permission so the home-screen count can update
    try {
      await plugins.Badge?.requestPermissions?.();
    } catch {
      /* optional plugin */
    }
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
      const api = plugins?.PushNotifications && nativePushCapable() ? plugins.PushNotifications : plugins?.LocalNotifications;
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
    else if (state === "native-push" || state === "native-local") {
      await nativeRegister();
      const { syncAppBadge } = await import("./badge");
      void syncAppBadge();
    }
  } catch {
    /* offline */
  }
}

/** native apps: OS banner for messages that arrive while the app is backgrounded (critical for iPhone IPA). */
export async function nativeLocalNotify(title: string, body: string, conversationId: string, badgeCount?: number) {
  if (!isNativeApp()) return false;
  const st = usePush.getState().state;
  // FCM/APNs handles closed-app delivery on Android FCM builds; still show a local banner
  // on iOS IPA (and non-FCM Android) while the WebView is alive in the background.
  if (st === "native-push" && (!isIosNative() || apnsRegistered)) return true;
  if (st !== "native-local" && st !== "native-push" && st !== "default") return false;
  const LN = cap()?.Plugins?.LocalNotifications;
  if (!LN) return false;
  try {
    const { totalUnread } = await import("./badge");
    const badge = typeof badgeCount === "number" ? badgeCount : totalUnread();
    // Stable id per conversation so new messages replace the previous banner for that chat
    let id = 0;
    for (let i = 0; i < conversationId.length; i++) id = (id * 31 + conversationId.charCodeAt(i)) >>> 0;
    id = (id % 1_000_000_000) + 1;
    await LN.cancel?.({ notifications: [{ id }] }).catch(() => {});
    await LN.schedule({
      notifications: [
        {
          id,
          title,
          body: body.slice(0, 180),
          channelId: "messages",
          sound: "default",
          badge,
          threadIdentifier: conversationId,
          summaryArgument: title,
          group: "nexus-messages",
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
