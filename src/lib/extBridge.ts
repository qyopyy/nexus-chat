"use client";

// Page side of the Nexus browser extension (see extProtocol.ts). Installed once for the whole app.
// It only answers messages from this same window, and only when the matching vault is unlocked.

import { FROM_PAGE, hostMatches, validateRequest, type ExtRequest, type PageReply } from "./extProtocol";

async function handle(req: ExtRequest): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  const clip = await import("./clipVault");
  const pass = await import("./passVault");
  const p = req.payload;
  switch (req.type) {
    case "status": {
      await Promise.all([clip.initClip(), pass.initPass()]);
      return { ok: true, data: { clip: clip.useClip.getState().status, pass: pass.usePass.getState().status, device: clip.getDevice().name } };
    }
    case "clip:push": {
      await clip.initClip();
      if (clip.useClip.getState().status !== "unlocked") return { ok: false, error: "Nexus Clip is locked. Unlock it in your Nexus tab." };
      if (typeof p.text !== "string") return { ok: false, error: "No text" };
      const it = await clip.sendText(p.text);
      return it ? { ok: true, data: { id: it.id } } : { ok: false, error: "Nothing was sent" };
    }
    case "clip:handoff": {
      await clip.initClip();
      if (clip.useClip.getState().status !== "unlocked") return { ok: false, error: "Nexus Clip is locked. Unlock it in your Nexus tab." };
      const ok = await clip.sendHandoff({ url: String(p.url ?? ""), title: typeof p.title === "string" ? p.title : undefined, at: typeof p.at === "number" ? p.at : null });
      return ok ? { ok: true, data: {} } : { ok: false, error: "That page can't be sent" };
    }
    case "pass:search": {
      await pass.initPass();
      const s = pass.usePass.getState();
      if (s.status !== "unlocked") return { ok: false, error: "Nexus Pass is locked. Unlock it in your Nexus tab." };
      const host = String(p.host ?? "");
      const hits = s.items.filter((i) => i.kind === "login" && (i.password || i.username) && hostMatches(i.url, host));
      // names and usernames only: never a password in a search answer
      return { ok: true, data: hits.slice(0, 8).map((i) => ({ id: i.id, title: i.title, username: i.username ?? "", hasTotp: !!i.totp })) };
    }
    case "pass:fill": {
      await pass.initPass();
      const s = pass.usePass.getState();
      if (s.status !== "unlocked") return { ok: false, error: "Nexus Pass is locked. Unlock it in your Nexus tab." };
      const it = s.items.find((i) => i.id === p.id);
      // the site is checked again here, so a wrong or forged request still can't pull a login for another site
      if (!it || it.kind !== "login" || !hostMatches(it.url, String(p.host ?? ""))) return { ok: false, error: "That login doesn't belong to this site." };
      let totp = "";
      if (it.totp) {
        const t = await import("./passTotp");
        const cfg = t.parseTotp(it.totp);
        if (cfg) totp = await t.totpNow(cfg);
      }
      return { ok: true, data: { username: it.username ?? "", password: it.password ?? "", totp } };
    }
  }
}

export function installExtBridge(): () => void {
  if (typeof window === "undefined") return () => {};
  const on = async (e: MessageEvent) => {
    if (e.source !== window || e.origin !== location.origin) return;
    const req = validateRequest(e.data);
    if (!req) return;
    let reply: PageReply;
    try {
      const r = await handle(req);
      reply = { source: FROM_PAGE, id: req.id, ...r };
    } catch {
      reply = { source: FROM_PAGE, id: req.id, ok: false, error: "Something went wrong" };
    }
    window.postMessage(reply, location.origin);
  };
  window.addEventListener("message", on);
  return () => window.removeEventListener("message", on);
}
