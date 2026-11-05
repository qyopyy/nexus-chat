/**
 * Nexus desktop shell — thin Electron wrapper around the live site
 * (same idea as mobile/ Capacitor). Set NEXUS_URL to point at staging.
 */
const { app, BrowserWindow, shell, session } = require("electron");
const path = require("path");

const START_URL = process.env.NEXUS_URL || "https://nexusproject.cc";

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#1e1f22",
    title: "Nexus",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });

  // Mic / camera / notifications — grant for our origin
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    const allow = ["media", "notifications", "display-capture", "clipboard-sanitized-write"].includes(permission);
    callback(allow);
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    // External links open in the system browser
    try {
      const u = new URL(url);
      const home = new URL(START_URL);
      if (u.origin === home.origin) return { action: "allow" };
    } catch {
      /* fall through */
    }
    void shell.openExternal(url);
    return { action: "deny" };
  });

  void win.loadURL(START_URL, {
    userAgent: win.webContents.getUserAgent() + " NexusDesktop",
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
