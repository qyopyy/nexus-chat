import type { Metadata } from "next";
import FeaturesPage from "@/components/site/FeaturesPage";

export const metadata: Metadata = { title: "Features", description: "Chat, HD calls, NexusGram, music tools, games and more — everything inside Nexus.", alternates: { canonical: "/features" } };

export default function Page() {
  return <FeaturesPage />;
}
