import type { Metadata } from "next";
import DistroLanding from "@/components/distro/DistroLanding";
import { SITE } from "@/lib/seo";
import { DISTRO, distroJsonLd, ldJson } from "@/lib/distroSeo";

const url = `${SITE.url}${DISTRO.path}`;

export const metadata: Metadata = {
  title: { absolute: `${DISTRO.title} | ${DISTRO.name}` },
  description: DISTRO.description,
  keywords: DISTRO.keywords,
  alternates: { canonical: url },
  openGraph: { type: "website", url, siteName: SITE.name, title: `${DISTRO.name} — Put your music everywhere`, description: DISTRO.description },
  twitter: { card: "summary_large_image", site: SITE.twitter, title: `${DISTRO.name} — Put your music everywhere`, description: DISTRO.description },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 } },
};

export default function DistroPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(distroJsonLd()) }} />
      <DistroLanding />
    </>
  );
}
