// Shared by the background worker. Every talk to Nexus goes through the open Nexus tab, which holds the unlocked vaults.
export const NEXUS_URLS = ["https://nexusproject.cc/*", "https://*.nexusproject.cc/*"];

export async function findNexusTab() {
  const tabs = await chrome.tabs.query({ url: NEXUS_URLS });
  // prefer a tab the person is looking at, then any
  return tabs.find((t) => t.active) || tabs[0] || null;
}

export async function relay(type, payload) {
  const tab = await findNexusTab();
  if (!tab || tab.id == null) return { ok: false, error: "Open Nexus in a browser tab first (a pinned tab is fine)." };
  try {
    const r = await chrome.tabs.sendMessage(tab.id, { kind: "to-page", type, payload });
    return r || { ok: false, error: "Nexus didn't answer. Reload the Nexus tab." };
  } catch {
    return { ok: false, error: "Nexus didn't answer. Reload the Nexus tab." };
  }
}

export const isWebUrl = (u) => {
  try {
    const p = new URL(u).protocol;
    return p === "https:" || p === "http:";
  } catch {
    return false;
  }
};
