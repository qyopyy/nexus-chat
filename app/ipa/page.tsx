import type { Metadata } from "next";
import IpaSite from "@/components/site/IpaSite";

export const metadata: Metadata = {
  title: "Downloads",
  description: "Always-latest Nexus builds: iPhone .ipa files, Android, Windows and Mac.",
  alternates: { canonical: "/ipa" },
};

export default function Page() {
  return <IpaSite />;
}
