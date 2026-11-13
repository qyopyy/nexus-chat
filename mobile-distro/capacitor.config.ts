import type { CapacitorConfig } from "@capacitor/cli";

// Standalone Distro shell — same Nexus account, its own icon. Opens the distribution workspace.
// Web deploys to /distro/app update this app without rebuilding.
const url = process.env.DISTRO_URL || process.env.NEXUS_URL || "https://nexusproject.cc/distro/app";

const config: CapacitorConfig = {
  appId: "hu.qyopy.distro",
  appName: "Distro",
  webDir: "www",
  backgroundColor: "#0e0e0e",
  appendUserAgent: "DistroApp",
  server: {
    url,
    cleartext: false,
    allowNavigation: [
      "nexusproject.cc",
      "*.nexusproject.cc",
      "panel.nexusproject.cc",
      "*.supabase.co",
      "*.vercel.app",
      "fonts.googleapis.com",
      "fonts.gstatic.com",
      "accounts.spotify.com",
      "accounts.google.com",
      "*.google.com",
      "developer.toolost.com",
      "open.spotify.com",
    ],
  },
  ios: {
    contentInset: "never",
    backgroundColor: "#0e0e0e",
    allowsLinkPreview: false,
    scrollEnabled: true,
    limitsNavigationsToAppBoundDomains: false,
  },
  android: {
    backgroundColor: "#0e0e0e",
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    Haptics: {},
  },
};

export default config;
