import { GUIDES_PATH, buyingGuides, guidePath } from "@/lib/discovery/buying-guides";
import { COLLECTIONS_PATH } from "@/lib/discovery/collections";
import { GIFTS_PATH, giftOccasions } from "@/lib/discovery/gift-finder";
import { ARTISTS_PATH, MAKERS_PATH } from "@/lib/discovery/makers";

// The discovery pages a search engine should find (docs/feature-ideas/discovery.md). Each collection's own page is
// listed from the database by the sitemap.
export function discoverySitemapPaths() {
  return [
    GIFTS_PATH,
    ...giftOccasions.map((occasion) => `${GIFTS_PATH}/${occasion.slug}`),
    GUIDES_PATH,
    ...buyingGuides.map((guide) => guidePath(guide.slug)),
    COLLECTIONS_PATH,
    MAKERS_PATH,
    ARTISTS_PATH,
  ];
}
