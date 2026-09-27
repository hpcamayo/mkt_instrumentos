import type { MetadataRoute } from "next";
import { NON_INDEXABLE_PATH_PREFIXES, absoluteUrl, isIndexableDeployment } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  if (!isIndexableDeployment()) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: NON_INDEXABLE_PATH_PREFIXES.map((prefix) => (prefix === "/api" ? "/api/" : prefix)),
    },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
