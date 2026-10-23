import type { CapacitorConfig } from "@capacitor/cli";

// The iOS app is a native shell around the live site, so every web deploy
// updates the app automatically — no rebuild needed for UI changes.
const url = process.env.NEXUS_URL || "https://nexus-chat.vercel.app";

const config: CapacitorConfig = {
  appId: "hu.qyopy.nexus",
  appName: "Nexus",
  webDir: "www",
  backgroundColor: "#1e1f22",
  server: {
    url,
    cleartext: false,
    allowNavigation: ["*.supabase.co", "*.vercel.app", "fonts.googleapis.com", "fonts.gstatic.com"],
  },
  ios: {
    contentInset: "never",
    backgroundColor: "#1e1f22",
    allowsLinkPreview: false,
    scrollEnabled: true,
    limitsNavigationsToAppBoundDomains: false,
  },
};

export default config;
