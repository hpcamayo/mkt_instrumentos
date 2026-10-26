import type { SupabaseClient } from "@supabase/supabase-js";

// bet-02: the services RPCs are not in the generated database types (the batch leaves database.types.ts to the
// integrator), so calls go through an untyped client, like the inventory ones (lib/store-inventory.ts).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function servicesDb(supabase: SupabaseClient<any, any, any>): SupabaseClient {
  return supabase as unknown as SupabaseClient;
}
