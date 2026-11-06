import type { Metadata } from "next";
import LinkBioAppRoot from "@/components/linkbio/LinkBioAppRoot";
import { SITE } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Nexus Link Admin",
  description: "Manage Nexus Link invites, Premium, verified checkmarks, and badges.",
  robots: { index: false, follow: false },
  alternates: { canonical: `${SITE.url}/bio/admin` },
};

/** Standalone Nexus Link admin panel (`/bio/admin`). */
export default function BioAdminPage() {
  return <LinkBioAppRoot initialAdmin />;
}
