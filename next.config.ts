import type { NextConfig } from "next";

const noStore = "no-store, no-cache, must-revalidate, max-age=0";

const nextConfig: NextConfig = {
  reactStrictMode: false, // WebRTC + realtime subscriptions don't like double-mounting in dev
  // Phone shells (Capacitor) load this site remotely — keep HTML fresh so deploys apply instantly.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "CDN-Cache-Control", value: noStore },
          { key: "Vercel-CDN-Cache-Control", value: noStore },
        ],
      },
      {
        source: "/",
        headers: [{ key: "Cache-Control", value: noStore }],
      },
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: noStore }],
      },
      {
        source: "/((?!_next/static|_next/image|icon|og-image|apple-touch|favicon|manifest).*)",
        headers: [{ key: "Cache-Control", value: noStore }],
      },
    ];
  },
};

export default nextConfig;
