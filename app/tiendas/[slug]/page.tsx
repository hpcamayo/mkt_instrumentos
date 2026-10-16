import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { cache } from "react";
import { JsonLd } from "@/components/json-ld";
import { ListingCard } from "@/components/listing-card";
import { ReputationSection } from "@/components/listing/reputation-section";
import { StoreVisitTelemetry } from "@/components/marketplace-telemetry";
import { PageContainer } from "@/components/page-container";
import { Pagination } from "@/components/pagination";
import { AcceptedPaymentMethods } from "@/components/payment/accepted-payment-methods";
import { StoreHeader, type StoreHeaderData } from "@/components/store/store-header";
import { StoreAboutSection, StoreSectionLinks, type StoreAbout } from "@/components/store/store-sections";
import { StripCurrent } from "@/components/strip-current";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice, NoticeIcon, noticeClassName } from "@/components/ui/notice";
import { DISCOVERABLE_STOCK_FILTER, type ListingCardData } from "@/lib/listings";
import { assistedCommerceEnabled, readPublicPaymentMethods, type PublicPaymentMethod } from "@/lib/payment-methods";
import { LISTINGS_PAGE_SIZE, getPageRedirect, pageHref, parsePage } from "@/lib/pagination";
import { buildStoreJsonLd, buildStoreMetadata } from "@/lib/seo";
import { NOINDEX_ROBOTS } from "@/lib/site";
import { getPublicSupabaseClient, warnMissingSupabaseEnv } from "@/lib/supabase/public-client";
import { readPublicReputation, type PublicReputation } from "@/lib/transactions";

export const dynamic = "force-dynamic";

type StorePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
  params: Promise<{
    slug: string;
  }>;
};

type StoreData = StoreHeaderData & StoreAbout;

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

type PublicSupabaseClient = NonNullable<ReturnType<typeof getPublicSupabaseClient>>;

// `countOnly` asks for the exact count and no rows; page queries ask for rows only.
function storeListingsQuery(supabase: PublicSupabaseClient, storeId: string, outOfStock: boolean, countOnly = false) {
  const query = supabase
    .from("listings")
    .select(STORE_LISTING_SELECT, countOnly ? { count: "exact", head: true } : undefined)
    .eq("status", "approved")
    .eq("store_id", storeId);
  return outOfStock ? query.eq("stock_state", "out_of_stock") : query.or(DISCOVERABLE_STOCK_FILTER);
}

// The store keeps its whole range visible: listings with units (or without inventory) first, newest first, then the
// out-of-stock ones labeled "Agotado" (docs/store-operations/design.md §5.2). One numbered sequence over both parts.
async function loadStoreListings(supabase: PublicSupabaseClient, storeId: string, page: number) {
  const [available, outOfStock] = await Promise.all([
    storeListingsQuery(supabase, storeId, false, true),
    storeListingsQuery(supabase, storeId, true, true),
  ]);
  const countError = available.error ?? outOfStock.error;
  if (countError) return { data: null, count: null, error: countError };
  const availableCount = available.count ?? 0;
  const count = availableCount + (outOfStock.count ?? 0);
  const from = (page - 1) * LISTINGS_PAGE_SIZE;
  const to = Math.min(page * LISTINGS_PAGE_SIZE, count) - 1;
  if (from >= count) return { data: [], count, error: null };

  const parts = [];
  if (from < availableCount) parts.push(storeListingsPage(storeListingsQuery(supabase, storeId, false), from, Math.min(to, availableCount - 1)));
  if (to >= availableCount) parts.push(storeListingsPage(storeListingsQuery(supabase, storeId, true), Math.max(from - availableCount, 0), to - availableCount));
  const results = await Promise.all(parts);
  const error = results.find((result) => result.error)?.error ?? null;
  return error ? { data: null, count: null, error } : { data: results.flatMap((result) => result.data ?? []), count, error: null };
}

function storeListingsPage(query: ReturnType<typeof storeListingsQuery>, from: number, to: number) {
  return query
    .order("created_at", { ascending: false })
    .order("sort_order", { foreignTable: "listing_photos", ascending: true })
    .limit(1, { foreignTable: "listing_photos" })
    .order("id")
    .range(from, to)
    .returns<ListingCardData[]>();
}

const loadActiveStore = cache(async (slug: string) => {
  const supabase = getPublicSupabaseClient();
  if (!supabase) return { data: null, error: null };
  return supabase
    .from("stores")
    .select(
      `
        id,
        name,
        slug,
        description,
        city,
        district,
        region,
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
      `,
    )
    .eq("status", "active")
    .eq("slug", slug)
    .order("sort_order", { foreignTable: "store_photos", ascending: true })
    .maybeSingle<StoreData>();
});

export async function generateMetadata({ params, searchParams }: StorePageProps): Promise<Metadata> {
  const { slug } = await params;
  const { data: store } = await loadActiveStore(slug);
  if (!store) return { title: "Tienda no disponible", robots: NOINDEX_ROBOTS };
  return buildStoreMetadata(store, parsePage((await searchParams).page));
}

export default async function StorePage({
  params,
  searchParams,
}: StorePageProps) {
  const { slug } = await params;
  const page = parsePage((await searchParams).page);
  const supabase = getPublicSupabaseClient();

  if (!supabase) {
    return <SupabaseSetupMessage />;
  }

  const { data: store, error: storeError } = await loadActiveStore(slug);

  if (storeError || !store) {
    notFound();
  }

  const { data, count, error } = await loadStoreListings(supabase, store.id, page);

  const redirectPage = getPageRedirect(page, count, error);
  if (redirectPage !== null)
    redirect(pageHref(`/tiendas/${slug}`, {}, redirectPage));
  const listings = (data ?? []) as ListingCardData[];
  // A failed reputation call leaves the reviews and the rating out instead of claiming there are none.
  const reputationResult = await supabase.rpc("get_public_reputation", {
    p_subject_store_id: store.id,
    p_limit: 5,
  });
  const reputation = reputationResult.error ? null : readPublicReputation(reputationResult.data);
  // PAY-1: approved methods of a verified store, while the pilot is on; the read itself re-checks verification.
  const paymentMethods = assistedCommerceEnabled() && store.is_verified
    ? readPublicPaymentMethods((await supabase.rpc("get_store_payment_methods", { p_store_id: store.id })).data)
    : [];

  return (
    <>
    <JsonLd data={buildStoreJsonLd(store)} />
    <StoreView
      store={{ ...store, store_photos: store.store_photos ?? [] } as StoreData}
      listings={listings}
      page={page}
      total={error ? null : count ?? 0}
      hasError={Boolean(error)}
      reputation={reputation}
      paymentMethods={paymentMethods}
    />
    </>
  );
}

// The store page (docs/ux-redesign/ux-4-listing-store.md § Store page, L16–L20): the compact header, the section
// links, "Publicaciones" in the catalog grid with numbered pages (REL-002), then "Reseñas" and "Sobre la tienda" side
// by side from 1024 px. Every section is on the page; no in-store search, chips or sort.
function StoreView({
  store,
  listings,
  page,
  total,
  hasError,
  reputation,
  paymentMethods,
}: {
  store: StoreData;
  listings: ListingCardData[];
  page: number;
  total: number | null;
  hasError: boolean;
  reputation: PublicReputation | null;
  paymentMethods: PublicPaymentMethod[];
}) {
  const rating =
    reputation && reputation.review_count > 0 && reputation.average_rating !== null
      ? { average: reputation.average_rating, count: reputation.review_count }
      : null;
  return (
    <>
      <StoreVisitTelemetry storeId={store.id} />
      {store.is_verified ? <StripCurrent value="verified_stores" /> : null}
      <StoreHeader store={store} total={total} rating={rating} />
      <StoreSectionLinks total={total} reviews={reputation ? reputation.review_count : null} />
      <PageContainer as="section" className="grid gap-10 pb-12 pt-6 lg:gap-14 lg:pt-8">
        <section id="publicaciones" aria-labelledby="publicaciones-titulo" className="scroll-mt-4">
          <h2 id="publicaciones-titulo" className="t-section text-ink">
            Publicaciones{total !== null ? <span className="ml-2 t-meta tabular-nums">{total}</span> : null}
          </h2>
          <div className="mt-4">
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
            ) : (
              <EmptyState
                headingLevel={3}
                title="Esta tienda aún no tiene publicaciones"
                description="Vuelve pronto para revisar sus instrumentos aprobados."
              />
            )}
          </div>
          {!hasError && total !== null ? (
            <div className="mt-6">
              <Pagination page={page} total={total} path={`/tiendas/${store.slug}`} />
            </div>
          ) : null}
        </section>

        <div className="grid gap-10 lg:grid-cols-2 lg:gap-12">
          <ReputationSection reputation={reputation} title={`Reseñas de ${store.name}`} className="min-w-0" />
          <div className="grid min-w-0 content-start gap-6">
            <StoreAboutSection store={store} className="min-w-0" />
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
