import type { CapacitorConfig } from "@capacitor/cli";

// Standalone Untitled shell — Cutroom projects on the same Nexus account.
// Web deploys to /untitled/app update this app without rebuilding.
const url = process.env.UNTITLED_URL || process.env.NEXUS_URL || "https://nexusproject.cc/untitled/app";

const config: CapacitorConfig = {
  appId: "hu.qyopy.untitled",
  appName: "Untitled",
  webDir: "www",
  backgroundColor: "#070709",
  appendUserAgent: "UntitledApp",
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
    ],
  },
  ios: {
    contentInset: "never",
    backgroundColor: "#070709",
    allowsLinkPreview: false,
    scrollEnabled: true,
    limitsNavigationsToAppBoundDomains: false,
  },
  android: {
    backgroundColor: "#070709",
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    Haptics: {},
  },
};

export default config;
