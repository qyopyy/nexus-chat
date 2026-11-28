import { relay, isWebUrl } from "./common.js";

const MENUS = [
  { id: "send-page", title: "Send this page to my devices", contexts: ["page"] },
  { id: "send-link", title: "Send this link to my devices", contexts: ["link"] },
  { id: "send-selection", title: "Send selection to Nexus Clip", contexts: ["selection"] },
];

function note(text, good) {
  chrome.action.setBadgeBackgroundColor({ color: good ? "#23a55a" : "#da373c" });
  chrome.action.setBadgeText({ text: good ? "✓" : "!" });
  setTimeout(() => chrome.action.setBadgeText({ text: "" }), 2500);
  if (!good) console.warn("Nexus Bridge:", text);
}

async function mediaTime(tabId) {
  try {
    const [r] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const m = [...document.querySelectorAll("video,audio")].find((x) => !x.paused && x.currentTime > 0) || document.querySelector("video,audio");
        return m && m.currentTime > 1 ? Math.floor(m.currentTime) : null;
      },
    });
    return r?.result ?? null;
  } catch {
    return null;
  }
}

export async function sendTab(tab) {
  if (!tab?.url || !isWebUrl(tab.url)) return { ok: false, error: "This page can't be sent." };
  const at = await mediaTime(tab.id);
  return relay("clip:handoff", { url: tab.url, title: tab.title || "", at });
}

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.contextMenus.removeAll();
  for (const m of MENUS) chrome.contextMenus.create(m);
  const { watch } = await chrome.storage.local.get("watch");
  if (watch === undefined) await chrome.storage.local.set({ watch: true });
  await syncWatcher();
});
chrome.runtime.onStartup.addListener(() => void syncWatcher());

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  let r;
  if (info.menuItemId === "send-page") r = await sendTab(tab);
  else if (info.menuItemId === "send-link" && info.linkUrl) r = await relay("clip:handoff", { url: info.linkUrl, title: "" });
  else if (info.menuItemId === "send-selection" && info.selectionText) r = await relay("clip:push", { text: info.selectionText });
  if (r) note(r.error, r.ok);
});

// ------------------------------------------------------------------ messages from the popup, the offscreen watcher and pages
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  (async () => {
    switch (msg?.kind) {
      case "popup:status":
        return reply(await relay("status", {}));
      case "popup:send-tab": {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        return reply(await sendTab(tab));
      }
      case "popup:send-clipboard":
        return reply(await relay("clip:push", { text: String(msg.text ?? "") }));
      case "popup:watch":
        await chrome.storage.local.set({ watch: !!msg.on });
        await syncWatcher();
        return reply({ ok: true });
      case "watch:copied": {
        if (sender.url && !sender.url.endsWith("/offscreen.html")) return reply({ ok: false });
        const { watch } = await chrome.storage.local.get("watch");
        if (!watch || typeof msg.text !== "string" || !msg.text.trim()) return reply({ ok: false });
        return reply(await relay("clip:push", { text: msg.text }));
      }
      // Autofill: the SITE is taken from the browser's own record of the sending tab, never from what the page says.
      case "fill:search": {
        const host = hostOf(sender.tab?.url);
        if (!host) return reply({ ok: false, error: "No site" });
        return reply(await relay("pass:search", { host }));
      }
      case "fill:get": {
        const host = hostOf(sender.tab?.url);
        if (!host || typeof msg.id !== "string") return reply({ ok: false, error: "No site" });
        return reply(await relay("pass:fill", { id: msg.id, host }));
      }
      default:
        return reply({ ok: false });
    }
  })();
  return true; // answer comes later
});

function hostOf(u) {
  try {
    const x = new URL(u || "");
    return x.protocol === "https:" || x.hostname === "localhost" || x.hostname === "127.0.0.1" ? x.hostname : "";
  } catch {
    return "";
  }
}

// ------------------------------------------------------------------ clipboard watcher (an offscreen page reads the clipboard)
async function syncWatcher() {
  const { watch } = await chrome.storage.local.get("watch");
  const has = await chrome.offscreen.hasDocument?.();
  if (watch && !has) await chrome.offscreen.createDocument({ url: "offscreen.html", reasons: ["CLIPBOARD"], justification: "Notice when you copy so it can be sent to your other devices." });
  if (!watch && has) await chrome.offscreen.closeDocument();
}
chrome.alarms.create("keepalive", { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener(() => void syncWatcher());
