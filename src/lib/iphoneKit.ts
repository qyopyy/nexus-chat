"use client";

import { haptic } from "@/lib/haptics";
import { setPref } from "@/lib/prefs";
import { toast, useApp } from "@/store/app";
import {
  clearHandsetLink,
  forgetHandset,
  pingOtherComputers,
  refreshHandset,
  sendHandsetLink,
  sendHandsetNote,
  thisDeviceId,
} from "@/lib/handset";
import { addCloudFiles, addVoiceMemo, cloudUnlocked, syncCloudNow } from "@/lib/nexusCloud";
import { defendFile } from "@/lib/nexusDefend";
import { NEXUS_IPA_RELEASES_URL } from "@/lib/ipaDownloads";

export type IphoneTool = {
  n: number;
  id: string;
  group: string;
  label: string;
  run: () => unknown;
};

type Look = {
  text: number;
  bold: boolean;
  gray: boolean;
  invert: boolean;
  dim: number;
  reader: boolean;
  openType: boolean;
  reach: boolean;
};

const LOOK_KEY = "nexus:iphone-look";
const DEFAULT_LOOK: Look = {
  text: 100,
  bold: false,
  gray: false,
  invert: false,
  dim: 100,
  reader: false,
  openType: false,
  reach: false,
};

let wakeLock: WakeLockSentinel | null = null;
let lastArea: string | null = null;

function readLook(): Look {
  if (typeof localStorage === "undefined") return { ...DEFAULT_LOOK };
  try {
    const raw = localStorage.getItem(LOOK_KEY);
    if (!raw) return { ...DEFAULT_LOOK };
    return { ...DEFAULT_LOOK, ...(JSON.parse(raw) as Partial<Look>) };
  } catch {
    return { ...DEFAULT_LOOK };
  }
}

function writeLook(patch: Partial<Look>) {
  const next = { ...readLook(), ...patch };
  next.text = Math.max(100, Math.min(140, Math.round(next.text)));
  next.dim = Math.max(70, Math.min(100, Math.round(next.dim)));
  localStorage.setItem(LOOK_KEY, JSON.stringify(next));
  applyIphoneLook(next);
}

export function applyIphoneLook(look = readLook()) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const filtered = look.gray || look.invert || look.dim !== 100;
  root.classList.toggle("iphone-look", look.text !== 100);
  root.classList.toggle("iphone-filter", filtered);
  root.style.setProperty("--iphone-text", `${look.text}%`);
  root.style.setProperty("--iphone-gray", look.gray ? "1" : "0");
  root.style.setProperty("--iphone-invert", look.invert ? "1" : "0");
  root.style.setProperty("--iphone-dim", String(look.dim / 100));
  root.classList.toggle("iphone-bold", look.bold);
  root.classList.toggle("iphone-reader", look.reader);
  root.classList.toggle("iphone-open", look.openType);
  root.classList.toggle("iphone-reach", look.reach);
}

if (typeof window !== "undefined") applyIphoneLook();

function signedIn() {
  if (!useApp.getState().userId) throw new Error("Sign in on this phone first");
}

async function note(text: string) {
  signedIn();
  await sendHandsetNote(text);
  const { sendToComputers } = await import("@/lib/phoneLink");
  await sendToComputers("note", text).catch(() => undefined);
  toast("Sent to your computer", "success");
}

function go(path: string) {
  window.location.assign(path);
}

function pickFile(accept: string, capture = false) {
  return new Promise<File | null>((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    if (capture) input.setAttribute("capture", "environment");
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}

async function recordMemo(ms: number) {
  if (!cloudUnlocked()) throw new Error("Voice memos in Cloud are part of Premium");
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null);
  if (!stream) throw new Error("Microphone is off");
  const rec = new MediaRecorder(stream);
  const bits: Blob[] = [];
  const done = new Promise<Blob>((resolve) => {
    rec.ondataavailable = (event) => {
      if (event.data.size) bits.push(event.data);
    };
    rec.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      resolve(new Blob(bits, { type: rec.mimeType || "audio/webm" }));
    };
  });
  rec.start();
  toast(`Recording ${Math.round(ms / 1000)} seconds`, "info");
  window.setTimeout(() => rec.stop(), ms);
  await addVoiceMemo(await done);
  toast("Memo saved to Cloud", "success");
}

async function shareUrl(url: string, title: string) {
  if (navigator.share) {
    await navigator.share({ title, url }).catch(() => undefined);
    return;
  }
  await navigator.clipboard.writeText(url);
  toast("Copied", "success");
}

async function readArea() {
  if (!navigator.geolocation) throw new Error("Location is not available");
  const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, () => reject(new Error("Location is off")), {
      enableHighAccuracy: false,
      timeout: 8000,
      maximumAge: 60000,
    });
  });
  lastArea = `${pos.coords.latitude.toFixed(2)}, ${pos.coords.longitude.toFixed(2)}`;
  return lastArea;
}

function tool(n: number, id: string, group: string, label: string, run: () => unknown): IphoneTool {
  return { n, id, group, label, run };
}

const DISPLAY = "Display";
const HANDOFF = "Phone to computer";
const OPEN = "Open and share";
const PHONE = "This iPhone";
const KEEP = "Capture and safety";

/** One hundred iPhone actions. Each one changes a setting, talks to your account, or reads the phone. */
export function iphoneTools(): IphoneTool[] {
  const origin = typeof window === "undefined" ? "https://nexusproject.cc" : window.location.origin;
  const list: IphoneTool[] = [
    tool(1, "text-up", DISPLAY, "Larger text", () => writeLook({ text: readLook().text + 10 })),
    tool(2, "text-down", DISPLAY, "Smaller text", () => writeLook({ text: readLook().text - 10 })),
    tool(3, "text-reset", DISPLAY, "Default text size", () => writeLook({ text: 100 })),
    tool(4, "bold-on", DISPLAY, "Bold text", () => writeLook({ bold: true })),
    tool(5, "bold-off", DISPLAY, "Regular text", () => writeLook({ bold: false })),
    tool(6, "contrast-on", DISPLAY, "High contrast", () => setPref("highContrast", true)),
    tool(7, "contrast-off", DISPLAY, "Standard contrast", () => setPref("highContrast", false)),
    tool(8, "gray-on", DISPLAY, "Grayscale", () => writeLook({ gray: true })),
    tool(9, "gray-off", DISPLAY, "Full color", () => writeLook({ gray: false })),
    tool(10, "invert-on", DISPLAY, "Invert colors", () => writeLook({ invert: true })),
    tool(11, "invert-off", DISPLAY, "Normal colors", () => writeLook({ invert: false })),
    tool(12, "dim-down", DISPLAY, "Dim the screen", () => writeLook({ dim: readLook().dim - 10 })),
    tool(13, "dim-up", DISPLAY, "Brighten the screen", () => writeLook({ dim: readLook().dim + 10 })),
    tool(14, "dim-reset", DISPLAY, "Full brightness", () => writeLook({ dim: 100 })),
    tool(15, "links-on", DISPLAY, "Underline links", () => setPref("underlineLinks", true)),
    tool(16, "links-off", DISPLAY, "Plain links", () => setPref("underlineLinks", false)),
    tool(17, "sat-low", DISPLAY, "Softer colors", () => setPref("saturation", 70)),
    tool(18, "sat-full", DISPLAY, "Full saturation", () => setPref("saturation", 100)),
    tool(19, "targets-on", DISPLAY, "Larger buttons", () => setPref("bigTargets", true)),
    tool(20, "targets-off", DISPLAY, "Compact buttons", () => setPref("bigTargets", false)),
    tool(21, "motion-on", DISPLAY, "Reduce motion", () => setPref("reduceMotion", true)),
    tool(22, "motion-off", DISPLAY, "Allow motion", () => setPref("reduceMotion", false)),
    tool(23, "reader-on", DISPLAY, "Easier line spacing", () => writeLook({ reader: true })),
    tool(24, "reader-off", DISPLAY, "Normal line spacing", () => writeLook({ reader: false })),
    tool(25, "type-on", DISPLAY, "Open reading type", () => writeLook({ openType: true })),
    tool(26, "type-off", DISPLAY, "Nexus type", () => writeLook({ openType: false })),
    tool(27, "reach-on", DISPLAY, "Reachability shift", () => writeLook({ reach: true })),
    tool(28, "reach-off", DISPLAY, "Normal reach", () => writeLook({ reach: false })),
    tool(29, "clock-12", DISPLAY, "12-hour clock", () => setPref("clock", "12")),
    tool(30, "clock-24", DISPLAY, "24-hour clock", () => setPref("clock", "24")),
    tool(31, "stream-on", DISPLAY, "Streamer mode", () => setPref("streamerMode", true)),
    tool(32, "stream-off", DISPLAY, "Show names and previews", () => setPref("streamerMode", false)),
    tool(33, "haptics-on", DISPLAY, "Haptics on", () => setPref("haptics", true)),
    tool(34, "haptics-off", DISPLAY, "Haptics off", () => setPref("haptics", false)),
    tool(35, "fx-on", DISPLAY, "Button sounds on", () => setPref("buttonFx", true)),
    tool(36, "fx-off", DISPLAY, "Button sounds off", () => setPref("buttonFx", false)),
    tool(37, "ping", HANDOFF, "Flash my computer", async () => {
      signedIn();
      await pingOtherComputers();
      toast("Sent", "success");
    }),
    tool(38, "note-way", HANDOFF, "Tell the computer: On my way", () => note("On my way")),
    tool(39, "note-call", HANDOFF, "Tell the computer: Call me", () => note("Call me")),
    tool(40, "note-home", HANDOFF, "Tell the computer: At home", () => note("At home")),
    tool(41, "note-meeting", HANDOFF, "Tell the computer: In a meeting", () => note("In a meeting")),
    tool(42, "note-driving", HANDOFF, "Tell the computer: Driving", () => note("Driving, can't text")),
    tool(43, "note-low", HANDOFF, "Tell the computer: Battery is low", () => note("Battery is low")),
    tool(44, "note-later", HANDOFF, "Tell the computer: I'll reply later", () => note("I'll reply later")),
    tool(45, "note-clear", HANDOFF, "Clear the note", async () => {
      signedIn();
      await sendHandsetNote("");
      toast("Note cleared", "success");
    }),
    tool(46, "clip-note", HANDOFF, "Send clipboard text to the computer", async () => {
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) throw new Error("Clipboard is empty");
      await note(text.slice(0, 280));
    }),
    tool(47, "clip-link", HANDOFF, "Send a copied link to the computer", async () => {
      signedIn();
      const text = (await navigator.clipboard.readText()).trim();
      await sendHandsetLink(text);
      const { sendToComputers } = await import("@/lib/phoneLink");
      await sendToComputers("link", text).catch(() => undefined);
      toast("Link sent", "success");
    }),
    tool(48, "link-clear", HANDOFF, "Clear the sent link", async () => {
      signedIn();
      await clearHandsetLink();
      toast("Link cleared", "success");
    }),
    tool(49, "copy-device", HANDOFF, "Copy this phone's device id", async () => {
      await navigator.clipboard.writeText(thisDeviceId());
      toast("Copied", "success");
    }),
    tool(50, "forget-phone", HANDOFF, "Forget this phone on the account", async () => {
      signedIn();
      if (!window.confirm("Remove this phone from your Nexus account?")) return;
      await forgetHandset(thisDeviceId());
      toast("This phone was removed", "success");
    }),
    tool(51, "refresh-battery", HANDOFF, "Send battery to the computer now", async () => {
      signedIn();
      const row = await refreshHandset();
      toast(row?.battery == null ? "Signed in, but this browser is not sharing a battery level" : `${row.battery}% sent`, row?.battery == null ? "info" : "success");
    }),
    tool(52, "share-nexus", OPEN, "Share Nexus", () => shareUrl(origin, "Nexus")),
    tool(53, "copy-app", OPEN, "Copy the Nexus link", async () => {
      await navigator.clipboard.writeText(origin);
      toast("Copied", "success");
    }),
    tool(54, "share-page", OPEN, "Share this page", () => shareUrl(window.location.href, document.title || "Nexus")),
    tool(55, "open-acetate", OPEN, "Open Acetate", () => go("/acetate/app")),
    tool(56, "open-cloud", OPEN, "Open Cloud", () => go("/cloud")),
    tool(57, "open-defend", OPEN, "Open Defender", () => go("/defend")),
    tool(58, "open-home", OPEN, "Back to chats", () => {
      sessionStorage.setItem("nexus:open-tab", "chats");
      go("/");
    }),
    tool(59, "open-friends", OPEN, "Open Friends", () => {
      sessionStorage.setItem("nexus:open-tab", "friends");
      go("/");
    }),
    tool(60, "open-settings", OPEN, "Open Settings", () => {
      sessionStorage.setItem("nexus:open-settings", "1");
      go("/");
    }),
    tool(61, "home-screen", OPEN, "How to add Nexus to the Home Screen", () => toast("In Safari, tap Share, then Add to Home Screen", "info")),
    tool(62, "standalone", OPEN, "Home Screen check", () => {
      const nav = navigator as Navigator & { standalone?: boolean };
      const on = window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
      toast(on ? "Running as an app" : "Running in the browser", "info");
    }),
    tool(63, "reload", OPEN, "Reload Nexus", () => window.location.reload()),
    tool(64, "download", OPEN, "Open the download page", () => go("/download")),
    tool(65, "hap-light", PHONE, "Light tap", () => haptic.light()),
    tool(66, "hap-medium", PHONE, "Medium tap", () => haptic.medium()),
    tool(67, "hap-heavy", PHONE, "Heavy tap", () => haptic.heavy()),
    tool(68, "hap-ok", PHONE, "Success tap", () => haptic.success()),
    tool(69, "hap-select", PHONE, "Selection tap", () => haptic.select()),
    tool(70, "wake-on", PHONE, "Keep the screen awake", async () => {
      if (!navigator.wakeLock?.request) throw new Error("Stay-awake needs the installed app or a supported browser");
      wakeLock = await navigator.wakeLock.request("screen");
      toast("Screen stay-awake is on until you lock the phone or turn it off here", "info");
    }),
    tool(71, "wake-off", PHONE, "Allow the screen to sleep", async () => {
      await wakeLock?.release();
      wakeLock = null;
      toast("Stay-awake is off", "info");
    }),
    tool(72, "portrait", PHONE, "Lock portrait", async () => {
      const orientation = screen.orientation as ScreenOrientation & { lock?: (mode: string) => Promise<void> };
      if (!orientation.lock) throw new Error("Rotation lock needs the installed app");
      await orientation.lock("portrait");
      toast("Portrait locked", "info");
    }),
    tool(73, "orientation-free", PHONE, "Unlock rotation", () => {
      (screen.orientation as ScreenOrientation & { unlock?: () => void } | undefined)?.unlock?.();
      toast("Rotation unlocked", "info");
    }),
    tool(74, "landscape", PHONE, "Lock landscape", async () => {
      const orientation = screen.orientation as ScreenOrientation & { lock?: (mode: string) => Promise<void> };
      if (!orientation.lock) throw new Error("Rotation lock needs the installed app");
      await orientation.lock("landscape");
      toast("Landscape locked", "info");
    }),
    tool(75, "network", PHONE, "Network type", () => {
      const nav = navigator as Navigator & { connection?: { effectiveType?: string; type?: string; saveData?: boolean } };
      const link = nav.connection;
      if (!link) throw new Error("This browser does not report the network");
      toast(`${link.effectiveType || link.type || "Connected"}${link.saveData ? ", data saver on" : ""}`, "info");
    }),
    tool(76, "storage", PHONE, "Storage used by Nexus", async () => {
      if (!navigator.storage?.estimate) throw new Error("Storage estimate is not available");
      const estimate = await navigator.storage.estimate();
      const used = ((estimate.usage ?? 0) / 1e6).toFixed(1);
      const quota = ((estimate.quota ?? 0) / 1e9).toFixed(1);
      toast(`${used} MB used of about ${quota} GB`, "info");
    }),
    tool(77, "dpr", PHONE, "Screen sharpness", () => toast(`Pixel ratio ${window.devicePixelRatio}`, "info")),
    tool(78, "viewport", PHONE, "Screen size", () => toast(`${window.innerWidth} × ${window.innerHeight}`, "info")),
    tool(79, "ios", PHONE, "iOS version", () => {
      const match = navigator.userAgent.match(/OS (\d+(?:_\d+)*)/);
      toast(match ? `iOS ${match[1].replace(/_/g, ".")}` : "This browser is not reporting an iPhone OS version", "info");
    }),
    tool(80, "pointer", PHONE, "Touch or mouse", () => toast(window.matchMedia("(pointer: coarse)").matches ? "Touch screen" : "Mouse or trackpad", "info")),
    tool(81, "scheme", PHONE, "Light or dark appearance", () => toast(window.matchMedia("(prefers-color-scheme: dark)").matches ? "Dark appearance" : "Light appearance", "info")),
    tool(82, "motion-os", PHONE, "iOS Reduce Motion", () => toast(window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "Reduce Motion is on in Settings" : "Motion is allowed in Settings", "info")),
    tool(83, "safe", PHONE, "Safe area", () => {
      const probe = document.createElement("div");
      probe.style.padding = "env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)";
      document.body.appendChild(probe);
      const box = getComputedStyle(probe);
      const text = `Top ${box.paddingTop}, right ${box.paddingRight}, bottom ${box.paddingBottom}, left ${box.paddingLeft}`;
      probe.remove();
      toast(text, "info");
    }),
    tool(84, "battery-read", PHONE, "Battery percentage", async () => {
      const row = await refreshHandset();
      if (!row) throw new Error("Sign in on this phone first");
      toast(row.battery == null ? "Safari does not share the battery. The Nexus iPhone app does, after you install the new build." : `${row.battery}%`, "info");
    }),
    tool(85, "charging-read", PHONE, "Charging state", async () => {
      const row = await refreshHandset();
      if (!row) throw new Error("Sign in on this phone first");
      if (row.battery == null) throw new Error("Charging state is hidden in Safari. The installed app can read it.");
      toast(row.charging ? "Charging" : "On battery", "info");
    }),
    tool(86, "area", PHONE, "Send a rough area to the computer", async () => {
      const area = await readArea();
      await note(`Near ${area}`);
    }),
    tool(87, "copy-area", PHONE, "Copy the rough area", async () => {
      const area = lastArea || (await readArea());
      await navigator.clipboard.writeText(area);
      toast("Copied. The area is rounded to about a kilometer.", "success");
    }),
    tool(88, "heading", PHONE, "Compass heading", async () => {
      const Device = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
      if (typeof Device.requestPermission === "function") {
        const state = await Device.requestPermission();
        if (state !== "granted") throw new Error("Motion access was denied");
      }
      const heading = await new Promise<number>((resolve, reject) => {
        const timer = window.setTimeout(() => {
          window.removeEventListener("deviceorientation", onEvent);
          reject(new Error("No compass reading. iOS only allows this from a Home Screen app or the installed Nexus app."));
        }, 4000);
        const onEvent = (event: DeviceOrientationEvent & { webkitCompassHeading?: number | null }) => {
          if (event.webkitCompassHeading == null && event.alpha == null) return;
          window.clearTimeout(timer);
          window.removeEventListener("deviceorientation", onEvent);
          const value = event.webkitCompassHeading ?? (event.alpha == null ? null : Math.round(360 - event.alpha));
          if (value == null) reject(new Error("No compass reading"));
          else resolve(Math.round(value));
        };
        window.addEventListener("deviceorientation", onEvent);
      });
      toast(`Heading ${heading}°`, "info");
    }),
    tool(89, "speak", PHONE, "Speak “Nexus is open”", () => {
      if (!window.speechSynthesis) throw new Error("Speech is not available");
      const utterance = new SpeechSynthesisUtterance("Nexus is open");
      utterance.lang = navigator.language || "en-US";
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    }),
    tool(90, "speak-stop", PHONE, "Stop speaking", () => window.speechSynthesis?.cancel()),
    tool(91, "memo-4", KEEP, "4 second voice memo", () => recordMemo(4000)),
    tool(92, "memo-10", KEEP, "10 second voice memo", () => recordMemo(10000)),
    tool(93, "photo", KEEP, "Take a photo into Cloud", async () => {
      if (!cloudUnlocked()) throw new Error("Nexus Cloud is part of Premium");
      const file = await pickFile("image/*", true);
      if (!file) return;
      await addCloudFiles([file], "photo");
      toast("Photo saved to Cloud", "success");
    }),
    tool(94, "file-cloud", KEEP, "Save a file into Cloud", async () => {
      if (!cloudUnlocked()) throw new Error("Nexus Cloud is part of Premium");
      const file = await pickFile("*/*");
      if (!file) return;
      await addCloudFiles([file], "file");
      toast("File saved to Cloud", "success");
    }),
    tool(95, "scan", KEEP, "Check a file or APK", async () => {
      const file = await pickFile("*/*");
      if (!file) return;
      const report = await defendFile(file);
      const line = report.findings.map((item) => item.detail).join(" ");
      toast(line || (report.ok ? "No threat found" : "Blocked"), report.ok ? "success" : "error");
    }),
    tool(96, "sync", KEEP, "Sync Cloud now", async () => {
      if (!cloudUnlocked()) throw new Error("Nexus Cloud is part of Premium");
      await syncCloudNow();
      toast("Cloud sync finished", "success");
    }),
    tool(97, "notify", KEEP, "Ask for notifications", async () => {
      if (!("Notification" in window)) throw new Error("Notifications need Safari on the Home Screen or the installed app");
      const perm = await Notification.requestPermission();
      toast(perm === "granted" ? "Notifications allowed" : perm === "denied" ? "Notifications are blocked in Settings" : "Notifications were not decided", "info");
    }),
    tool(98, "cache", KEEP, "Clear temporary caches", async () => {
      if (!("caches" in window)) throw new Error("No cache storage");
      const keys = await caches.keys();
      let cleared = 0;
      for (const key of keys) {
        if (key === "acetate-offline-v1") continue;
        await caches.delete(key);
        cleared += 1;
      }
      toast(cleared ? `Cleared ${cleared} temporary cache${cleared === 1 ? "" : "s"}` : "Nothing temporary to clear", "success");
    }),
    tool(99, "low-power", KEEP, "Low battery check", async () => {
      const row = await refreshHandset();
      if (!row || row.battery == null) throw new Error("Battery level is hidden in this browser");
      toast(row.battery < 20 ? `Low battery, ${row.battery}%` : `Battery is fine, ${row.battery}%`, row.battery < 20 ? "error" : "success");
    }),
    tool(100, "ipa", KEEP, "Copy the iPhone app download link", async () => {
      await shareUrl(NEXUS_IPA_RELEASES_URL, "Nexus for iPhone");
      toast("That page lists Nexus.ipa after the Mac build finishes. Install it with Sideloadly or AltStore.", "info");
    }),
  ];
  if (list.length !== 100) throw new Error(`Expected 100 iPhone tools, found ${list.length}`);
  return list;
}
