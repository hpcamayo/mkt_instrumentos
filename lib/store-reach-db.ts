import type { SupabaseClient } from "@supabase/supabase-js";

// Feature ideas, batch "store-reach": the batch's tables and functions are not in database.types.ts (it is generated
// from a hosted project, which this batch never touches), so its calls use an untyped view of the same client. RLS and
// the functions still decide what the caller sees.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function storeReachDb(supabase: SupabaseClient<any, any, any>): SupabaseClient {
  return supabase as unknown as SupabaseClient;
}
