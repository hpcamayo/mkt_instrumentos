import type { MetadataRoute } from "next";
import { NON_INDEXABLE_PATH_PREFIXES, absoluteUrl, isIndexableDeployment } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  if (!isIndexableDeployment()) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }

  return {
    rules: {
      userAgent: "*",
      // Feature ideas, store-reach batch (reach-02): Google Merchant Center and Meta read robots.txt before fetching a
      // product feed; the longer Allow wins over "Disallow: /api/".
      allow: ["/", "/api/feeds/"],
      disallow: NON_INDEXABLE_PATH_PREFIXES.map((prefix) => (prefix === "/api" ? "/api/" : prefix)),
    },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
