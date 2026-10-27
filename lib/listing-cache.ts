import "server-only";
import { revalidatePath } from "next/cache";

// Launch audit A19: listing pages and the home are cached and rebuilt in the background at most once a minute
// (app/instrumentos/[slug]/page.tsx, app/page.tsx).
// - When its owner or Admin changes a listing, its own page is dropped at once, so they see the change on their next
//   visit (dropListingPages).
// - A listing also shows on the home and in the "Similares" and "Más del vendedor" rows of other listings. When
//   listings leave public view (hidden, sold, out of stock, their store hidden or no longer verified), whichever path
//   made the change, every cached listing page and the home are dropped within about a minute
//   (dropCachedListingPages, from app/api/internal/public-pages/refresh). That holds even when a rebuild fails, which
//   otherwise keeps the old copy.
// Best effort: if a drop fails, the pages catch up on their next rebuild anyway.
export function dropListingPages(slugs: (string | null | undefined)[]) {
  for (const slug of new Set(slugs)) {
    if (slug) drop(`/instrumentos/${slug}`);
  }
}

export function dropCachedListingPages() {
  drop("/instrumentos/[slug]", "page");
  drop("/");
}

function drop(path: string, type?: "page") {
  try {
    revalidatePath(path, type);
  } catch (error) {
    console.warn("listing-page-refresh-failed", error instanceof Error ? error.message : String(error));
  }
}
