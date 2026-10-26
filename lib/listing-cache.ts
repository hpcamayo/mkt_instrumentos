import "server-only";
import { revalidatePath } from "next/cache";

// Launch audit A19: a listing page is cached and rebuilt in the background at most once a minute
// (app/instrumentos/[slug]/page.tsx). When its owner or Admin changes the listing, its cached copy is dropped, so the
// next visit rebuilds it and the change shows at once. Best effort: if the drop fails, the page catches up within the
// minute anyway.
export function refreshListingPage(slug: string | null | undefined) {
  if (!slug) return;
  try {
    revalidatePath(`/instrumentos/${slug}`);
  } catch (error) {
    console.warn("listing-page-refresh-failed", error instanceof Error ? error.message : String(error));
  }
}
