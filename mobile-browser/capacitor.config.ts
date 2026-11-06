import type { CapacitorConfig } from "@capacitor/cli";

// Standalone Nexus Browser shell — Google search + page fetch, dedicated home-screen icon.
const url = process.env.BROWSER_URL || process.env.NEXUS_URL || "https://nexusproject.cc/browser/app";

const config: CapacitorConfig = {
  appId: "hu.qyopy.browser",
  appName: "Nexus Browser",
  webDir: "www",
  backgroundColor: "#0b1220",
  appendUserAgent: "BrowserApp NexusBrowser NexusApp",
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
      "www.google.com",
      "google.com",
      "*.google.com",
      "www.bing.com",
      "duckduckgo.com",
      "html.duckduckgo.com",
      "search.brave.com",
      "www.startpage.com",
      "www.ecosia.org",
      "www.qwant.com",
      "dns.nextdns.io",
      "*.dns.nextdns.io",
      "cloudflare-dns.com",
      "dns.quad9.net",
      "dns.adguard-dns.com",
      "accounts.google.com",
      "accounts.spotify.com",
    ],
  },
  ios: {
    contentInset: "never",
    backgroundColor: "#0b1220",
    allowsLinkPreview: true,
    scrollEnabled: true,
    limitsNavigationsToAppBoundDomains: false,
  },
  android: {
    backgroundColor: "#0b1220",
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    Haptics: {},
    PushNotifications: { presentationOptions: ["badge", "sound", "alert"] },
    LocalNotifications: { iconColor: "#60a5fa", sound: "default" },
  },
};

export default config;
