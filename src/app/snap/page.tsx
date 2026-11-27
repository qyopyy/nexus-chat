import type { Metadata } from "next";
import SnapAppRoot from "@/components/snap/SnapAppRoot";

export const metadata: Metadata = {
  title: "Nexus Snap",
  description: "Take a photo, save it to your Nexus Drive vault and share it with a nexusproject.cc link instantly.",
};

/** Web version of Nexus Snap (any phone browser). */
export default function SnapPage() {
  return <SnapAppRoot />;
}
