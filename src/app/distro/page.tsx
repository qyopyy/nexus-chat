import type { Metadata } from "next";
import DistroLanding from "@/components/distro/DistroLanding";
import { SITE } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Distribution",
  description: "Release your music to Spotify, Apple Music, TikTok and 150+ stores — keep your rights, see your stats, get paid.",
  alternates: { canonical: `${SITE.url}/distro` },
};

export default function DistroPage() {
  return <DistroLanding />;
}
