/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  compiler: { removeConsole: process.env.NODE_ENV === "production" },
  images: { formats: ['image/avif', 'image/webp'], minimumCacheTTL: 604800 },
  experimental: { optimizeCss: true, scrollRestoration: true }
};
module.exports = nextConfig;
