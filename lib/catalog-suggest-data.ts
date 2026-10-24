import "server-only";
import { getTypeCountRows } from "@/lib/catalog-brands";
import { catalogEnrichmentDisabled } from "@/lib/catalog-guard";
import { buildSuggestions, type BrandModel, type Suggestion } from "@/lib/catalog-suggest";
import { READ_BUDGETS, type Deadline } from "@/lib/request-deadline";
import { createBreaker, sharedAggregate } from "@/lib/shared-aggregate";
import { createPublicReadClient } from "@/lib/supabase/public-read-client";

// FIND 01: the search box's suggestions. Categories and types come from the shared type counts (lib/catalog-brands.ts)
// instead of one catalog_type_counts call per keystroke; brands and models from catalog_suggest, shared for two
// minutes per typed text. Both are optional: whatever is late or unavailable is left out, and the search itself
// never depends on them. The recovery switch turns both off.
const suggestBreaker = createBreaker({ failures: 3, windowMs: 10_000, openMs: 30_000 });

const brandModels = sharedAggregate<[string], BrandModel[]>({
  key: "catalog-suggest-v1",
  revalidateSeconds: 120,
  memoryFreshMs: 120_000,
  persist: false,
  maxEntries: 500,
  loadBudgetMs: READ_BUDGETS.optionalMs,
  breaker: suggestBreaker,
  async load(deadline: Deadline, query: string) {
    const supabase = createPublicReadClient(deadline, READ_BUDGETS.optionalMs);
    if (!supabase) throw new Error("Supabase is not configured");
    const { data, error } = await supabase.rpc("catalog_suggest", { p_q: query, p_limit: 6 });
    if (error) throw new Error(error.message);
    return (data ?? []) as BrandModel[];
  },
});

// query: suggestionQuery's canonical text (folded, at most 60 characters).
export async function loadSuggestions(query: string, signal: AbortSignal): Promise<Suggestion[]> {
  if (catalogEnrichmentDisabled() || query.length < 2) return [];
  const [types, brands] = await Promise.all([getTypeCountRows(signal), brandModels.get(signal, query)]);
  return buildSuggestions(query, (types ?? []).map((row) => ({ ...row, listings: Number(row.listings) })), brands ?? []);
}

export function resetSuggestionsForTests() {
  brandModels.reset();
  suggestBreaker.reset();
}
