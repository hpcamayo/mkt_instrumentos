import { SellListingForm } from "@/components/sell-listing-form";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { getAccountContext } from "@/lib/account-context";
import { getStoreListingQuota } from "@/lib/store-allowance";
import { getInventoryItem } from "@/lib/store-inventory";

export const metadata = { title: "Publicar" };

export default async function StoreInventoryPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const { profile, store, supabase } = await getAccountContext();
  const eligible = profile?.account_type === "store_owner" && store && ["pending", "active"].includes(store.status);
  const { count } = eligible && supabase
    ? await supabase.from("listings").select("id", { count: "exact", head: true }).eq("store_id", store.id).in("status", ["pending", "approved"])
    : { count: 0 };
  // "Publicar este SKU" from Inventario: only an active, unlinked SKU of this store is offered; the database checks
  // the same again when the publication is completed.
  const skuId = (await searchParams)?.sku;
  const item = eligible && supabase && typeof skuId === "string" ? await getInventoryItem(supabase, skuId) : null;
  const inventorySku = item && store && item.store_id === store.id && item.inventory_status === "active" && !item.listing_id
    ? { id: item.id, sku: item.merchant_sku, name: item.product_name, price: item.unit_price_pen, available: item.quantity_available }
    : undefined;
  const quota = await getStoreListingQuota(eligible ? supabase : null, count ?? 0);

  return (
      <div className="grid w-full max-w-4xl gap-6">
        <PageHeader eyebrow="Inventario" title={inventorySku ? `Publicar ${inventorySku.sku}` : "Publicar en tu tienda"} />
        {!eligible ? <Notice tone="warning" role="note">Necesitas una cuenta de Tienda con una solicitud pendiente o aprobada.</Notice>
        : quota.remaining <= 0 ? <Notice tone="warning" role="note">Tu tienda alcanzó el límite de {quota.allowance} publicaciones concurrentes. Cuando una deje de estar en revisión o publicada, podrás publicar otra.</Notice>
        : <SellListingForm
            profile={{ fullName: store.contact_person ?? store.name, phone: store.whatsapp_phone, city: store.city, region: store.region }}
            store={{ id: store.id, name: store.name, status: store.status as "pending" | "active", isVerified: store.is_verified }}
            inventorySku={inventorySku}
          />}
      </div>
  );
}
