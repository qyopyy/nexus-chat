/**
 * Nexus desktop bridge — marks the webview as the .exe / .dmg shell and
 * handles the “discordo” easter egg (window title flip).
 */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("nexusDesktop", {
  ping: () => true,
  platform: process.platform,
  discordo: () => {
    try {
      ipcRenderer.send("nexus-discordo");
    } catch {
      /* ignore */
    }
  },
});

window.addEventListener("DOMContentLoaded", () => {
  document.documentElement.dataset.nexusDesktop = "1";
});
