import type { MetadataRoute } from "next";
import { NON_INDEXABLE_PATH_PREFIXES, absoluteUrl, isIndexableDeployment } from "@/lib/site";
import { LIMITED_CATALOG_CRAWLERS } from "@/lib/catalog-crawlers";

export default function robots(): MetadataRoute.Robots {
  if (!isIndexableDeployment()) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }

  const privatePaths = NON_INDEXABLE_PATH_PREFIXES.map((prefix) => (prefix === "/api" ? "/api/" : prefix));
  return {
    rules: [{
      userAgent: "*",
      // Feature ideas, store-reach batch (reach-02): Google Merchant Center and Meta read robots.txt before fetching a
      // product feed; the longer Allow wins over "Disallow: /api/".
      allow: ["/", "/api/feeds/"],
      disallow: privatePaths,
    }, {
      userAgent: [...LIMITED_CATALOG_CRAWLERS],
      allow: "/",
      // A specific crawler group replaces '*', so keep every private-route restriction too.
      disallow: [...privatePaths, "/listados"],
    }],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
