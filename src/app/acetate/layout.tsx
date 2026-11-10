import type { Metadata, Viewport } from "next";
import { ACETATE } from "@/lib/acetateBrand";

export const metadata: Metadata = {
  title: { absolute: "Acetate" },
  description: ACETATE.description,
  applicationName: "Acetate",
  manifest: "/acetate.webmanifest",
  appleWebApp: { capable: true, title: "Acetate", statusBarStyle: "black-translucent" },
  icons: {
    icon: [
      { url: "/acetate-icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/acetate-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/acetate-apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: ACETATE.ink,
};

export default function AcetateLayout({ children }: { children: React.ReactNode }) {
  return <div className="h-full bg-[#100e0c] text-[#f3eadf]">{children}</div>;
}
