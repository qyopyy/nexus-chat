(async function nexusSafariContent() {
  const presets =
    (await browser.runtime.sendMessage({ type: "getPresets" }).catch(() => null)) ||
    {};

  if (presets.stripNoiseParams) {
    try {
      const url = new URL(window.location.href);
      const drop = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"];
      let changed = false;
      for (const key of drop) {
        if (url.searchParams.has(key)) {
          url.searchParams.delete(key);
          changed = true;
        }
      }
      if (changed) {
        window.history.replaceState({}, "", url.toString());
      }
    } catch (_) {
      /* ignore */
    }
  }

  if (!presets.showHud) return;

  const host = window.location.hostname;
  const allowed = Array.isArray(presets.allowlist)
    ? presets.allowlist.some((h) => host === h || host.endsWith(`.${h}`))
    : false;
  if (!allowed) return;

  const bar = document.createElement("div");
  bar.id = "nexus-safari-hud";
  bar.textContent = `Nexus Safari · shields ${presets.blockTrackers ? "on" : "off"} · DNS ${presets.dnsHint || "system"}`;
  Object.assign(bar.style, {
    position: "fixed",
    zIndex: "2147483646",
    left: "12px",
    bottom: "12px",
    padding: "8px 12px",
    borderRadius: "10px",
    background: "rgba(12, 18, 28, 0.88)",
    color: "#e8eef8",
    font: "600 12px/1.3 ui-sans-serif, system-ui, sans-serif",
    letterSpacing: "0.02em",
    boxShadow: "0 8px 24px rgba(0,0,0,0.28)",
    pointerEvents: "none",
  });
  document.documentElement.appendChild(bar);
  setTimeout(() => bar.remove(), 4200);
})();
