/**
 * Nexus Snap desktop shell: a thin Electron window around the live /snap/app page (same idea as mobile-snap).
 * Camera and microphone are allowed for the Nexus origin only. Set SNAP_URL to point at staging.
 */
const { app, BrowserWindow, shell, session } = require("electron");

const START_URL = process.env.SNAP_URL || process.env.NEXUS_URL || "https://nexusproject.cc/snap/app";
const HOME = new URL(START_URL);
const ALLOWED = new Set(["media", "mediaKeySystem", "geolocation", "clipboard-sanitized-write", "fullscreen"]);

// Apple / Google sign-in windows stay inside the app so the login can hand back to Nexus.
const AUTH = /^https:\/\/(appleid\.apple\.com|accounts\.google\.com)\//i;

const fromHome = (url) => {
  try {
    return new URL(url).origin === HOME.origin;
  } catch {
    return false;
  }
};

function createWindow() {
  const win = new BrowserWindow({
    width: 520,
    height: 900,
    minWidth: 380,
    minHeight: 640,
    backgroundColor: "#000000",
    title: "Nexus Snap",
    autoHideMenuBar: true,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (fromHome(url) || AUTH.test(url)) return { action: "allow" };
    if (/^https?:/i.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (fromHome(url) || AUTH.test(url)) return;
    event.preventDefault();
    if (/^https?:/i.test(url)) void shell.openExternal(url);
  });
  win.once("ready-to-show", () => win.show());
  void win.loadURL(START_URL, { userAgent: win.webContents.getUserAgent() + " NexusSnap NexusDesktop" });
  return win;
}

app.whenReady().then(() => {
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((wc, permission, callback, details) => {
    callback(ALLOWED.has(permission) && fromHome((details && details.requestingUrl) || wc.getURL()));
  });
  ses.setPermissionCheckHandler((wc, permission, origin) => ALLOWED.has(permission) && fromHome(origin || (wc && wc.getURL()) || ""));
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
