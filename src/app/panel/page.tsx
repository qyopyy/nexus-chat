import type { Metadata } from "next";
import DistributionPanelPage from "@/components/distribution/DistributionPanelPage";

export const metadata: Metadata = {
  title: { absolute: "Distribution panel — Acetate" },
  description: "Open the Nexus music distribution panel for releases, splits, and your panel account.",
  alternates: { canonical: "/panel" },
};

export default function PanelPage() {
  return <DistributionPanelPage />;
}
