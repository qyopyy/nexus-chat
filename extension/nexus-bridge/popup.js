const $ = (id) => document.getElementById(id);
const say = (t, good) => {
  $("msg").textContent = t;
  $("msg").className = good ? "ok" : "bad";
};
const send = (m) => chrome.runtime.sendMessage(m);
const label = (s) => ({ unlocked: "unlocked", locked: "locked", none: "not set up", loading: "starting…", error: "error" })[s] || "–";

(async () => {
  const r = await send({ kind: "popup:status" });
  if (r?.ok) {
    $("tab").textContent = "connected";
    $("tab").className = "ok";
    $("clip").textContent = label(r.data.clip);
    $("pass").textContent = label(r.data.pass);
    $("clipb").disabled = $("send").disabled = r.data.clip !== "unlocked";
    if (r.data.clip !== "unlocked") say("Unlock Nexus Clip in your Nexus tab to send.", false);
  } else {
    $("tab").textContent = "not open";
    say(r?.error || "Open Nexus in a tab.", false);
    $("send").disabled = $("clipb").disabled = true;
  }
  $("watch").checked = !!(await chrome.storage.local.get("watch")).watch;
})();

$("send").onclick = async () => {
  const r = await send({ kind: "popup:send-tab" });
  say(r?.ok ? "Sent. Open Handoff on your other device." : r?.error || "Couldn't send.", !!r?.ok);
};
$("clipb").onclick = async () => {
  let text = "";
  try {
    text = await navigator.clipboard.readText();
  } catch {
    return say("Allow clipboard access to send it.", false);
  }
  if (!text.trim()) return say("Your clipboard is empty.", false);
  const r = await send({ kind: "popup:send-clipboard", text });
  say(r?.ok ? "Sent to your devices." : r?.error || "Couldn't send.", !!r?.ok);
};
$("watch").onchange = (e) => send({ kind: "popup:watch", on: e.target.checked });
