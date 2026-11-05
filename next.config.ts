import type { NextConfig } from "next";

const noStore = "no-store, no-cache, must-revalidate, max-age=0";
/** Hashed JS/CSS must stay cacheable — CDN no-store on chunks breaks mid-session navigations (e.g. opening Servers). */
const immutable = "public, max-age=31536000, immutable";

const nextConfig: NextConfig = {
  reactStrictMode: false, // WebRTC + realtime subscriptions don't like double-mounting in dev
  async headers() {
    // Next matches the first source — put static chunks before the catch-all.
    return [
      {
        source: "/_next/static/:path*",
        headers: [
          { key: "Cache-Control", value: immutable },
          { key: "CDN-Cache-Control", value: immutable },
          { key: "Vercel-CDN-Cache-Control", value: immutable },
        ],
      },
      {
        source: "/_next/image/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" },
          { key: "CDN-Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" },
          { key: "Vercel-CDN-Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" },
        ],
      },
      // Cap/WebView HTML + API stay fresh after deploys
      {
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: noStore },
          { key: "CDN-Cache-Control", value: noStore },
          { key: "Vercel-CDN-Cache-Control", value: noStore },
        ],
      },
      {
        source: "/:path*",
        headers: [
          { key: "Cache-Control", value: noStore },
          { key: "CDN-Cache-Control", value: noStore },
          { key: "Vercel-CDN-Cache-Control", value: noStore },
          // Allow geolocation for Nexus Bump (iPhone Safari / Capacitor WebView)
          { key: "Permissions-Policy", value: "geolocation=(self), microphone=(self), camera=(self)" },
        ],
      },
    ];
  },
};

export default nextConfig;
