import Link from "next/link";
import { SellListingForm } from "@/components/sell-listing-form";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { getAccountContext } from "@/lib/account-context";
import { getStoreListingQuota } from "@/lib/store-allowance";
import { getInventoryItem, inventoryDb } from "@/lib/store-inventory";
import type { SupabaseClient } from "@supabase/supabase-js";

export const metadata = { title: "Publicar" };

export default async function StoreInventoryPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const { profile, store, supabase } = await getAccountContext();
  const eligible = profile?.account_type === "store_owner" && store && ["pending", "active"].includes(store.status);
  const { count } = eligible && supabase
    ? await supabase.from("listings").select("id", { count: "exact", head: true }).eq("store_id", store.id).in("status", ["pending", "approved"])
    : { count: 0 };
  // "Publicar este SKU" from Inventario: only an active, unlinked SKU of this store is offered; the database checks
  // the same again when the publication is completed.
  const requested = (await searchParams)?.sku;
  // "Publicar el siguiente SKU sin publicación" (FIX 05) asks for ?sku=siguiente: the first active, unlinked SKU.
  const skuId = requested === "siguiente" && eligible && supabase ? await nextUnpublishedSku(supabase, store.id) : requested;
  const item = eligible && supabase && typeof skuId === "string" ? await getInventoryItem(supabase, skuId) : null;
  const inventorySku = item && store && item.store_id === store.id && item.inventory_status === "active" && !item.listing_id
    ? { id: item.id, sku: item.merchant_sku, name: item.product_name, price: item.unit_price_pen, available: item.quantity_available }
    : undefined;
  const quota = await getStoreListingQuota(eligible ? supabase : null, count ?? 0);

  return (
      <div className="grid w-full max-w-4xl gap-6">
        <PageHeader eyebrow="Inventario" title={inventorySku ? `Publicar ${inventorySku.sku}` : "Publicar en tu tienda"} />
        {requested === "siguiente" && eligible && !inventorySku ? <Notice tone="success" role="note">Todos tus SKU activos ya tienen publicación. Puedes publicar un instrumento sin SKU.</Notice> : null}
        {!eligible ? <Notice tone="warning" role="note">Necesitas una cuenta de Tienda con una solicitud pendiente o aprobada.</Notice>
        : quota.remaining <= 0 ? <Notice tone="warning" role="note">Usaste todo tu cupo de publicaciones ({quota.allowance}). En <Link href="/mi-cuenta/tienda" className="link font-semibold">Mi tienda</Link> ves qué lo ocupa, puedes ocultar las agotadas o pedir más cupo.</Notice>
        : <SellListingForm
            profile={{ fullName: store.contact_person ?? store.name, phone: store.whatsapp_phone, city: store.city, region: store.region }}
            store={{ id: store.id, name: store.name, status: store.status as "pending" | "active", isVerified: store.is_verified }}
            inventorySku={inventorySku}
          />}
      </div>
  );
}

// The first active SKU of the store with no listing yet, in SKU order (FIX 05).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function nextUnpublishedSku(supabase: SupabaseClient<any, any, any>, storeId: string) {
  const { data } = await inventoryDb(supabase)
    .from("store_inventory_items")
    .select("id")
    .eq("store_id", storeId)
    .eq("inventory_status", "active")
    .is("listing_id", null)
    .order("merchant_sku", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as { id: string } | null)?.id;
}
