// Offers a "Nexus Pass" button next to login and one-time-code fields. Nothing is filled until you click it.
// This script never sees your vault: it asks the background worker, which asks your open Nexus tab.
(() => {
  if (window.top !== window) return;
  const SEND = (m) => new Promise((res) => chrome.runtime.sendMessage(m, (r) => res(chrome.runtime.lastError ? { ok: false, error: "Extension unavailable" } : r)));

  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 20 && r.height > 12 && s.visibility !== "hidden" && s.display !== "none" && !el.disabled && !el.readOnly;
  };
  const isPass = (el) => el instanceof HTMLInputElement && el.type === "password" && visible(el);
  const isOtp = (el) => {
    if (!(el instanceof HTMLInputElement) || !visible(el)) return false;
    if (!["text", "tel", "number", ""].includes(el.type)) return false;
    const hint = `${el.autocomplete} ${el.name} ${el.id} ${el.placeholder} ${el.getAttribute("aria-label") || ""}`.toLowerCase();
    return el.autocomplete === "one-time-code" || /(^|[^a-z])(otp|totp|2fa|mfa|verification[ _-]?code|security[ _-]?code|authenticator)([^a-z]|$)/.test(hint);
  };
  const isUser = (el) => {
    if (!(el instanceof HTMLInputElement) || !visible(el)) return false;
    if (!["text", "email", "tel", ""].includes(el.type)) return false;
    if (isOtp(el)) return false;
    const hint = `${el.autocomplete} ${el.name} ${el.id} ${el.placeholder}`.toLowerCase();
    return /user|login|email|e-mail|account|identifier/.test(hint) || el.autocomplete === "username";
  };

  function setValue(el, v) {
    const proto = Object.getPrototypeOf(el);
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    el.focus();
    setter ? setter.call(el, v) : (el.value = v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // ---------------------------------------------------------------- the button + menu (closed shadow DOM so the page can't read or click it)
  const host = document.createElement("div");
  host.style.cssText = "position:absolute;top:0;left:0;z-index:2147483647;all:initial";
  const root = host.attachShadow({ mode: "closed" });
  root.innerHTML = `<style>
    .b{position:fixed;display:none;width:26px;height:26px;border:0;border-radius:8px;background:#5865f2;color:#fff;font:700 13px system-ui;cursor:pointer;box-shadow:0 2px 8px #0006;padding:0}
    .m{position:fixed;display:none;min-width:220px;max-width:300px;background:#1e1f22;color:#f2f3f5;border-radius:12px;box-shadow:0 8px 28px #0009;font:13px system-ui;overflow:hidden}
    .m button{all:unset;display:block;width:100%;box-sizing:border-box;padding:9px 12px;cursor:pointer}
    .m button:hover{background:#35373c}
    .m small{display:block;color:#b5bac1}
    .m p{margin:0;padding:10px 12px;color:#b5bac1}
  </style><button class="b" title="Fill with Nexus Pass" aria-label="Fill with Nexus Pass">N</button><div class="m" role="menu"></div>`;
  const btn = root.querySelector(".b");
  const menu = root.querySelector(".m");
  let target = null;
  const attach = () => document.documentElement.appendChild(host);

  function place() {
    if (!target || !document.contains(target) || !visible(target)) return hide();
    const r = target.getBoundingClientRect();
    btn.style.display = "block";
    btn.style.top = Math.max(2, r.top + (r.height - 26) / 2) + "px";
    btn.style.left = Math.min(innerWidth - 30, r.right - 30) + "px";
  }
  function hide() {
    btn.style.display = "none";
    menu.style.display = "none";
  }
  function showMenu(html, onPick) {
    menu.innerHTML = html;
    const r = btn.getBoundingClientRect();
    menu.style.display = "block";
    menu.style.top = r.bottom + 6 + "px";
    menu.style.left = Math.max(6, Math.min(innerWidth - 306, r.right - 220)) + "px";
    if (onPick) menu.querySelectorAll("button[data-i]").forEach((b) => (b.onclick = () => onPick(Number(b.dataset.i))));
  }
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  function fillForm(d, from) {
    const form = from.form || document;
    const inputs = [...form.querySelectorAll("input")];
    const pw = inputs.find(isPass);
    const otp = inputs.find(isOtp);
    if (from === otp || (!pw && otp)) {
      if (d.totp) setValue(otp || from, d.totp);
      return;
    }
    if (pw && d.password) {
      const user = inputs.slice(0, inputs.indexOf(pw)).reverse().find(isUser);
      if (user && d.username) setValue(user, d.username);
      setValue(pw, d.password);
    } else if (isUser(from) && d.username) setValue(from, d.username); // first step of a two-page login
    if (otp && d.totp) setValue(otp, d.totp);
  }

  btn.onmousedown = (e) => e.preventDefault(); // keep focus in the field
  btn.onclick = async () => {
    if (menu.style.display === "block") return (menu.style.display = "none");
    const from = target;
    showMenu("<p>Asking Nexus…</p>");
    const r = await SEND({ kind: "fill:search" });
    if (!r?.ok) return showMenu(`<p>${esc(r?.error || "Couldn't reach Nexus")}</p>`);
    const hits = r.data || [];
    if (!hits.length) return showMenu("<p>No saved login for this site.</p>");
    const pick = async (i) => {
      const d = await SEND({ kind: "fill:get", id: hits[i].id });
      menu.style.display = "none";
      if (!d?.ok) return showMenu(`<p>${esc(d?.error || "Couldn't fill")}</p>`);
      fillForm(d.data, from);
      d.data.password = d.data.username = d.data.totp = ""; // don't keep it around
    };
    if (hits.length === 1) return pick(0);
    showMenu(hits.map((h, i) => `<button data-i="${i}" role="menuitem">${esc(h.title)}<small>${esc(h.username)}</small></button>`).join(""), pick);
  };

  // ---------------------------------------------------------------- when to show it
  const wanted = (el) => isPass(el) || isOtp(el) || (isUser(el) && !!(el.form && [...el.form.elements].some((x) => x instanceof HTMLInputElement && x.type === "password")));
  document.addEventListener(
    "focusin",
    (e) => {
      const el = e.target;
      if (el instanceof HTMLInputElement && wanted(el)) {
        target = el;
        attach();
        place();
      } else if (!(e.composedPath && e.composedPath().includes(host))) {
        target = null;
        hide();
      }
    },
    true,
  );
  addEventListener("scroll", () => target && place(), true);
  addEventListener("resize", () => target && place());
  document.addEventListener("keydown", (e) => e.key === "Escape" && hide(), true);
  // a login field the page puts under the pointer later (single-page apps) is picked up on its next focus; nothing runs until then
})();
