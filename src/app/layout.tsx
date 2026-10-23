import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { GATE_COOKIE, tokenValid } from "@/lib/gate-server";
import GateScreen from "@/components/GateScreen";
import ThemeBoot from "@/components/ThemeBoot";
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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const token = (await cookies()).get(GATE_COOKIE)?.value;
  const unlocked = tokenValid(token);

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeBoot />
      </head>
      <body>{unlocked ? children : <GateScreen />}</body>
    </html>
  );
}
