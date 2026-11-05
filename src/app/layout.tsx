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
  icons: { icon: "/icon.png", apple: "/apple-touch-icon.png" },
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE.url,
    siteName: SITE.name,
    title: "Nexus",
    description: SITE.tagline,
    images: [{ url: "/icon-512.png", width: 512, height: 512, alt: "Nexus" }],
  },
  twitter: {
    card: "summary",
    title: "Nexus",
    description: SITE.tagline,
    images: ["/icon-512.png"],
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
