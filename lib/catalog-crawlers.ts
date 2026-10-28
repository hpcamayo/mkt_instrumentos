import { catalogIndexing, catalogFilterKeys } from "@/lib/catalog-indexing";
import { searchParamsRecord } from "@/lib/catalog-request";

// These bulk crawlers retain their existing full catalog restriction. Search crawlers have a separate policy below.
export const LIMITED_CATALOG_CRAWLERS = ["Amazonbot", "Reflectionbot", "MJ12bot"] as const;
const bulkCrawler = /(?:^|[\s;(])(?:Amazonbot|Reflectionbot|MJ12bot)(?:[\/;\s)]|$)/i;

export function isCatalogDataPath(pathname: string) {
  return pathname === "/listados" || pathname === "/listados/" || pathname === "/api/catalog" || pathname.startsWith("/api/catalog/");
}

export function blocksCatalogCrawler(pathname: string, userAgent: string) {
  return isCatalogDataPath(pathname) && bulkCrawler.test(userAgent);
}

export const FILTERED_CATALOG_CRAWLER = "Amzn-SearchBot";
const searchCrawler = /(?:^|[\s;(])Amzn-SearchBot(?:[\/;\s)]|$)/i;

// No database/auth reads: the same classification that gives filtered pages noindex. Amzn-User is not this agent.
export function blocksFilteredCatalogCrawler(pathname: string, userAgent: string, params: URLSearchParams) {
  return isCatalogDataPath(pathname) && searchCrawler.test(userAgent)
    && catalogIndexing(searchParamsRecord(params)).filtered;
}

// REP hints match refinement keys at query boundaries, in either position and with/without a trailing slash.
// They also discourage empty-key duplicate URLs; the value-aware runtime guard still permits empty controls.
// Category-only aliases and page-only pagination remain crawlable.
export const filteredCatalogRobotPaths = [...catalogFilterKeys].filter((key) => key !== "category").flatMap((key) =>
  ["/listados", "/listados/"].flatMap((path) => [`${path}?${key}=`, `${path}?*&${key}=`]),
);
