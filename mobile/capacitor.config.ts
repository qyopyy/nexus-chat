import type { CapacitorConfig } from "@capacitor/cli";

// The iOS/Android apps are native shells around the live site, so every web deploy
// updates the apps automatically — no rebuild needed for UI changes.
const url = process.env.NEXUS_URL || "https://nexus-chat-plum.vercel.app";

const config: CapacitorConfig = {
  appId: "hu.qyopy.nexus",
  appName: "Nexus",
  webDir: "www",
  backgroundColor: "#1e1f22",
  server: {
    url,
    cleartext: false,
    // Spotify login happens inside the app, then returns to the site
    allowNavigation: ["*.supabase.co", "*.vercel.app", "fonts.googleapis.com", "fonts.gstatic.com", "accounts.spotify.com"],
  },
  ios: {
    contentInset: "never",
    backgroundColor: "#1e1f22",
    allowsLinkPreview: false,
    scrollEnabled: true,
    limitsNavigationsToAppBoundDomains: false,
  },
  android: {
    backgroundColor: "#1e1f22",
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    Haptics: {},
  },
};

export default config;
