import type { MetadataRoute } from "next";
import { categoryLandingPages } from "@/lib/category-pages";
import { legalPages } from "@/lib/legal-pages";
import { DISCOVERABLE_STOCK_FILTER } from "@/lib/listings";
import { renderPerRequestIfBuilding } from "@/lib/cache-build";
import { absoluteUrl, isIndexableDeployment } from "@/lib/site";
import { READ_BUDGETS, createDeadline } from "@/lib/request-deadline";
import { createPublicReadClient } from "@/lib/supabase/public-read-client";

// Launch audit A19: built at most once an hour instead of on every crawler request. A failed read throws, so the cache
// keeps the last full sitemap rather than an hour of a partial one (during the deploy, lib/cache-build.ts).
export const revalidate = 3600;

// Bounded: batches of 1000, well under the 50,000-URL sitemap limit.
const BATCH_SIZE = 1000;
const MAX_LISTINGS = 20000;
const MAX_STORES = 2000;

type Entry = MetadataRoute.Sitemap[number];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!isIndexableDeployment()) return [];

  const entries: Entry[] = [
    { url: absoluteUrl("/"), changeFrequency: "daily", priority: 1 },
    { url: absoluteUrl("/listados"), changeFrequency: "hourly", priority: 0.9 },
    // find-13: the stores directory (its city and listings tabs are noindex and left out).
    { url: absoluteUrl("/tiendas"), changeFrequency: "daily", priority: 0.7 },
    ...legalPages.map((page): Entry => ({ url: absoluteUrl(page.href), changeFrequency: "yearly", priority: 0.2 })),
    // Owner decision (13 Oct 2026): keep all ten landings discoverable before they have inventory.
    // Empty landing metadata still declares noindex until public listings are available.
    ...categoryLandingPages.map((landing): Entry => ({
      url: absoluteUrl(`/instrumentos/${landing.slug}`), changeFrequency: "daily", priority: 0.8,
    })),
  ];

  // Each batch gets the core budget, all of them 20 s together.
  const supabase = createPublicReadClient(createDeadline(20_000), READ_BUDGETS.coreMs);
  if (!supabase) return entries;

  for (let offset = 0; offset < MAX_STORES; offset += BATCH_SIZE) {
    const { data, error } = await supabase
      .from("stores")
      .select("id,slug,updated_at")
      .eq("status", "active")
      .order("id")
      .range(offset, offset + BATCH_SIZE - 1);
    if (error || !data) return readFailed("stores", error);
    for (const store of data) {
      entries.push({ url: absoluteUrl(`/tiendas/${store.slug}`), lastModified: store.updated_at, changeFrequency: "weekly", priority: 0.6 });
    }
    if (data.length < BATCH_SIZE) break;
  }

  // Approved public listings only; sold and out-of-stock listings stay reachable but are not submitted.
  for (let offset = 0; offset < MAX_LISTINGS; offset += BATCH_SIZE) {
    const { data, error } = await supabase
      .from("listings")
      .select("id,slug,updated_at")
      .eq("status", "approved")
      .or(DISCOVERABLE_STOCK_FILTER)
      .order("id")
      .range(offset, offset + BATCH_SIZE - 1);
    if (error || !data) return readFailed("listings", error);
    for (const listing of data) {
      entries.push({ url: absoluteUrl(`/instrumentos/${listing.slug}`), lastModified: listing.updated_at, changeFrequency: "weekly", priority: 0.7 });
    }
    if (data.length < BATCH_SIZE) break;
  }

  return entries;
}

async function readFailed(what: string, error: { message: string } | null): Promise<never> {
  await renderPerRequestIfBuilding("/sitemap.xml");
  throw new Error(`The sitemap's ${what} could not be read: ${error?.message ?? "no rows"}`);
}
