import "server-only";
import { revalidatePath } from "next/cache";

// Launch audit A19: listing pages and the home are cached and rebuilt in the background at most once a minute
// (app/instrumentos/[slug]/page.tsx, app/page.tsx). A listing shows on its own page, on the home and in the "Similares"
// and "Más del vendedor" rows of other listings, so when its owner or Admin changes it every one of those copies is
// dropped: a hidden listing leaves them at once instead of at each page's next rebuild, which keeps the old copy when it
// fails. The next visit to each page builds it again. Best effort: if the drop fails, the pages catch up on their next
// rebuild anyway.
export function dropCachedListingPages() {
  try {
    revalidatePath("/instrumentos/[slug]", "page");
    revalidatePath("/");
  } catch (error) {
    console.warn("listing-page-refresh-failed", error instanceof Error ? error.message : String(error));
  }
}
