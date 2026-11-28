// Polls the clipboard while the browser runs and reports changes to the background worker.
// Nothing is stored here; the text goes straight to your open Nexus tab to be locked and sent.
let last = null;
const box = document.getElementById("t");
function read() {
  box.value = "";
  box.focus();
  document.execCommand("paste");
  return box.value;
}
setInterval(() => {
  let text = "";
  try {
    text = read();
  } catch {
    return;
  }
  if (last === null) {
    last = text; // whatever was already there when we started is not "new"
    return;
  }
  if (text && text !== last) {
    last = text;
    chrome.runtime.sendMessage({ kind: "watch:copied", text });
  } else if (!text) {
    last = text;
  }
}, 1500);
