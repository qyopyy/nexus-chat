import type { CapacitorConfig } from "@capacitor/cli";

// The iOS/Android apps are native shells around the live site, so every web deploy
// updates the apps automatically — no rebuild needed for UI / bots / server features.
// Prefer the production domain; NEXUS_URL overrides for staging builds.
const url = process.env.NEXUS_URL || "https://nexusproject.cc";

const config: CapacitorConfig = {
  // Must match App Store Connect Bundle ID (Nexus - hu.qyopy.nexus.B44X8B76QR)
  appId: "hu.qyopy.nexus.B44X8B76QR",
  appName: "Nexus",
  webDir: "www",
  backgroundColor: "#1e1f22",
  // "NexusFCM" tells the web app this build has Firebase (google-services.json) → real push when closed
  appendUserAgent: process.env.NEXUS_FCM === "1" ? "NexusApp NexusFCM" : "NexusApp",
  server: {
    url,
    cleartext: false,
    // Spotify login happens inside the app, then returns to the site
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
      "*.youtube.com",
      "www.youtube.com",
      "youtube.com",
    ],
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
    Geolocation: {},
    PushNotifications: { presentationOptions: ["badge", "sound", "alert"] },
    LocalNotifications: { iconColor: "#5865F2", sound: "default" },
    Badge: {
      // Keep the home-screen unread count across launches
      persist: true,
      autoClear: false,
    },
  },
};

export default config;
