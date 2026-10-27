// Bulk crawlers observed dominating the filter catalog. Search engines, social previews and user-triggered AI
// fetchers are deliberately absent. Clean category, store and listing URLs remain available to every crawler.
export const LIMITED_CATALOG_CRAWLERS = ["Amazonbot", "Reflectionbot", "MJ12bot"] as const;
const bulkCrawler = /(?:^|[\s;(])(?:Amazonbot|Reflectionbot|MJ12bot)(?:[\/;\s)]|$)/i;

export function isCatalogDataPath(pathname: string) {
  return pathname === "/listados" || pathname === "/listados/" || pathname === "/api/catalog" || pathname.startsWith("/api/catalog/");
}

export function blocksCatalogCrawler(pathname: string, userAgent: string) {
  return isCatalogDataPath(pathname) && bulkCrawler.test(userAgent);
}
