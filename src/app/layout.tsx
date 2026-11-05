import type { Metadata, Viewport } from "next";
import ThemeBoot from "@/components/ThemeBoot";
import { Analytics } from "@vercel/analytics/next";
import { SITE } from "@/lib/seo";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: "Nexus",
    template: "%s · Nexus",
  },
  description: SITE.tagline,
  applicationName: SITE.name,
  keywords: [
    "Nexus",
    "NexusGram",
    "chat",
    "voice chat",
    "video call",
    "screen share",
    "Shorts",
    "stories",
    "Nexus Live",
    "Nexus Radio",
    "social",
  ],
  authors: [{ name: "Nexus" }],
  creator: "Nexus",
  publisher: "Nexus",
  category: "social",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Nexus", statusBarStyle: "black-translucent" },
  icons: {
    icon: [
      { url: "/icon.png", sizes: "192x192", type: "image/png" },
      { url: SITE.icon512, sizes: "512x512", type: "image/png" },
      { url: SITE.icon1024, sizes: "1024x1024", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE.url,
    siteName: SITE.name,
    title: "Nexus",
    description: SITE.tagline,
    images: [
      {
        url: SITE.ogImage,
        width: 1200,
        height: 630,
        alt: "Nexus — chat, voice, video, create",
        type: "image/jpeg",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Nexus",
    description: SITE.tagline,
    images: [SITE.ogImage],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
  },
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0b0b0f" },
    { media: "(prefers-color-scheme: light)", color: "#1e1f22" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeBoot />
      </head>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
