import "server-only";
import { revalidatePath } from "next/cache";

// Launch audit A19: listing pages and the home are cached and rebuilt in the background at most once a minute
// (app/instrumentos/[slug]/page.tsx, app/page.tsx).
// - When its owner or Admin changes a listing, its own page is dropped at once, so they see the change on their next
//   visit (dropListingPages).
// - A listing also shows on the home and in the "Similares" and "Más del vendedor" rows of other listings. Every
//   change to a public listing, its photos or an active store is recorded in the database, whichever path made it,
//   and within about a minute every cached listing page and the home are dropped (dropCachedListingPages, from
//   app/api/internal/public-pages/refresh). That holds even when a rebuild fails, which otherwise keeps the old copy.
// A failed drop of a listing's own page is caught up by the job; the job keeps its changes until a drop succeeds.
export function dropListingPages(slugs: (string | null | undefined)[]) {
  for (const slug of new Set(slugs)) {
    if (slug) drop(`/instrumentos/${slug}`);
  }
}

// True when both drops were accepted.
export function dropCachedListingPages() {
  const listings = drop("/instrumentos/[slug]", "page");
  const home = drop("/");
  return listings && home;
}

function drop(path: string, type?: "page") {
  try {
    revalidatePath(path, type);
    return true;
  } catch (error) {
    console.warn("listing-page-refresh-failed", error instanceof Error ? error.message : String(error));
    return false;
  }
}
