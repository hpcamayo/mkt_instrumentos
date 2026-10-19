import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import type { Metadata } from "next";
import { cache } from "react";
import { CatalogLink, CatalogNavigation, CatalogResults } from "@/components/catalog-navigation";
import { JsonLd } from "@/components/json-ld";
import { ListingCard } from "@/components/listing-card";
import { ReputationSection } from "@/components/listing/reputation-section";
import { StoreVisitTelemetry } from "@/components/marketplace-telemetry";
import { PageContainer } from "@/components/page-container";
import { Pagination } from "@/components/pagination";
import { AcceptedPaymentMethods } from "@/components/payment/accepted-payment-methods";
import { StoreHeader, type StoreHeaderData } from "@/components/store/store-header";
import { StoreListingFilters, StoreSortMenu } from "@/components/store/store-listing-filters";
import { StoreOwnerNotice } from "@/components/store/store-owner-notice";
import { StoreAboutSection, StoreSectionLinks, type StoreAbout } from "@/components/store/store-sections";
import { StripCurrent } from "@/components/strip-current";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice, NoticeIcon, noticeClassName } from "@/components/ui/notice";
import { getCurrentUser } from "@/lib/auth/session";
import type { CatalogScope } from "@/lib/catalog-filters";
import { DISCOVERABLE_STOCK_FILTER, type ListingCardData, type ListingFilters } from "@/lib/listings";
import { assistedCommerceEnabled, readPublicPaymentMethods, type PublicPaymentMethod } from "@/lib/payment-methods";
import { LISTINGS_PAGE_SIZE, getPageRedirect, pageHref, parsePage } from "@/lib/pagination";
import { buildStoreJsonLd, buildStoreMetadata } from "@/lib/seo";
import { NOINDEX_FOLLOW_ROBOTS, NOINDEX_ROBOTS } from "@/lib/site";
import {
  hasSupabaseAuthCookie,
  publicStoreLocation,
  storeCategoryChips,
  storeFilterParams,
  storeFiltersActive,
  storeListingFilters,
  withoutPrivateStoreFields,
  type PublicStoreLocation,
  type StoreCategoryCount,
  type StoreStatus,
} from "@/lib/store-storefront";
import { getPublicSupabaseClient, warnMissingSupabaseEnv } from "@/lib/supabase/public-client";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";
import { readPublicReputation, type PublicReputation } from "@/lib/transactions";

export const dynamic = "force-dynamic";

type StorePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
  params: Promise<{
    slug: string;
  }>;
};

type StoreData = StoreHeaderData & StoreAbout;

// The row as read: the public fields plus what the server needs and never renders (status, owner, and the address
// with its consent flag, which only publicStoreLocation reads).
type StoreRow = StoreData & {
  status: StoreStatus;
  owner_user_id: string | null;
  show_address: boolean;
  address: string | null;
  opening_hours: string | null;
};

// The store page's own grid (UX-4 § Store page): the catalog card without a sidebar, two columns on phones, three
// from 768 px, four from 1024 px and five from 1280 px.
const STORE_GRID = "grid grid-cols-2 gap-x-3 gap-y-6 md:grid-cols-3 md:gap-x-5 md:gap-y-8 lg:grid-cols-4 xl:grid-cols-5";
const STORE_GRID_SIZES = "(max-width: 767px) 50vw, (max-width: 1023px) 33vw, (max-width: 1279px) 25vw, 270px";

const STORE_LISTING_SELECT = `
  id,
  title,
  slug,
  category,
  brand,
  model,
  condition,
  price_pen,
  instrument_type,
  attributes,
  published_at,
  view_count,
  city,
  region,
  seller_type,
  stock_state,
  created_at,
  stores (
    name,
    slug,
    status,
    is_verified
  ),
  photo_count:listing_photo_count,
  listing_photos (
    id,
    listing_id,
    image_url,
    alt_text,
    sort_order
  )
`;

const STORE_SELECT = `
  id,
  name,
  slug,
  status,
  owner_user_id,
  description,
  city,
  district,
  region,
  show_address,
  address,
  opening_hours,
  whatsapp_phone,
  logo_url,
  banner_url,
  is_verified,
  created_at,
  instagram_url,
  facebook_url,
  tiktok_url,
  website_url,
  store_photos (
    id,
    image_url,
    alt_text,
    sort_order
  )
`;

type PublicSupabaseClient = NonNullable<ReturnType<typeof getPublicSupabaseClient>>;

// `countOnly` asks for the exact count and no rows; page queries ask for rows only. find-14: the category and brand
// filters narrow both parts the same way the catalog does (category exact, brand contains).
function storeListingsQuery(supabase: PublicSupabaseClient, storeId: string, filters: ListingFilters, outOfStock: boolean, countOnly = false) {
  let query = supabase
    .from("listings")
    .select(STORE_LISTING_SELECT, countOnly ? { count: "exact", head: true } : undefined)
    .eq("status", "approved")
    .eq("store_id", storeId);
  if (filters.category) query = query.eq("category", filters.category);
  if (filters.brand) query = query.ilike("brand", `%${filters.brand}%`);
  return outOfStock ? query.eq("stock_state", "out_of_stock") : query.or(DISCOVERABLE_STOCK_FILTER);
}

// The store keeps its whole range visible: listings with units (or without inventory) first, then the out-of-stock
// ones labeled "Agotado" (docs/store-operations/design.md §5.2), each part in the chosen order (newest first unless
// the visitor sorts by price). One numbered sequence over both parts.
async function loadStoreListings(supabase: PublicSupabaseClient, storeId: string, filters: ListingFilters, page: number) {
  const [available, outOfStock] = await Promise.all([
    storeListingsQuery(supabase, storeId, filters, false, true),
    storeListingsQuery(supabase, storeId, filters, true, true),
  ]);
  const countError = available.error ?? outOfStock.error;
  if (countError) return { data: null, count: null, error: countError };
  const availableCount = available.count ?? 0;
  const count = availableCount + (outOfStock.count ?? 0);
  const from = (page - 1) * LISTINGS_PAGE_SIZE;
  const to = Math.min(page * LISTINGS_PAGE_SIZE, count) - 1;
  if (from >= count) return { data: [], count, error: null };

  const parts = [];
  if (from < availableCount) parts.push(storeListingsPage(storeListingsQuery(supabase, storeId, filters, false), filters, from, Math.min(to, availableCount - 1)));
  if (to >= availableCount) parts.push(storeListingsPage(storeListingsQuery(supabase, storeId, filters, true), filters, Math.max(from - availableCount, 0), to - availableCount));
  const results = await Promise.all(parts);
  const error = results.find((result) => result.error)?.error ?? null;
  return error ? { data: null, count: null, error } : { data: results.flatMap((result) => result.data ?? []), count, error: null };
}

function storeListingsPage(query: ReturnType<typeof storeListingsQuery>, filters: ListingFilters, from: number, to: number) {
  const ordered =
    filters.sort === "price_asc" || filters.sort === "price_desc"
      ? query.order("price_pen", { ascending: filters.sort === "price_asc", nullsFirst: false }).order("created_at", { ascending: false })
      : query.order("created_at", { ascending: false });
  return ordered
    .order("sort_order", { foreignTable: "listing_photos", ascending: true })
    .limit(1, { foreignTable: "listing_photos" })
    .order("id")
    .range(from, to)
    .returns<ListingCardData[]>();
}

// The categories the store has (find-14), through the same client as its listings; null when the call failed.
async function loadStoreCategories(supabase: PublicSupabaseClient, storeId: string) {
  const { data, error } = await supabase.rpc("get_store_listing_categories", { p_store_id: storeId });
  if (error) return null;
  return storeCategoryChips((data ?? []) as StoreCategoryCount[]);
}

const loadActiveStore = cache(async (slug: string) => {
  const supabase = getPublicSupabaseClient();
  if (!supabase) return { data: null, error: null };
  return supabase
    .from("stores")
    .select(STORE_SELECT)
    .eq("status", "active")
    .eq("slug", slug)
    .order("sort_order", { foreignTable: "store_photos", ascending: true })
    .maybeSingle<StoreRow>();
});

// The signed-in visitor's id, or null. Anonymous visitors carry no Supabase auth cookie, so they cost no auth call.
const getViewerId = cache(async () => {
  const cookieStore = await cookies();
  if (!hasSupabaseAuthCookie(cookieStore.getAll().map((cookie) => cookie.name))) return null;
  return (await getCurrentUser())?.id ?? null;
});

// shop-04: the owner's own store while it is not active (in review, rejected or hidden), read with the owner's session
// (row-level security: "Store owners can read own stores"). Never the service role: for anyone else it finds nothing.
const loadOwnedStore = cache(async (slug: string) => {
  const viewerId = await getViewerId();
  if (!viewerId) return null;
  const supabase = await getSupabaseServerClient();
  if (!supabase) return null;
  const { data } = await supabase
    .from("stores")
    .select(STORE_SELECT)
    .eq("slug", slug)
    .eq("owner_user_id", viewerId)
    .order("sort_order", { foreignTable: "store_photos", ascending: true })
    .maybeSingle<StoreRow>();
  return data ? { store: data, supabase: supabase as unknown as PublicSupabaseClient } : null;
});

export async function generateMetadata({ params, searchParams }: StorePageProps): Promise<Metadata> {
  const { slug } = await params;
  const resolved = await searchParams;
  const { data: store } = await loadActiveStore(slug);
  if (!store) {
    const owned = await loadOwnedStore(slug);
    // The preview is never indexed and names no store to anyone else.
    if (owned) return { title: `Vista previa de ${owned.store.name}`, robots: NOINDEX_ROBOTS };
    return { title: "Tienda no disponible", robots: NOINDEX_ROBOTS };
  }
  // A filtered store page (find-14) stays out of the index, like the catalog's filtered URLs; its canonical is the
  // store page itself.
  if (storeFiltersActive(storeListingFilters(resolved))) return { ...buildStoreMetadata(store, 1), robots: NOINDEX_FOLLOW_ROBOTS };
  return buildStoreMetadata(store, parsePage(resolved.page));
}

export default async function StorePage({
  params,
  searchParams,
}: StorePageProps) {
  const { slug } = await params;
  const resolved = await searchParams;
  const page = parsePage(resolved.page);
  const filters = storeListingFilters(resolved);
  const supabase = getPublicSupabaseClient();

  if (!supabase) {
    return <SupabaseSetupMessage />;
  }

  const { data: activeStore, error: storeError } = await loadActiveStore(slug);
  // Everyone but the owner gets the same 404 for a store that is not active.
  const owned = !activeStore && !storeError ? await loadOwnedStore(slug) : null;
  const row = activeStore ?? owned?.store ?? null;
  if (!row) notFound();

  const preview = !activeStore;
  const viewerId = preview ? null : await getViewerId();
  const isOwner = preview || (viewerId !== null && row.owner_user_id === viewerId);
  // The preview reads the owner's own approved listings with their session; the public page reads public rows only.
  const listingClient = owned?.supabase ?? supabase;
  const path = `/tiendas/${slug}`;

  const [{ data, count, error }, categories] = await Promise.all([
    loadStoreListings(listingClient, row.id, filters, page),
    loadStoreCategories(listingClient, row.id),
  ]);

  const redirectPage = getPageRedirect(page, count, error);
  if (redirectPage !== null) redirect(pageHref(path, storeFilterParams(filters), redirectPage));
  const listings = (data ?? []) as ListingCardData[];
  const filtered = storeFiltersActive(filters);
  // The header's "N publicaciones" is the whole store: with a filter on, the categories' counts add up to it.
  const storeTotal = filtered ? (categories ? categories.reduce((sum, chip) => sum + chip.count, 0) : null) : error ? null : count ?? 0;
  // A failed reputation call leaves the reviews and the rating out instead of claiming there are none.
  const reputationResult = await supabase.rpc("get_public_reputation", {
    p_subject_store_id: row.id,
    p_limit: 5,
  });
  const reputation = reputationResult.error ? null : readPublicReputation(reputationResult.data);
  // PAY-1: approved methods of a verified store, while the pilot is on; the read itself re-checks verification.
  const store = row;
  // Not in the preview: a store that is not public shows no payment methods.
  const paymentMethods = !preview && assistedCommerceEnabled() && store.is_verified
    ? readPublicPaymentMethods((await supabase.rpc("get_store_payment_methods", { p_store_id: store.id })).data)
    : [];
  // list-12: the address leaves the server only through publicStoreLocation (only when show_address is true); the
  // rest of the row goes on without the address, its flag and the owner.
  const location = publicStoreLocation(store);
  const publicStore = { ...withoutPrivateStoreFields(store), store_photos: store.store_photos ?? [] } as StoreData;

  return (
    <>
    {preview ? null : <JsonLd data={buildStoreJsonLd(publicStore)} />}
    <StoreView
      store={publicStore}
      status={store.status}
      location={location}
      preview={preview}
      isOwner={isOwner}
      listings={listings}
      filters={filters}
      categories={categories}
      page={page}
      total={error ? null : count ?? 0}
      storeTotal={storeTotal}
      hasError={Boolean(error)}
      reputation={reputation}
      paymentMethods={paymentMethods}
    />
    </>
  );
}

// The store page (docs/ux-redesign/ux-4-listing-store.md § Store page, L16–L20): the compact header, the section
// links, "Publicaciones" in the catalog grid with numbered pages (REL-002), then "Reseñas" and "Sobre la tienda" side
// by side from 1024 px. Every section is on the page. find-14 (docs/ux-effortless/stores.md) replaces L16's "no
// in-store search, chips or sort": "Publicaciones" has the catalog's category chips (only the store's categories),
// brand box and sort, all in the URL. shop-04: the owner sees a notice with "Editar perfil", and before approval the
// page is a private preview (noindex, no visit or contact recorded, no report link).
function StoreView({
  store,
  status,
  location,
  preview,
  isOwner,
  listings,
  filters,
  categories,
  page,
  total,
  storeTotal,
  hasError,
  reputation,
  paymentMethods,
}: {
  store: StoreData;
  status: StoreStatus;
  location: PublicStoreLocation;
  preview: boolean;
  isOwner: boolean;
  listings: ListingCardData[];
  filters: ListingFilters;
  categories: ReturnType<typeof storeCategoryChips> | null;
  page: number;
  // Listings matching the filters; null when the query failed.
  total: number | null;
  // Every published listing of the store; null when unknown.
  storeTotal: number | null;
  hasError: boolean;
  reputation: PublicReputation | null;
  paymentMethods: PublicPaymentMethod[];
}) {
  const rating =
    reputation && reputation.review_count > 0 && reputation.average_rating !== null
      ? { average: reputation.average_rating, count: reputation.review_count }
      : null;
  const path = `/tiendas/${store.slug}`;
  const scope: CatalogScope = { path };
  const filtered = storeFiltersActive(filters);
  // The controls show once there is something to narrow, and stay while a filter is on (so it can be removed).
  const showControls = filtered || (storeTotal ?? total ?? 0) > 0;
  return (
    <>
      {preview ? null : <StoreVisitTelemetry storeId={store.id} />}
      {store.is_verified && !preview ? <StripCurrent value="verified_stores" /> : null}
      {isOwner ? <StoreOwnerNotice status={status} /> : null}
      <StoreHeader store={store} total={storeTotal} rating={rating} location={location} preview={preview} />
      <StoreSectionLinks total={storeTotal} reviews={reputation ? reputation.review_count : null} />
      <PageContainer as="section" className="grid gap-10 pb-12 pt-6 lg:gap-14 lg:pt-8">
        <CatalogNavigation>
          <section id="publicaciones" aria-labelledby="publicaciones-titulo" className="scroll-mt-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="publicaciones-titulo" className="t-section text-ink">
                Publicaciones{total !== null ? <span className="ml-2 t-meta tabular-nums">{total}</span> : null}
              </h2>
              {showControls ? <StoreSortMenu filters={filters} scope={scope} /> : null}
            </div>
            {showControls ? <StoreListingFilters filters={filters} scope={scope} categories={categories} /> : null}
            <CatalogResults className="mt-4">
              {hasError ? (
                <Notice tone="danger" role="alert">
                  No se pudieron cargar las publicaciones. Intenta nuevamente.
                </Notice>
              ) : listings.length > 0 ? (
                <div className={STORE_GRID}>
                  {listings.map((listing) => (
                    <ListingCard key={listing.id} listing={listing} source="store" headingLevel={3} sizes={STORE_GRID_SIZES} />
                  ))}
                </div>
              ) : filtered ? (
                <EmptyState
                  headingLevel={3}
                  title="No encontramos publicaciones con esos filtros"
                  description="Prueba otra categoría u otra marca, o mira todo lo que tiene la tienda."
                  actions={
                    <CatalogLink href={path} className={buttonClasses({ variant: "secondary" })}>
                      Ver todas sus publicaciones
                    </CatalogLink>
                  }
                />
              ) : preview ? (
                <EmptyState
                  headingLevel={3}
                  title="Aún no tienes publicaciones aprobadas"
                  description="Aquí aparecerán tus publicaciones cuando Laria las apruebe. Las que están en revisión no se muestran en tu página."
                />
              ) : (
                <EmptyState
                  headingLevel={3}
                  title="Esta tienda aún no tiene publicaciones"
                  description="Vuelve pronto para revisar sus instrumentos aprobados."
                />
              )}
            </CatalogResults>
            {!hasError && total !== null ? (
              <div className="mt-6">
                <Pagination page={page} total={total} path={path} params={storeFilterParams(filters)} />
              </div>
            ) : null}
          </section>
        </CatalogNavigation>

        <div className="grid gap-10 lg:grid-cols-2 lg:gap-12">
          <ReputationSection reputation={reputation} title={`Reseñas de ${store.name}`} className="min-w-0" />
          <div className="grid min-w-0 content-start gap-6">
            <StoreAboutSection store={store} location={location} preview={preview} className="min-w-0" />
            <AcceptedPaymentMethods methods={paymentMethods} />
          </div>
        </div>
      </PageContainer>
    </>
  );
}

function SupabaseSetupMessage() {
  warnMissingSupabaseEnv();
  return (
    <PageContainer as="section" className="py-8">
      <div className={noticeClassName("warning", "max-w-3xl p-5")}>
        <NoticeIcon tone="warning" />
        <div>
          <h1 className="t-section text-ink">
            Esta tienda no está disponible por ahora
          </h1>
          <p className="mt-2">
            Intenta nuevamente en unos minutos.
          </p>
        </div>
      </div>
    </PageContainer>
  );
}
