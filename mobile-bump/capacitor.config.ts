import type { CapacitorConfig } from "@capacitor/cli";

// Standalone Bump shell — same Supabase backend as Nexus, dedicated bundle id + icon.
// Web deploys to /bump/app update this app without rebuilding (except native permission changes).
const url = process.env.BUMP_URL || process.env.NEXUS_URL || "https://nexusproject.cc/bump/app";

const config: CapacitorConfig = {
  appId: "hu.qyopy.bump",
  appName: "Bump",
  webDir: "www",
  backgroundColor: "#0b3d24",
  // BumpApp UA → web app stays in the slim Bump shell + enables background location UX
  appendUserAgent: "BumpApp NexusApp",
  server: {
    url,
    cleartext: false,
    allowNavigation: [
      "nexusproject.cc",
      "*.nexusproject.cc",
      "*.supabase.co",
      "*.vercel.app",
      "fonts.googleapis.com",
      "fonts.gstatic.com",
      "accounts.spotify.com",
      "accounts.google.com",
      "*.google.com",
      "maps.apple.com",
    ],
  },
  ios: {
    contentInset: "never",
    backgroundColor: "#0b3d24",
    allowsLinkPreview: false,
    scrollEnabled: true,
    limitsNavigationsToAppBoundDomains: false,
  },
  android: {
    backgroundColor: "#0b3d24",
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    Haptics: {},
    Geolocation: {},
    PushNotifications: { presentationOptions: ["badge", "sound", "alert"] },
    LocalNotifications: { iconColor: "#22c55a", sound: "default" },
    Badge: { persist: true, autoClear: false },
  },
};

export default config;
