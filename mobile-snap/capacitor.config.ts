import type { CapacitorConfig } from "@capacitor/cli";

// Standalone Nexus Snap shell: a camera that saves every photo to your Nexus Drive vault and makes a
// nexusproject.cc/s/<token> link instantly. Loads /snap/app live, so web deploys update the app.
const url = process.env.SNAP_URL || process.env.NEXUS_URL || "https://nexusproject.cc/snap/app";

const config: CapacitorConfig = {
  appId: "hu.qyopy.snap",
  appName: "Nexus Snap",
  webDir: "www",
  backgroundColor: "#000000",
  appendUserAgent: "NexusSnap NexusApp",
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
    backgroundColor: "#000000",
    allowsLinkPreview: false,
    scrollEnabled: false,
    limitsNavigationsToAppBoundDomains: false,
  },
  android: {
    backgroundColor: "#000000",
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    Haptics: {},
  },
};

export default config;
