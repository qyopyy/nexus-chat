import type { Metadata } from "next";
import LinkBioLanding from "@/components/linkbio/LinkBioLanding";
import { SITE } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Nexus Link",
  description: "Invite-only link in bio — themes, Premium, verified checkmarks & badges.",
  alternates: { canonical: `${SITE.url}/bio` },
};

/** Nexus Link landing — editor at /bio/app, staff admin at /bio/admin. */
export default function BioLandingPage() {
  return <LinkBioLanding />;
}
