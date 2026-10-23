import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false, // WebRTC + realtime subscriptions don't like double-mounting in dev
};

export default nextConfig;
