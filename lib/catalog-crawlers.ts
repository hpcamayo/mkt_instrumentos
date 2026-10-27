// Bulk crawlers observed dominating the filter catalog. Search engines, social previews and user-triggered AI
// fetchers are deliberately absent. Clean category, store and listing URLs remain available to every crawler.
export const LIMITED_CATALOG_CRAWLERS = ["Amazonbot", "Reflectionbot", "MJ12bot"] as const;
const bulkCrawler = /(?:^|[\s;(])(?:Amazonbot|Reflectionbot|MJ12bot)(?:[\/;\s)]|$)/i;

// Descubrir (big-02) reads the same catalog pages, with every photo, under any filters.
export function isCatalogDataPath(pathname: string) {
  return pathname === "/listados" || pathname === "/listados/" || pathname === "/descubrir" || pathname === "/descubrir/" || pathname === "/api/catalog" || pathname.startsWith("/api/catalog/");
}

export function blocksCatalogCrawler(pathname: string, userAgent: string) {
  return isCatalogDataPath(pathname) && bulkCrawler.test(userAgent);
}
