import type { Metadata } from "next";
import DistroApp from "@/components/distro/DistroApp";

export const metadata: Metadata = { title: "Distro workspace", robots: { index: false } };

/** The distro workspace — releases, artists, analytics, earnings, tools, protection. Same Nexus sign-in. */
export default function DistroAppPage() {
  return <DistroApp />;
}
