import type { CapacitorConfig } from "@capacitor/cli";

// Standalone Acetate shell — same Supabase backend and Nexus accounts, its own bundle id and icon.
// Web deploys to /acetate/app update this app without rebuilding.
const url = process.env.ACETATE_URL || process.env.NEXUS_URL || "https://nexusproject.cc/acetate/app";

const config: CapacitorConfig = {
  appId: "hu.qyopy.acetate",
  appName: "Acetate",
  webDir: "www",
  backgroundColor: "#100e0c",
  appendUserAgent: "AcetateApp NexusApp",
  server: {
    url,
    cleartext: false,
    allowNavigation: [
      "nexusproject.cc",
      "*.nexusproject.cc",
      "*.supabase.co",
      "*.vercel.app",
      "secure.soundcloud.com",
      "soundcloud.com",
      "*.soundcloud.com",
      "open.spotify.com",
      "youtube.com",
      "*.youtube.com",
      "youtu.be",
      "www.youtube-nocookie.com",
    ],
  },
  ios: {
    contentInset: "never",
    backgroundColor: "#100e0c",
    allowsLinkPreview: false,
    scrollEnabled: true,
    limitsNavigationsToAppBoundDomains: false,
  },
  android: {
    backgroundColor: "#100e0c",
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    Haptics: {},
  },
};

export default config;
