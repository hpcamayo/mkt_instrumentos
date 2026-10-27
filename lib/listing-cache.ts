import "server-only";
import { revalidatePath } from "next/cache";

// Launch audit A19: listing pages and the home are cached and rebuilt in the background at most once a minute
// (app/instrumentos/[slug]/page.tsx, app/page.tsx).
// - When its owner or Admin changes a listing, its own page is cleared at once, so they see the change on their next
//   visit (dropListingPages).
// - A listing also shows on the home and in the "Similares" and "Más del vendedor" rows of other listings. Every change
//   to what these pages show is recorded in the database, whichever path made it, and every minute while changes wait,
//   every cached listing page and the home are cleared (dropCachedListingPages, from app/api/internal/public-pages/refresh),
//   until the check page proves a clear reached the cache after each change.
// A failed clear of a listing's own page is caught up by the job.
export const CACHE_PROBE_PATH = "/api/public-pages/probe";

// The deployment this code runs in. Each deployment has a cache of its own, and a clear reaches only the cache of the
// deployment that asks for it, so the check page names the deployment that built it and the job trusts only its own.
// Vercel sets both at build time and at run time, while its system environment variables are on (the default). Without
// either (outside Vercel too) the job can't tell one cache from another, so it counts no change as done and clears the
// pages on every run while changes wait.
export function currentDeployment() {
  return process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_URL || null;
}

export function dropListingPages(slugs: (string | null | undefined)[]) {
  for (const slug of new Set(slugs)) {
    if (slug) drop(`/instrumentos/${slug}`);
  }
}

// True when every clear was accepted. Next.js sends them to the cache together, after the response. The check page goes
// last and only after the pages, so it never shows a new nonce for a clear that left them out.
export function dropCachedListingPages() {
  const listings = drop("/instrumentos/[slug]", "page");
  const home = drop("/");
  return listings && home && drop(CACHE_PROBE_PATH);
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
