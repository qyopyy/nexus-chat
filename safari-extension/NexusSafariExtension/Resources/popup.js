const statusEl = document.getElementById("status");
const listEl = document.getElementById("preset-list");

function render(presets) {
  const rows = [
    ["Trackers blocked", presets.blockTrackers ? "On" : "Off"],
    ["HTTPS upgrade", presets.httpsUpgrade ? "On" : "Off"],
    ["Strip noise params", presets.stripNoiseParams ? "On" : "Off"],
    ["Page HUD", presets.showHud ? "On" : "Off"],
    ["DNS hint", presets.dnsHint || "system"],
    ["Allowlist", Array.isArray(presets.allowlist) ? presets.allowlist.join(", ") : "—"],
  ];
  listEl.innerHTML = rows
    .map(([label, value]) => `<li><span>${label}</span><span>${value}</span></li>`)
    .join("");
  statusEl.textContent = presets.updatedAt
    ? `Synced ${presets.updatedAt}`
    : "Using local / default presets";
}

async function refresh(forceNative) {
  statusEl.textContent = "Loading…";
  const type = forceNative ? "reloadPresets" : "getPresets";
  const presets = (await browser.runtime.sendMessage({ type })) || {};
  render(presets);
}

document.getElementById("reload").addEventListener("click", () => refresh(true));
refresh(false);
