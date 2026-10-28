import Link from "next/link";
import { redirect } from "next/navigation";
import { StoreAskBox } from "@/components/ai/store-ask-box";
import { UnderstoodPanel } from "@/components/ai/understood-panel";
import { InventoryCategoryChips } from "@/components/inventory/inventory-category-chips";
import { InventoryDemand } from "@/components/inventory/inventory-demand";
import { InventorySettingsButton } from "@/components/inventory/inventory-settings";
import { InventoryShortcuts } from "@/components/inventory/inventory-shortcuts";
import { InventoryViews } from "@/components/inventory/inventory-views";
import { InventorySummaryTiles } from "@/components/inventory/inventory-summary";
import { InventoryTable } from "@/components/inventory/inventory-table";
import { breakdownText, locationBreakdown } from "@/lib/store-locations";
import { getLocationStock, getOwnLocations } from "@/lib/store-locations-server";
import { InventoryToolbar } from "@/components/inventory/inventory-toolbar";
import { NewSkuButton } from "@/components/inventory/inventory-actions";
import {
  ListingManagementTable,
  type ManagedListing,
} from "@/components/listing-management-table";
import { getAccountContext } from "@/lib/account-context";
import { getAccountAnalytics } from "@/lib/account-analytics";
import { aiHelpersEnabled } from "@/lib/ai/config";
import { inventoryUnderstood, understoodFromParams } from "@/lib/ai/store-question";
import { getStoreListingQuota } from "@/lib/store-allowance";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import {
  activeFilterCount,
  exportViewHref,
  getInventoryCategoryCounts,
  getInventoryPage,
  getInventorySummary,
  getInventoryViews,
  getLinkedItemsByListing,
  getOutOfStockDemand,
  inventoryHref,
  pageRange,
  parseInventoryFilters,
  type InventorySummary,
  getLastImportErrors,
} from "@/lib/store-inventory";
import { cn } from "@/lib/utils";

export const metadata = { title: "Inventario de tienda" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// Import wizard (STORE-2).
const IMPORT_HREF = "/mi-cuenta/tienda/inventario/importar";
// Effortless Laria, inventory batch: the counter (big-10), reorder (stock-07) and prices (stock-15).
const COUNTER_HREF = "/mi-cuenta/tienda/inventario/mostrador";
const REORDER_HREF = "/mi-cuenta/tienda/inventario/reponer";
const PRICES_HREF = "/mi-cuenta/tienda/inventario/precios";

export default async function StoreInventoryPage({ searchParams }: { searchParams?: SearchParams }) {
  const { profile, store, supabase } = await getAccountContext();
  if (profile?.account_type !== "store_owner") redirect("/mi-cuenta/publicaciones");
  if (!store) redirect("/mi-cuenta/tienda");
  const params = (await searchParams) ?? {};
  const summary = supabase ? await getInventorySummary(supabase) : null;
  // Inventory is per store during the pilot (D-2): a store without it keeps the V1 publications table unchanged.
  if (summary?.inventory_enabled && params.vista !== "publicaciones") {
    return <InventoryView summary={summary} storeName={store.name} params={params} ask={aiHelpersEnabled()} />;
  }
  return <PublicationsView store={store} summary={summary} />;
}

async function InventoryView({ summary, storeName, params, ask }: { summary: InventorySummary; storeName: string; params: Record<string, string | string[] | undefined>; ask: boolean }) {
  const { supabase } = await getAccountContext();
  const { filters, cursor } = parseInventoryFilters(params);
  // stock-24: "Pregúntale a tu tienda" and, after a question, what it became.
  const understood = understoodFromParams(params);
  const [page, lastImport, categoryCounts, views, demand] = supabase
    ? await Promise.all([
      getInventoryPage(supabase, filters, cursor), getLastImportErrors(supabase), getInventoryCategoryCounts(supabase),
      getInventoryViews(supabase), cursor || activeFilterCount(filters) || filters.q ? Promise.resolve([]) : getOutOfStockDemand(supabase),
    ])
    : [null, null, null, [], []];
  // store-locations, run-02: units per location under each SKU's stock.
  const locations = supabase && page ? await getOwnLocations(supabase) : [];
  const locationStock = locations.length && supabase && page?.items.length ? (await getLocationStock(supabase, page.items[0].store_id, page.items.map((item) => item.id))) ?? [] : [];
  const locationLines = locations.length >= 2 && page
    ? Object.fromEntries(page.items.map((item) => [item.id, breakdownText(locationBreakdown(locations, locationStock, item.id))]))
    : undefined;
  const filtered = activeFilterCount(filters) > 0 || Boolean(filters.q);
  // stock-19: SKU pages keep the list they were opened from, for Anterior/Siguiente and the way back.
  const listQuery = inventoryHref(filters, cursor).split("?")[1] ?? "";
  return (
    <section className="rounded-panel border border-subtle bg-white">
      <PageHeader
        className="border-b border-subtle p-5"
        eyebrow="Mi tienda"
        title="Inventario"
        meta={`${storeName} · Stock informado por tu tienda`}
        actions={summary.can_write ? (
          <>
            <Link href={COUNTER_HREF} className={buttonClasses({ variant: "secondary" })}>Mostrador</Link>
            {IMPORT_HREF ? <Link href={IMPORT_HREF} className={buttonClasses({ variant: "secondary" })}>Importar desde Excel</Link> : null}
            <NewSkuButton />
          </>
        ) : null}
      />
      <ViewTabs current="inventario" />
      {!summary.can_write ? (
        <div className="border-b border-subtle p-4 md:p-5">
          <Notice tone="warning" role="note">Tu tienda no puede registrar cambios de inventario en este momento. Puedes consultar el stock y exportarlo.</Notice>
        </div>
      ) : null}
      {ask ? <StoreAskBox /> : null}
      {understood ? <UnderstoodPanel understood={inventoryUnderstood(filters, understood.gaps)} className="border-b border-subtle" /> : null}
      <InventorySummaryTiles summary={summary} importErrors={lastImport?.errors ?? null} importHref={lastImport?.href} />
      <InventoryDemand rows={demand} />
      <InventoryToolbar filters={filters} />
      <InventoryViews filters={filters} views={views} canWrite={summary.can_write} />
      <InventoryCategoryChips filters={filters} counts={categoryCounts} />
      {!page ? (
        <div className="p-5"><Notice tone="danger" role="alert">No se pudo cargar el inventario. Vuelve a intentarlo en unos minutos.</Notice></div>
      ) : page.items.length ? (
        <InventoryTable key={inventoryHref(filters, cursor)} items={page.items} canWrite={summary.can_write} total={page.total} filters={filters} listQuery={listQuery} locationLines={locationLines} />
      ) : filtered || cursor ? (
        <EmptyState className="rounded-none border-0" title="Ningún SKU coincide con la búsqueda" description="Prueba con otro SKU o nombre, o quita los filtros." actions={<Link href="/mi-cuenta/tienda/inventario" className={buttonClasses({ variant: "secondary" })}>Ver todo el inventario</Link>} />
      ) : (
        <EmptyState
          className="rounded-none border-0"
          title="Aún no tienes SKU en Inventario"
          description="Crea un SKU por cada instrumento o equipo que vendes y registra cuántas unidades tienes. También puedes controlar el stock de una publicación existente desde Publicaciones."
        />
      )}
      <footer className="grid gap-3 border-t border-subtle p-5 t-meta">
        {page && page.total > 0 ? (
          <nav aria-label="Páginas del inventario" className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
            <p className="t-ui font-semibold text-ink tabular-nums">{pageRange(page)} SKU</p>
            <div className="flex gap-4">
              {page.hasPrev ? <Link href={inventoryHref(filters, page.prevCursor)} rel="prev" className="link font-semibold">Anterior</Link> : null}
              {page.nextCursor ? <Link href={inventoryHref(filters, page.nextCursor)} rel="next" className="link font-semibold">Siguiente</Link> : null}
            </div>
          </nav>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <p>
            {filtered ? (
              <>
                Exportar esta vista:{" "}
                <a href={exportViewHref(filters, "xlsx")} className="link font-semibold">Excel</a>
                {" · "}
                <a href={exportViewHref(filters, "csv")} className="link font-semibold">CSV</a>
                {" · "}
                <a href={exportViewHref(filters, "xlsx", true)} className="link font-semibold">Excel con datos de la publicación</a>
                <br />
                Todo el inventario:{" "}
              </>
            ) : "Exportar inventario: "}
            <a href="/api/store/inventory/export?format=xlsx" className="link font-semibold">Excel</a>
            {" · "}
            <a href="/api/store/inventory/export?format=csv" className="link font-semibold">CSV</a>
            {filtered ? null : (
              <>
                {" · "}
                <a href="/api/store/inventory/export?format=xlsx&publicacion=1" className="link font-semibold">Excel con datos de la publicación</a>
              </>
            )}
          </p>
          <p className="flex flex-wrap gap-x-4 gap-y-2">
            <Link href={REORDER_HREF} className="link font-semibold">Reposición</Link>
            <Link href={PRICES_HREF} className="link font-semibold">Precios</Link>
            {/* store-floor, reach-10 */}
            <Link href="/mi-cuenta/tienda/etiquetas" className="link font-semibold">Etiquetas</Link>
            {summary.can_write ? <InventorySettingsButton preferences={summary.preferences ?? null} /> : null}
            <InventoryShortcuts />
          </p>
        </div>
      </footer>
    </section>
  );
}

function ViewTabs({ current }: { current: "inventario" | "publicaciones" }) {
  const tabs = [
    { key: "inventario", label: "Inventario", href: "/mi-cuenta/tienda/inventario" },
    { key: "publicaciones", label: "Publicaciones", href: "/mi-cuenta/tienda/inventario?vista=publicaciones" },
  ] as const;
  return (
    <nav aria-label="Vista del inventario" className="flex gap-1 border-b border-subtle px-3 md:px-4">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          aria-current={current === tab.key ? "page" : undefined}
          className={cn("-mb-px border-b-2 px-3 py-3 t-ui font-semibold", current === tab.key ? "border-ink text-ink" : "border-transparent text-ink-2 hover:text-ink")}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}

// The V1 store publications table. With inventory enabled it is the "Publicaciones" tab: listings linked to a SKU
// hide "Marcar vendida" (D-15) and unlinked ones offer "Controlar stock" (design §6.1).
async function PublicationsView({ store, summary }: { store: { id: string; name: string }; summary: InventorySummary | null }) {
  const { supabase } = await getAccountContext();
  const [{ data: listings }, analytics] = await Promise.all([
    supabase ? supabase.from("listings").select("id,title,status,slug,price_pen,created_at,published_at,sold_at,rejection_reason,hidden_source,hidden_reason").eq("store_id", store.id).order("created_at", { ascending: false }) : { data: [] },
    getAccountAnalytics(0),
  ]);
  const analyticsByListing = new Map(analytics?.listings.map((listing) => [listing.id, listing]) ?? []);
  const listingIds = listings?.map((listing) => listing.id) ?? [];
  const [{ data: revisions }, linkedItems] = await Promise.all([
    supabase && listingIds.length
      ? supabase.from("listing_revisions").select("listing_id,status,rejection_reason,submitted_at").in("listing_id", listingIds).order("submitted_at", { ascending: false })
      : Promise.resolve({ data: [] as { listing_id: string; status: string | null; rejection_reason: string | null }[] }),
    supabase && summary ? getLinkedItemsByListing(supabase, listingIds) : Promise.resolve(new Map<string, string>()),
  ]);
  const revisionByListing = new Map<string, { status: "pending" | "rejected" | null; reason: string | null }>();
  for (const revision of revisions ?? []) {
    if (!revisionByListing.has(revision.listing_id) && (revision.status === "pending" || revision.status === "rejected")) {
      revisionByListing.set(revision.listing_id, { status: revision.status, reason: revision.rejection_reason });
    }
  }
  const managedListings: ManagedListing[] = (listings ?? []).map((listing) => ({
    ...listing,
    analytics: analyticsByListing.get(listing.id),
    revisionStatus: revisionByListing.get(listing.id)?.status ?? null,
    revisionReason: revisionByListing.get(listing.id)?.reason ?? null,
    inventoryItemId: linkedItems.get(listing.id) ?? null,
  }));
  const concurrent = listings?.filter((item) => item.status === "pending" || item.status === "approved").length ?? 0;
  const quota = await getStoreListingQuota(supabase, concurrent);
  return (
    <section className="rounded-panel border border-subtle bg-white">
      <PageHeader
        className="border-b border-subtle p-5"
        eyebrow="Mi tienda"
        title={summary?.inventory_enabled ? "Publicaciones" : "Inventario"}
        meta={`${store.name} · Cupo de publicaciones: ${concurrent} de ${quota.allowance} en uso`}
        actions={quota.remaining > 0 ? <Link href="/mi-cuenta/tienda/publicar" className={buttonClasses()}>Publicar</Link> : <Link href="/mi-cuenta/tienda" className={buttonClasses({ variant: "secondary" })}>Cupo lleno: ver opciones</Link>}
      />
      {summary?.inventory_enabled ? <ViewTabs current="publicaciones" /> : null}
      <ListingManagementTable listings={managedListings} emptyMessage="Aún no hay publicaciones en el inventario" canControlStock={Boolean(summary?.can_write)} />
      <p className="border-t border-subtle p-5 text-meta leading-6 text-ink-2">{analytics ? "Vistas acumuladas de todo el historial, incluidas las históricas. Contactos por WhatsApp registrados desde el inicio del seguimiento; no equivalen a mensajes ni ventas." : "Las métricas no están disponibles en este momento; no se muestran ceros estimados."} La fecha de publicación corresponde a la primera publicación. <Link href="/mi-cuenta/tienda/estadisticas" className="link font-semibold">Ver estadísticas por periodo</Link>.</p>
    </section>
  );
}
