import type { MetadataRoute } from "next";
import { NON_INDEXABLE_PATH_PREFIXES, absoluteUrl, isIndexableDeployment } from "@/lib/site";
import { FILTERED_CATALOG_CRAWLER, LIMITED_CATALOG_CRAWLERS, filteredCatalogRobotPaths } from "@/lib/catalog-crawlers";

export default function robots(): MetadataRoute.Robots {
  if (!isIndexableDeployment()) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }

  const privatePaths = NON_INDEXABLE_PATH_PREFIXES.map((prefix) => (prefix === "/api" ? "/api/" : prefix));
  return {
    rules: [{
      userAgent: "*",
      allow: "/",
      disallow: privatePaths,
    }, {
      userAgent: [...LIMITED_CATALOG_CRAWLERS],
      allow: "/",
      // A specific crawler group replaces '*', so keep every private-route restriction too.
      disallow: [...privatePaths, "/listados"],
    }, {
      userAgent: FILTERED_CATALOG_CRAWLER,
      allow: "/",
      // Specific groups replace '*': retain private-route restrictions while leaving clean discovery available.
      disallow: [...privatePaths, ...filteredCatalogRobotPaths],
    }],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
