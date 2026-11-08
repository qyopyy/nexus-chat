import type { CapacitorConfig } from "@capacitor/cli";

// Nexus Browser — a private web browser (search, ad/tracker shields, encrypted DNS, reader mode).
// App Review 2.5.19: no over-the-air code updater, no push, and the shell only serves /browser/app
// (other nexusproject.cc pages redirect back there for this user agent — see src/proxy.ts).
const url = process.env.BROWSER_URL || process.env.NEXUS_URL || "https://nexusproject.cc/browser/app";

const config: CapacitorConfig = {
  // Must match App Store Connect Bundle ID (Nexus Browser - hu.qyopy.browser.B44X8B76QR)
  appId: "hu.qyopy.browser.B44X8B76QR",
  appName: "Nexus Browser",
  webDir: "www",
  backgroundColor: "#0b1220",
  appendUserAgent: "BrowserApp NexusBrowser NexusApp",
  server: {
    url,
    cleartext: false,
    allowNavigation: [
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
  },
};

export default config;
