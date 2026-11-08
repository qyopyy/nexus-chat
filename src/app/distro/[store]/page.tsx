import type { Metadata } from "next";
import { notFound } from "next/navigation";
import DistroStorePage from "@/components/distro/DistroStorePage";
import { SITE } from "@/lib/seo";
import { DISTRO, STORE_PAGES, ldJson, storeJsonLd, storePage } from "@/lib/distroSeo";

export const dynamicParams = false;
export function generateStaticParams() {
  return STORE_PAGES.map((s) => ({ store: s.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ store: string }> }): Promise<Metadata> {
  const s = storePage((await params).store);
  if (!s) return {};
  const url = `${SITE.url}${DISTRO.path}/${s.slug}`;
  const title = `${s.headline} — ${DISTRO.name}`;
  return {
    title: { absolute: title },
    description: s.description,
    keywords: [`${s.name} distribution`, `upload music to ${s.name}`, `release music on ${s.name}`, `get my song on ${s.name}`, "music distribution", DISTRO.name],
    alternates: { canonical: url },
    openGraph: { type: "website", url, siteName: SITE.name, title, description: s.description, images: [`${SITE.url}${DISTRO.path}/opengraph-image`] },
    twitter: { card: "summary_large_image", site: SITE.twitter, title, description: s.description, images: [`${SITE.url}${DISTRO.path}/opengraph-image`] },
  };
}

/** Store landing pages (/distro/spotify, /distro/tiktok, …) — keyword pages that link into the workspace. */
export default async function Page({ params }: { params: Promise<{ store: string }> }) {
  const s = storePage((await params).store);
  if (!s) {
    notFound();
    return null;
  }
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(storeJsonLd(s)) }} />
      <DistroStorePage slug={s.slug} />
    </>
  );
}
