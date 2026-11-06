import type { CapacitorConfig } from "@capacitor/cli";

// Standalone Nexus Link shell — invite-only link-in-bio editor at /bio/app.
// Web deploys update this app without rebuilding (except native permission / Cap config changes).
const url = process.env.LINKBIO_URL || process.env.NEXUS_URL || "https://nexusproject.cc/bio/app";

const config: CapacitorConfig = {
  appId: "hu.qyopy.link",
  appName: "Nexus Link",
  webDir: "www",
  backgroundColor: "#0a0214",
  appendUserAgent: "LinkBioApp NexusLink NexusApp",
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
      "accounts.google.com",
      "accounts.spotify.com",
      "accounts.apple.com",
      "appleid.apple.com",
    ],
  },
  ios: {
    contentInset: "never",
    backgroundColor: "#0a0214",
    allowsLinkPreview: false,
    scrollEnabled: true,
    limitsNavigationsToAppBoundDomains: false,
  },
  android: {
    backgroundColor: "#0a0214",
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    Haptics: {},
    PushNotifications: { presentationOptions: ["badge", "sound", "alert"] },
    LocalNotifications: { iconColor: "#a855f7", sound: "default" },
  },
};

export default config;
