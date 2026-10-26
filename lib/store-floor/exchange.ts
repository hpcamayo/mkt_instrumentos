import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConditionGroup } from "@/lib/store-floor/warranty";

// One exchange promise per store outside its listings, so the store page and /regalos never show two. The store's own
// returns terms (reach-09, store_warranty_policies) win when they accept exchanges; otherwise discovery's gift exchange
// policy (buy-05, store_gift_policies) applies. Of the terms, new gear's come first (gifts are mostly new), then the
// longest. Terms that say "no exchanges" (0 days) leave the gift policy in place: that one is only about gifts.

export type ExchangeTermsRow = { condition_group: ConditionGroup | string; returns_days: number | null; returns_note: string | null };
export type GiftExchangePolicy = { exchange_days: number; note: string | null };
export type StoreExchange = { days: number; note: string | null; source: "terms" | "gift" };

export function storeExchange(terms: ExchangeTermsRow[] | null | undefined, gift: GiftExchangePolicy | null | undefined): StoreExchange | null {
  const accepting = (terms ?? []).filter((row) => (row.returns_days ?? 0) > 0);
  const chosen = accepting.find((row) => row.condition_group === "new")
    ?? accepting.reduce<ExchangeTermsRow | null>((best, row) => (!best || (row.returns_days ?? 0) > (best.returns_days ?? 0) ? row : best), null);
  if (chosen) return { days: chosen.returns_days ?? 0, note: chosen.returns_note, source: "terms" };
  return gift ? { days: gift.exchange_days, note: gift.note, source: "gift" } : null;
}

const TERMS_COLUMNS = "condition_group,returns_days,returns_note";

// The store page: its returns terms (public for active stores), or null when the read failed.
export async function readStoreExchangeTerms(db: SupabaseClient, storeId: string): Promise<ExchangeTermsRow[] | null> {
  const { data, error } = await db.from("store_warranty_policies").select(TERMS_COLUMNS).eq("store_id", storeId);
  return error ? null : ((data ?? []) as ExchangeTermsRow[]);
}

// /regalos: each listed store's gift policy replaced by its returns terms where those accept exchanges. A failed read
// keeps the gift policies as they are.
export async function withStoreExchangeTerms<T extends { store_slug: string; exchange_days: number; note: string | null }>(
  db: SupabaseClient | null,
  stores: T[],
): Promise<T[]> {
  if (!db || stores.length === 0) return stores;
  const { data, error } = await db
    .from("stores")
    .select(`slug,store_warranty_policies(${TERMS_COLUMNS})`)
    .in("slug", stores.map((store) => store.store_slug));
  if (error) {
    console.error(`Store floor: the exchange terms read failed: ${error.message}`);
    return stores;
  }
  const terms = new Map((data as { slug: string; store_warranty_policies: ExchangeTermsRow[] | null }[] ?? [])
    .map((row) => [row.slug, row.store_warranty_policies ?? []]));
  return stores.map((store) => {
    const exchange = storeExchange(terms.get(store.store_slug), { exchange_days: store.exchange_days, note: store.note });
    return exchange?.source === "terms" ? { ...store, exchange_days: exchange.days, note: exchange.note } : store;
  });
}
