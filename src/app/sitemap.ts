import type { MetadataRoute } from "next";
import { SITE } from "@/lib/seo";
import { STORE_PAGES } from "@/lib/distroSeo";

/** Static sitemap — public marketing + share surfaces. Dynamic profiles/posts are linked via OG pages. */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const paths = ["/", "/features", "/download", "/about", "/contact", "/login", "/register", "/bio", "/bio/app", "/bio/qyopy", "/distro", ...STORE_PAGES.map((x) => `/distro/${x.slug}`)];
  return paths.map((path) => ({
    url: `${SITE.url}${path === "/" ? "" : path}`,
    lastModified: now,
    changeFrequency: path === "/" ? "daily" : path.startsWith("/distro") ? "weekly" : "monthly",
    priority: path === "/" ? 1 : path === "/distro" ? 0.9 : path.startsWith("/distro/") ? 0.7 : 0.4,
  }));
}
