import type { SupabaseClient } from "@supabase/supabase-js";

// Feature ideas, batch "store-reach": the batch's tables and functions are not in database.types.ts (it is generated
// from a hosted project, which this batch never touches), so its calls use an untyped view of the same client. RLS and
// the functions still decide what the caller sees.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function storeReachDb(supabase: SupabaseClient<any, any, any>): SupabaseClient {
  return supabase as unknown as SupabaseClient;
}

// The batch's functions raise "CODE: mensaje en español"; the message part is written for the person using the page.
const REACH_CODES = /^(ADMIN_REQUIRED|STORE_REQUIRED|STORE_NOT_ACTIVE|FEED_[A-Z_]+|DEALER_[A-Z_]+|CAMPAIGN_[A-Z_]+|DEMAND_[A-Z_]+|MERCADOLIBRE_[A-Z_]+): ([\s\S]+)$/;

export function storeReachErrorMessage(error: { message?: string } | null | undefined, fallback: string) {
  const match = REACH_CODES.exec(error?.message ?? "");
  return match ? match[2].slice(0, 300) : fallback;
}

export function storeReachErrorCode(error: { message?: string } | null | undefined) {
  return REACH_CODES.exec(error?.message ?? "")?.[1] ?? null;
}
