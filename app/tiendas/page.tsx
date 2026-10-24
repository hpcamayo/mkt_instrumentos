import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { ListingCard } from "@/components/listing-card";
import { PageContainer } from "@/components/page-container";
import { Pagination } from "@/components/pagination";
import { STORE_DIRECTORY_GRID, StoreCityChips, StoreDirectoryCard, StoreDirectoryTabs } from "@/components/store/store-directory";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { fetchCatalogPage } from "@/lib/catalog";
import { catalogHref, clearedFilters, formatNumber } from "@/lib/catalog-filters";
import type { ListingCardData, ListingFilters } from "@/lib/listings";
import { getPageRedirect, parsePage } from "@/lib/pagination";
import {
  buildStoreDirectoryMetadata,
  filterStoresByCity,
  storeDirectoryCities,
  storeDirectoryCity,
  storeDirectoryHref,
  storeDirectoryView,
  type DirectoryStore,
} from "@/lib/store-storefront";
import { warnMissingSupabaseEnv, type getPublicSupabaseClient } from "@/lib/supabase/public-client";
import { getRequestReads } from "@/lib/supabase/public-read-client";

export const dynamic = "force-dynamic";
// A hard stop well past the read budgets (lib/request-deadline.ts), far below Vercel's 300 s default.
export const maxDuration = 30;

type StoresPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// The listings tab's grid: the catalog card without a sidebar, like the store page's.
const LISTINGS_GRID = "grid grid-cols-2 gap-x-3 gap-y-6 md:grid-cols-3 md:gap-x-5 md:gap-y-8 lg:grid-cols-4 xl:grid-cols-5";
const LISTINGS_GRID_SIZES = "(max-width: 767px) 50vw, (max-width: 1023px) 33vw, (max-width: 1279px) 25vw, 270px";

// The catalog's verified-store filter (Q20: seller type stays single choice), newest first.
const VERIFIED_LISTINGS: ListingFilters = { ...clearedFilters(), sellerType: "verified_store" };

export async function generateMetadata({ searchParams }: StoresPageProps): Promise<Metadata> {
  const resolved = await searchParams;
  return buildStoreDirectoryMetadata({ view: storeDirectoryView(resolved), city: storeDirectoryCity(resolved), page: parsePage(resolved.page) });
}

// find-13 (docs/ux-effortless/stores.md): the stores directory that "Tiendas verificadas" opens. Two tabs with their
// own URLs: /tiendas lists the active stores (verified first, then by name) with city chips; /tiendas?vista=publicaciones
// shows the listings of verified stores, 24 a page. Real figures only: public listings and verified-transaction
// ratings, nothing invented.
export default async function StoresPage({ searchParams }: StoresPageProps) {
  const resolved = await searchParams;
  const view = storeDirectoryView(resolved);
  const { supabase } = getRequestReads();
  if (!supabase) warnMissingSupabaseEnv();

  return (
    <section className="bg-surface">
      <PageContainer className="py-6 lg:py-8">
        <Breadcrumbs items={[{ label: "Inicio", href: "/" }, { label: "Tiendas" }]} className="mb-3" />
        <h1 className="t-page text-ink">Tiendas</h1>
        <p className="text-lead mt-2 max-w-[68ch] t-body text-ink-2">
          Tiendas de instrumentos y audio de todo el país. Las verificadas van primero: Laria revisó a mano su RUC, razón
          social y contacto. Coordinas el pago y la entrega directamente con cada tienda.
        </p>
        <div className="mt-5">
          <StoreDirectoryTabs view={view} />
        </div>
        <div className="mt-5">
          {!supabase ? (
            <Notice tone="warning">No pudimos cargar las tiendas. Intenta nuevamente en unos minutos.</Notice>
          ) : view === "publicaciones" ? (
            <VerifiedListings supabase={supabase} page={parsePage(resolved.page)} />
          ) : (
            <StoreList supabase={supabase} city={storeDirectoryCity(resolved)} />
          )}
        </div>
      </PageContainer>
    </section>
  );
}

type PublicSupabaseClient = NonNullable<ReturnType<typeof getPublicSupabaseClient>>;

async function StoreList({ supabase, city }: { supabase: PublicSupabaseClient; city?: string }) {
  const { data, error } = await supabase.rpc("get_public_store_directory");
  if (error) {
    console.error("Stores directory failed", error.message);
    return <Notice tone="danger" role="alert">No pudimos cargar las tiendas. Vuelve a intentarlo en unos minutos.</Notice>;
  }
  const stores = (data ?? []) as DirectoryStore[];
  if (stores.length === 0) {
    return (
      <EmptyState
        title="Aún no hay tiendas en Laria"
        description="Las tiendas aprobadas aparecerán aquí."
        actions={<Button href="/registrar-tienda" variant="secondary">Registrar mi tienda</Button>}
      />
    );
  }
  const cities = storeDirectoryCities(stores);
  const shown = filterStoresByCity(stores, city);
  return (
    <div className="grid gap-5">
      <StoreCityChips cities={cities} current={city} total={stores.length} />
      <p className="t-meta tabular-nums" id="tiendas-estado">
        {formatNumber(shown.length)} {shown.length === 1 ? "tienda" : "tiendas"}
        {city ? ` en ${city}` : ""}
      </p>
      {shown.length === 0 ? (
        <EmptyState
          title={`Aún no hay tiendas en ${city}`}
          description="Mira las tiendas de otras ciudades o vuelve más adelante."
          actions={<Button href={storeDirectoryHref()} variant="secondary">Ver todas las tiendas</Button>}
        />
      ) : (
        <ul className={STORE_DIRECTORY_GRID}>
          {shown.map((store) => (
            <li key={store.id} className="min-w-0">
              <StoreDirectoryCard store={store} />
            </li>
          ))}
          <li className="min-w-0">
            <div className="flex h-full flex-col rounded-panel bg-canvas p-4">
              <h2 className="t-card-title text-ink">¿Tienes una tienda?</h2>
              <p className="mt-1 t-ui text-ink-2">Publica tu inventario, recibe consultas por WhatsApp y muestra tu verificación.</p>
              <Link href="/registrar-tienda" className="link mt-3 inline-flex min-h-6 w-fit items-center t-ui font-semibold">
                Registrar mi tienda
              </Link>
            </div>
          </li>
        </ul>
      )}
    </div>
  );
}

async function VerifiedListings({ supabase, page }: { supabase: PublicSupabaseClient; page: number }) {
  const { data, count, error } = await fetchCatalogPage(supabase, VERIFIED_LISTINGS, page);
  const redirectPage = getPageRedirect(page, count, error);
  if (redirectPage !== null) redirect(storeDirectoryHref({ view: "publicaciones", page: redirectPage }));
  if (error) {
    return <Notice tone="danger" role="alert">No pudimos cargar las publicaciones. Vuelve a intentarlo en unos minutos.</Notice>;
  }
  const listings = (data ?? []) as ListingCardData[];
  const total = count ?? 0;
  // The full catalog has every filter (category, price, condition…) for the same listings.
  const catalog = catalogHref(VERIFIED_LISTINGS);
  if (listings.length === 0) {
    return (
      <EmptyState
        title="Aún no hay publicaciones de tiendas verificadas"
        description="Mira las tiendas o todo el catálogo mientras tanto."
        actions={
          <>
            <Button href={storeDirectoryHref()} variant="secondary">Ver tiendas</Button>
            <Button href="/listados" variant="quiet">Ver todo el catálogo</Button>
          </>
        }
      />
    );
  }
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <p className="t-meta tabular-nums">
          {formatNumber(total)} {total === 1 ? "publicación" : "publicaciones"} · Más recientes
        </p>
        <Link href={catalog} className="link inline-flex min-h-6 items-center t-ui font-semibold">
          Filtrar por categoría, precio o condición
        </Link>
      </div>
      <div className={LISTINGS_GRID}>
        {listings.map((listing, index) => (
          <ListingCard key={listing.id} listing={listing} eager={index < 4} headingLevel={2} sizes={LISTINGS_GRID_SIZES} />
        ))}
      </div>
      <Pagination page={page} total={total} path="/tiendas" params={{ vista: "publicaciones" }} />
    </div>
  );
}
