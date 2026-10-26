import Link from "next/link";
import { redirect } from "next/navigation";
import { LabelSheetEditor, type LabelItem } from "@/components/store-floor/label-sheet";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { getAccountContext } from "@/lib/account-context";
import { formatPrice } from "@/lib/price";
import { absoluteUrl } from "@/lib/site";
import { UUID, getInventorySummary, inventoryDb, parseInventoryFilters } from "@/lib/store-inventory";

export const metadata = { title: "Etiquetas para la tienda" };

// Labels per print: enough for a shelf or a delivery, small enough to lay out quickly on a phone.
const MAX_SKUS = 200;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type ItemRow = {
  id: string;
  merchant_sku: string;
  product_name: string;
  variant_label: string | null;
  unit_price_pen: number | null;
  quantity_available: number;
  inventory_status: string;
  listing_id: string | null;
};

// reach-10: price labels for the SKU chosen in Inventario (?ids=…, or ?lista=… for "todos los que coinciden"), and the
// counter poster. Reads only; nothing is saved.
export default async function StoreLabelsPage({ searchParams }: { searchParams?: SearchParams }) {
  const { profile, store, supabase } = await getAccountContext();
  if (profile?.account_type !== "store_owner") redirect("/mi-cuenta/publicaciones");
  if (!store || !supabase) redirect("/mi-cuenta/tienda");
  const params = (await searchParams) ?? {};
  const summary = await getInventorySummary(supabase);

  let ids = (typeof params.ids === "string" ? params.ids.split(",") : []).filter((id) => UUID.test(id)).slice(0, MAX_SKUS);
  let truncated = false;
  if (!ids.length && typeof params.lista === "string" && params.lista.length <= 1200 && summary?.inventory_enabled) {
    const { filters } = parseInventoryFilters(Object.fromEntries(new URLSearchParams(params.lista)));
    const { data } = await inventoryDb(supabase).rpc("get_inventory_item_ids", {
      p_filters: { q: filters.q, stock: filters.stock, publication: filters.publication, category: filters.category, sort: filters.sort, price: filters.price },
    });
    const all = ((data as { ids?: string[] } | null)?.ids ?? []).filter((id) => UUID.test(id));
    truncated = all.length > MAX_SKUS;
    ids = all.slice(0, MAX_SKUS);
  }

  const items = ids.length ? await loadLabelItems(supabase, store.id, ids) : [];
  return (
    <div className="grid gap-6">
      <div data-print-hidden className="grid gap-4">
        <Breadcrumbs items={[{ label: "Inventario", href: "/mi-cuenta/tienda/inventario" }, { label: "Etiquetas" }]} />
        <PageHeader
          eyebrow="Mi tienda"
          title="Etiquetas para la tienda"
          meta="Precio, código de barras para Mostrador y un QR a la publicación. Se arman en tu navegador para papel de etiquetas o una impresora térmica."
          actions={<Link href="/mi-cuenta/tienda/etiquetas/cartel" className={buttonClasses({ variant: "secondary" })}>Cartel “Encuéntranos en Laria”</Link>}
        />
        {truncated ? <Notice tone="info" role="note">Se arman las etiquetas de los primeros {MAX_SKUS} SKU de la vista. Para el resto, elige otra página o un filtro más corto.</Notice> : null}
      </div>
      {items.length ? (
        <LabelSheetEditor items={items} />
      ) : (
        <EmptyState
          title="Elige qué SKU etiquetar"
          description={summary?.inventory_enabled
            ? "En Inventario, marca los SKU (o todos los de una vista) y toca “Imprimir etiquetas”. También desde la página de cada SKU."
            : "Las etiquetas de precio salen de Inventario, que aún no está activo para tu tienda. Ya puedes imprimir el cartel con el QR de tu tienda."}
          actions={summary?.inventory_enabled
            ? <Link href="/mi-cuenta/tienda/inventario" className={buttonClasses()}>Ir a Inventario</Link>
            : <Link href="/mi-cuenta/tienda/etiquetas/cartel" className={buttonClasses()}>Imprimir el cartel</Link>}
        />
      )}
    </div>
  );
}

async function loadLabelItems(supabase: NonNullable<Awaited<ReturnType<typeof getAccountContext>>["supabase"]>, storeId: string, ids: string[]): Promise<LabelItem[]> {
  const db = inventoryDb(supabase);
  const { data } = await db
    .from("store_inventory_items")
    .select("id,merchant_sku,product_name,variant_label,unit_price_pen,quantity_available,inventory_status,listing_id")
    .eq("store_id", storeId)
    .eq("inventory_status", "active")
    .in("id", ids);
  const rows = (data ?? []) as ItemRow[];
  const listingIds = rows.map((row) => row.listing_id).filter((id): id is string => Boolean(id));
  const { data: listings } = listingIds.length
    ? await db.from("listings").select("id,slug,status,price_pen,stock_state").in("id", listingIds)
    : { data: [] };
  const byId = new Map(((listings ?? []) as { id: string; slug: string; status: string; price_pen: number | null }[]).map((listing) => [listing.id, listing]));
  const order = new Map(ids.map((id, index) => [id, index]));
  return rows
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    .map((row) => {
      const listing = row.listing_id ? byId.get(row.listing_id) : undefined;
      const price = row.unit_price_pen ?? listing?.price_pen ?? null;
      // The shorter of /instrumentos/<slug> and /instrumentos/<id> (which redirects), for a smaller QR.
      const path = listing && listing.status === "approved"
        ? `/instrumentos/${listing.slug.length > listing.id.length ? listing.id : listing.slug}`
        : null;
      return {
        id: row.id,
        name: row.product_name,
        detail: row.variant_label,
        price: price === null ? null : formatPrice(price),
        sku: row.merchant_sku,
        url: path ? absoluteUrl(path) : null,
        available: row.quantity_available,
      };
    });
}
