import "server-only";
import { catalogEnrichmentDisabled } from "@/lib/catalog-guard";
import { parseActiveDealers, type ActiveDealer } from "@/lib/dealers";
import { READ_BUDGETS, createDeadline, type Deadline } from "@/lib/request-deadline";
import { sharedAggregate } from "@/lib/shared-aggregate";
import { storeReachDb } from "@/lib/store-reach-db";
import { createPublicReadClient } from "@/lib/supabase/public-read-client";

// reach-04 "Distribuidor oficial": every authorization in force is one small public list, read once and shared for ten
// minutes by the listing page, the store page and the catalog (lib/shared-aggregate.ts), so none of them adds a query
// per visit. Admin's decisions refresh it at once (revalidateTag(DEALERS_CACHE_TAG) in the review route). The catalog
// recovery switch (LARIA_CATALOG_ENRICHMENT_DISABLED) turns the marks off with the other optional reads.

export const DEALERS_CACHE_TAG = "store-reach-dealers-v1";

async function loadDealers(deadline: Deadline) {
  const supabase = createPublicReadClient(deadline);
  if (!supabase) throw new Error("Supabase is not configured");
  const { data, error } = await storeReachDb(supabase).rpc("get_active_dealer_authorizations");
  if (error) throw new Error(error.message);
  return parseActiveDealers(data);
}

const dealers = sharedAggregate<[], ActiveDealer[]>({
  key: DEALERS_CACHE_TAG,
  revalidateSeconds: 600,
  load: loadDealers,
  loadBudgetMs: READ_BUDGETS.coreMs,
});

export async function getActiveDealers(signal?: AbortSignal): Promise<ActiveDealer[]> {
  if (catalogEnrichmentDisabled()) return [];
  return (await dealers.get(signal ?? createDeadline(READ_BUDGETS.optionalMs).signal)) ?? [];
}
