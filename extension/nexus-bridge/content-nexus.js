// Runs on Nexus pages only. Passes requests between the extension and the Nexus app in the tab.
(() => {
  const waiting = new Map();
  window.addEventListener("message", (e) => {
    if (e.source !== window || e.origin !== location.origin) return;
    const d = e.data;
    if (!d || d.source !== "nexus-page" || typeof d.id !== "string") return;
    const done = waiting.get(d.id);
    if (done) {
      waiting.delete(d.id);
      done({ ok: !!d.ok, data: d.data, error: d.error });
    }
  });
  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg?.kind !== "to-page") return;
    const id = crypto.randomUUID();
    const timer = setTimeout(() => {
      waiting.delete(id);
      reply({ ok: false, error: "Nexus didn't answer in time." });
    }, 20000);
    waiting.set(id, (r) => (clearTimeout(timer), reply(r)));
    window.postMessage({ source: "nexus-ext", id, type: msg.type, payload: msg.payload || {} }, location.origin);
    return true;
  });
})();
