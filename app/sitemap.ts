import type { MetadataRoute } from "next";
import { categoryLandingPages } from "@/lib/category-pages";
import { legalPages } from "@/lib/legal-pages";
import { DISCOVERABLE_STOCK_FILTER } from "@/lib/listings";
import { absoluteUrl, isIndexableDeployment } from "@/lib/site";
import { READ_BUDGETS, createDeadline } from "@/lib/request-deadline";
import { createPublicReadClient } from "@/lib/supabase/public-read-client";
import { SERVICE_CATEGORIES, serviceCategoryPath } from "@/lib/services";
import { servicesDb } from "@/lib/services-db";

export const dynamic = "force-dynamic";

// Bounded: batches of 1000, well under the 50,000-URL sitemap limit.
const BATCH_SIZE = 1000;
const MAX_LISTINGS = 20000;
const MAX_STORES = 2000;
const MAX_SERVICES = 5000;

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

  // Each batch gets the core budget, all of them 20 s together; a batch that fails ends the list there, as before.
  const supabase = createPublicReadClient(createDeadline(20_000), READ_BUDGETS.coreMs);
  if (!supabase) return entries;

  for (let offset = 0; offset < MAX_STORES; offset += BATCH_SIZE) {
    const { data, error } = await supabase
      .from("stores")
      .select("id,slug,updated_at")
      .eq("status", "active")
      .order("id")
      .range(offset, offset + BATCH_SIZE - 1);
    if (error || !data) break;
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
    if (error || !data) break;
    for (const listing of data) {
      entries.push({ url: absoluteUrl(`/instrumentos/${listing.slug}`), lastModified: listing.updated_at, changeFrequency: "weekly", priority: 0.7 });
    }
    if (data.length < BATCH_SIZE) break;
  }

  // feature-ideas services (bet-02): the services section, its five category pages and every public service.
  entries.push(
    { url: absoluteUrl("/servicios"), changeFrequency: "daily", priority: 0.6 },
    ...SERVICE_CATEGORIES.map((category): Entry => ({ url: absoluteUrl(serviceCategoryPath(category)), changeFrequency: "daily", priority: 0.5 })),
  );
  // A failed services read leaves the instrument entries above intact.
  try {
    for (let offset = 0; offset < MAX_SERVICES; offset += BATCH_SIZE) {
      const { data, error } = await servicesDb(supabase).rpc("get_public_service_paths", { p_offset: offset, p_limit: BATCH_SIZE });
      if (error || !Array.isArray(data)) break;
      for (const service of data as { path: string; updated_at: string }[]) {
        entries.push({ url: absoluteUrl(service.path), lastModified: service.updated_at, changeFrequency: "weekly", priority: 0.5 });
      }
      if (data.length < BATCH_SIZE) break;
    }
  } catch {
    // Services are optional in the sitemap.
  }

  return entries;
}
