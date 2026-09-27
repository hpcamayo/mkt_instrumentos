import type { MetadataRoute } from "next";
import { categoryLandingPages } from "@/lib/category-pages";
import { legalPages } from "@/lib/legal-pages";
import { absoluteUrl, isIndexableDeployment } from "@/lib/site";
import { getPublicSupabaseClient } from "@/lib/supabase/public-client";

export const dynamic = "force-dynamic";

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
    ...legalPages.map((page): Entry => ({ url: absoluteUrl(page.href), changeFrequency: "yearly", priority: 0.2 })),
  ];

  const supabase = getPublicSupabaseClient();
  if (!supabase) return entries;

  // Only non-empty category pages are indexable; RLS limits rows to public inventory.
  const categoryCounts = await Promise.all(
    categoryLandingPages.map(async (landing) => {
      const { count, error } = await supabase
        .from("listings")
        .select("id", { count: "exact", head: true })
        .eq("status", "approved")
        .eq("category", landing.category);
      return { landing, count: error ? 0 : count ?? 0 };
    }),
  );
  for (const { landing, count } of categoryCounts) {
    if (count > 0) entries.push({ url: absoluteUrl(`/instrumentos/${landing.slug}`), changeFrequency: "daily", priority: 0.8 });
  }

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

  // Approved public listings only; sold listings stay reachable but are not submitted.
  for (let offset = 0; offset < MAX_LISTINGS; offset += BATCH_SIZE) {
    const { data, error } = await supabase
      .from("listings")
      .select("id,slug,updated_at")
      .eq("status", "approved")
      .order("id")
      .range(offset, offset + BATCH_SIZE - 1);
    if (error || !data) break;
    for (const listing of data) {
      entries.push({ url: absoluteUrl(`/instrumentos/${listing.slug}`), lastModified: listing.updated_at, changeFrequency: "weekly", priority: 0.7 });
    }
    if (data.length < BATCH_SIZE) break;
  }

  return entries;
}
