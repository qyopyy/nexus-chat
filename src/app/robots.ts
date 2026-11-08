import type { MetadataRoute } from "next";
import { SITE } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/distro", "/u/", "/n/", "/g/", "/v/", "/m/", "/b/", "/bump/"],
        disallow: ["/api/", "/login", "/register", "/spotify-callback", "/release/", "/distro/app$", "/distro/app?", "/distro/toolost-callback"],
      },
    ],
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}
