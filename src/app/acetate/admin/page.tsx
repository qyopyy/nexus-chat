import type { Metadata } from "next";
import AcetateAdmin from "@/components/acetate/AcetateAdmin";

export const metadata: Metadata = {
  title: { absolute: "Admin · Acetate" },
  robots: { index: false, follow: false },
};

export default function AcetateAdminPage() {
  return <AcetateAdmin />;
}
