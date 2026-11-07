import type { MetadataRoute } from "next";
import { SITE } from "@/lib/seo";

/** Static sitemap — public marketing + share surfaces. Dynamic profiles/posts are linked via OG pages. */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const paths = ["/", "/features", "/download", "/about", "/contact", "/login", "/register", "/bio", "/bio/app", "/bio/qyopy"];
  return paths.map((path) => ({
    url: `${SITE.url}${path === "/" ? "" : path}`,
    lastModified: now,
    changeFrequency: path === "/" ? "daily" : "monthly",
    priority: path === "/" ? 1 : 0.4,
  }));
}
