import type { Metadata, Viewport } from "next";
import ThemeBoot from "@/components/ThemeBoot";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nexus",
  description: "Chat, voice, video and screen sharing with your friends.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Nexus", statusBarStyle: "black-translucent" },
  icons: { apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#1e1f22",
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
