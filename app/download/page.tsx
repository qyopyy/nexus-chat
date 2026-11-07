import type { Metadata } from "next";
import DownloadPage from "@/components/site/DownloadPage";

export const metadata: Metadata = { title: "Download", description: "Get Nexus for iPhone, Android, Windows, macOS and the web.", alternates: { canonical: "/download" } };

export default function Page() {
  return <DownloadPage />;
}
