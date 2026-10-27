// A store's listing allowance (docs/store-operations/design.md §10, decision D-1): 50 concurrent pending or published
// listings unless Admin set another value. The database enforces it (enforce_store_inventory_cap); this module only
// reads it for the screens and turns the database message into the screens' wording.
import type { DatabaseClient } from "@/lib/supabase/database";

export const DEFAULT_LISTING_ALLOWANCE = 50;

export type StoreListingQuota = { allowance: number; used: number; remaining: number };

// The signed-in owner's quota, or the default when it cannot be read (the database still enforces the real value).
export async function getStoreListingQuota(supabase: DatabaseClient | null, used: number): Promise<StoreListingQuota> {
  if (supabase) {
    const { data, error } = await supabase.rpc("get_store_listing_quota");
    const quota = data as { allowance?: unknown } | null;
    if (!error && typeof quota?.allowance === "number") {
      return { allowance: quota.allowance, used, remaining: Math.max(quota.allowance - used, 0) };
    }
  }
  return { allowance: DEFAULT_LISTING_ALLOWANCE, used, remaining: Math.max(DEFAULT_LISTING_ALLOWANCE - used, 0) };
}

// shop-05 (Effortless Laria, stores): one name everywhere, "Cupo de publicaciones", and the limit message says what to do.
export const ALLOWANCE_NAME = "Cupo de publicaciones";

// "STORE_INVENTORY_LIMIT_REACHED: La tienda ya tiene 500 publicaciones concurrentes." → the owner-facing sentence.
export function listingLimitMessage(databaseMessage: string | null | undefined) {
  const allowance = /ya tiene (\d+) publicaciones/.exec(databaseMessage ?? "")?.[1] ?? String(DEFAULT_LISTING_ALLOWANCE);
  return `Usaste todo tu cupo de publicaciones (${allowance}). Desde Mi tienda puedes liberar lugares o pedir más cupo.`;
}

// What uses the allowance, for the meter on Mi tienda (get_store_listing_allowance_detail).
export type StoreAdminRequest = {
  id: string;
  kind: "listing_allowance" | "inventory_access";
  status: "open" | "resolved" | "dismissed";
  message: string | null;
  requested_allowance: number | null;
  created_at: string;
};

export type StoreAllowanceDetail = StoreListingQuota & {
  pending: number;
  approved: number;
  outOfStock: number;
  openRequest: StoreAdminRequest | null;
};

export async function getStoreAllowanceDetail(supabase: DatabaseClient | null): Promise<StoreAllowanceDetail | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("get_store_listing_allowance_detail");
  const detail = data as Record<string, unknown> | null;
  if (error || typeof detail?.allowance !== "number") return null;
  const number = (key: string) => (typeof detail[key] === "number" ? (detail[key] as number) : 0);
  return {
    allowance: number("allowance"),
    used: number("used"),
    remaining: number("remaining"),
    pending: number("pending"),
    approved: number("approved"),
    outOfStock: number("out_of_stock"),
    openRequest: (detail.open_request as StoreAdminRequest | null) ?? null,
  };
}

// The meter's tone: calm until 80 %, stronger from there, and full at the allowance.
export function allowanceLevel(used: number, allowance: number): "ok" | "near" | "full" {
  if (allowance <= 0 || used >= allowance) return "full";
  return used / allowance >= 0.8 ? "near" : "ok";
}

// stock-21 and shop-05: the store's open request of a kind, if any (RLS limits the read to the owner's own store).
export async function getOpenStoreRequest(supabase: DatabaseClient | null, kind: StoreAdminRequest["kind"]): Promise<StoreAdminRequest | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("store_admin_requests")
    .select("id,kind,status,message,requested_allowance,created_at")
    .eq("kind", kind)
    .eq("status", "open")
    .maybeSingle();
  return error ? null : ((data as StoreAdminRequest | null) ?? null);
}
