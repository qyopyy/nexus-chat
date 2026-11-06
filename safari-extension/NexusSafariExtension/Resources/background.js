const DEFAULT_PRESETS = {
  blockTrackers: true,
  httpsUpgrade: true,
  stripNoiseParams: true,
  showHud: false,
  dnsHint: "system",
  allowlist: ["nexusproject.cc", "localhost"],
};

async function loadPresets() {
  try {
    const native = await browser.runtime.sendNativeMessage("application.id", {
      type: "getPresets",
    });
    if (native?.presets) {
      await browser.storage.local.set({ presets: native.presets });
      return native.presets;
    }
  } catch (_) {
    // Native messaging unavailable until the Mac app / appex is installed.
  }
  const stored = await browser.storage.local.get("presets");
  return stored.presets || DEFAULT_PRESETS;
}

async function applyTrackerRules(enabled) {
  try {
    await browser.declarativeNetRequest.updateEnabledRulesets({
      enableRulesetIds: enabled ? ["tracker_block"] : [],
      disableRulesetIds: enabled ? [] : ["tracker_block"],
    });
  } catch (_) {
    // declarativeNetRequest may be unavailable in some Safari builds.
  }
}

browser.runtime.onInstalled.addListener(async () => {
  const presets = await loadPresets();
  await applyTrackerRules(!!presets.blockTrackers);
});

browser.runtime.onMessage.addListener(async (message) => {
  if (message?.type === "getPresets") {
    return await loadPresets();
  }
  if (message?.type === "reloadPresets") {
    const presets = await loadPresets();
    await applyTrackerRules(!!presets.blockTrackers);
    return presets;
  }
  return null;
});

browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "loading" || !tab.url) return;
  const presets = await loadPresets();
  if (!presets.httpsUpgrade) return;
  try {
    const url = new URL(tab.url);
    if (url.protocol === "http:" && !url.hostname.includes("localhost")) {
      url.protocol = "https:";
      await browser.tabs.update(tabId, { url: url.toString() });
    }
  } catch (_) {
    /* ignore bad URLs */
  }
});
