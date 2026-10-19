import Link from "next/link";
import { SellListingForm, type InventorySku } from "@/components/sell-listing-form";
import { DraftList } from "@/components/selling/draft-list";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { getAccountContext } from "@/lib/account-context";
import { listSellDrafts, loadSellBrands, loadSellPageData } from "@/lib/sell-page-data";
import { getStoreListingQuota } from "@/lib/store-allowance";
import { getInventoryItem, inventoryDb } from "@/lib/store-inventory";
import type { SupabaseClient } from "@supabase/supabase-js";

export const metadata = { title: "Publicar" };

export default async function StoreInventoryPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const { user, profile, store, supabase } = await getAccountContext();
  const eligible = profile?.account_type === "store_owner" && store && ["pending", "active"].includes(store.status);
  const { count } = eligible && supabase
    ? await supabase.from("listings").select("id", { count: "exact", head: true }).eq("store_id", store.id).in("status", ["pending", "approved"])
    : { count: 0 };
  // "Publicar este SKU" from Inventario: only an active, unlinked SKU of this store is offered; the database checks
  // the same again when the publication is completed.
  const params = (await searchParams) ?? {};
  const [data, drafts, brandsByCategory, storeDefaults] = eligible && supabase
    ? await Promise.all([
      loadSellPageData(supabase, { kind: "store_listing", params }),
      listSellDrafts(supabase, "store_listing"),
      loadSellBrands(),
      loadStoreDefaults(supabase, store.id),
    ])
    : [null, [], {}, undefined];
  // A draft started from a SKU opens with that SKU again.
  const requested = params.sku ?? data?.serverDraft?.inventory_item_id ?? undefined;
  // "Publicar el siguiente SKU sin publicación" (FIX 05) asks for ?sku=siguiente: the first active, unlinked SKU.
  const skuId = requested === "siguiente" && eligible && supabase ? await nextUnpublishedSku(supabase, store.id) : requested;
  const item = eligible && supabase && typeof skuId === "string" ? await getInventoryItem(supabase, skuId) : null;
  const inventorySku = item && store && item.store_id === store.id && item.inventory_status === "active" && !item.listing_id
    ? { id: item.id, sku: item.merchant_sku, name: item.product_name, price: item.unit_price_pen, available: item.quantity_available, category: item.category, details: await skuListingDetails(supabase!, item.id) }
    : undefined;
  const quota = await getStoreListingQuota(eligible ? supabase : null, count ?? 0);

  return (
      <div className="grid w-full max-w-4xl gap-6">
        <PageHeader eyebrow="Inventario" title={inventorySku ? `Publicar ${inventorySku.sku}` : "Publicar en tu tienda"} />
        {data?.draftMissing ? <Notice tone="warning" role="note">Ese borrador ya no existe: puede que ya lo hayas publicado o descartado.</Notice> : null}
        {requested === "siguiente" && eligible && !inventorySku ? <Notice tone="success" role="note">Todos tus SKU activos ya tienen publicación. Puedes publicar un instrumento sin SKU.</Notice> : null}
        {!eligible ? <Notice tone="warning" role="note">Necesitas una cuenta de Tienda con una solicitud pendiente o aprobada.</Notice>
        : quota.remaining <= 0 ? <Notice tone="warning" role="note">Usaste todo tu cupo de publicaciones ({quota.allowance}). En <Link href="/mi-cuenta/tienda" className="link font-semibold">Mi tienda</Link> ves qué lo ocupa, puedes ocultar las agotadas o pedir más cupo.</Notice>
        : <>
          <SellListingForm
            key={data?.serverDraft?.id ?? inventorySku?.id ?? "nuevo"}
            ownerId={user.id}
            profile={{ fullName: store.contact_person ?? store.name, phone: store.whatsapp_phone, city: store.city, region: store.region }}
            store={{ id: store.id, name: store.name, status: store.status as "pending" | "active", isVerified: store.is_verified }}
            inventorySku={inventorySku}
            brandsByCategory={brandsByCategory}
            storeDefaults={storeDefaults}
            serverDraft={data?.serverDraft}
          />
          <DraftList drafts={drafts.filter((draft) => draft.id !== data?.serverDraft?.id)} href="/mi-cuenta/tienda/publicar" />
          <p className="t-meta">La condición y el texto que se agregan a cada publicación se ajustan en <Link href="/mi-cuenta/tienda/valores-por-defecto" className="link font-semibold">valores por defecto</Link>.</p>
        </>}
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

// SHOP 06: the store's default condition and standard text. listing_details and store_listing_defaults are newer than
// the generated database types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadStoreDefaults(supabase: SupabaseClient<any, any, any>, storeId: string) {
  const { data } = await (supabase as SupabaseClient).from("store_listing_defaults").select("condition,description_footer").eq("store_id", storeId).maybeSingle();
  const row = data as { condition: string | null; description_footer: string | null } | null;
  return row ? { condition: row.condition, descriptionFooter: row.description_footer ?? "" } : undefined;
}

// STOCK 09: what the SKU remembers from its last publication or import.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function skuListingDetails(supabase: SupabaseClient<any, any, any>, itemId: string) {
  const { data } = await inventoryDb(supabase).from("store_inventory_items").select("listing_details").eq("id", itemId).maybeSingle();
  const details = (data as { listing_details?: unknown } | null)?.listing_details;
  return details && typeof details === "object" && !Array.isArray(details) ? details as NonNullable<InventorySku["details"]> : undefined;
}
