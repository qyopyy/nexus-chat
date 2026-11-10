import type { Metadata } from "next";
import AcetateApp from "@/components/acetate/AcetateApp";

export const metadata: Metadata = {
  title: { absolute: "Library · Acetate" },
  robots: { index: false, follow: false },
};

export default function AcetateAppPage() {
  return <AcetateApp />;
}
